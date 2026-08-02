import { afterAll, describe, expect, test } from 'vitest';

import {
  admin,
  createCaller,
  deleteCaller,
  type TestCaller,
} from '@/test/callers';

import {
  loadVerse,
  parsePaste,
  removeVerse,
  runImport,
  saveVerse,
  type ImportRow,
} from './verses';

/**
 * The parser, and what the database does with what it produces.
 *
 * Two halves on purpose. `parsePaste` is pure and gets ordinary unit tests: it is the one
 * piece of import logic that lives in this app rather than in Postgres, and a comma inside
 * a verse is the case it exists for. Everything else runs against the REAL local stack,
 * because the claim worth checking is "a leader cannot change the schedule", and a mocked
 * client would only ever prove that this file agrees with the mock.
 *
 * Every verse written here is dated 2099, well outside `daily_verse_depth()`'s 400-day
 * horizon, so a run cannot move the numbers another test or a developer's screen is
 * reading.
 */

const minted: TestCaller[] = [];

async function caller(
  ...args: Parameters<typeof createCaller>
): Promise<TestCaller> {
  const created = await createCaller(...args);
  minted.push(created);
  return created;
}

afterAll(async () => {
  await admin().from('daily_verses').delete().gte('date', '2099-01-01');
  await Promise.all(minted.map(deleteCaller));
});

function rowsFor(date: string, language = 'en'): ImportRow[] {
  return [
    {
      line: 2,
      date,
      language,
      reference: 'Psalm 23:1',
      text: 'The Lord is my shepherd; I shall lack nothing.',
      translation: 'WEB',
    },
  ];
}

describe('reading a pasted spreadsheet', () => {
  test('a comma inside a quoted verse is part of the verse, not a new column', () => {
    const [row] = parsePaste(
      'date,language,reference,text,translation\n' +
        '2026-08-14,en,Psalm 23:1,"The Lord is my shepherd, I shall not want",WEB',
    );

    // Without quoted-field handling this verse becomes six columns and the row is
    // rejected for a reason that would look absurd to the person who pasted it.
    expect(row.text).toBe('The Lord is my shepherd, I shall not want');
    expect(row.translation).toBe('WEB');
    // 1-based and counting the header, so it matches what they see in their own file.
    expect(row.line).toBe(2);
  });

  test('a doubled quote inside a quoted field is one literal quote', () => {
    const [row] = parsePaste(
      'date,language,reference,text\n' +
        '2026-08-14,en,John 10:11,"He said ""I am the good shepherd"" to them"',
    );

    expect(row.text).toBe('He said "I am the good shepherd" to them');
  });

  test('a tab-separated paste is not read as commas, verse commas and all', () => {
    // What a spreadsheet selection actually pastes as. The delimiter is decided by the
    // HEADER line, so a German reference like "Psalm 23,1" cannot vote for the wrong one.
    const [row] = parsePaste(
      'date\tlanguage\treference\ttext\ttranslation\n' +
        '2026-08-14\tde\tPsalm 23,1\tDer HERR ist mein Hirte, mir wird nichts mangeln.\tWEB',
    );

    expect(row.reference).toBe('Psalm 23,1');
    expect(row.text).toBe('Der HERR ist mein Hirte, mir wird nichts mangeln.');
  });

  test('the columns may be in any order, because the header names them', () => {
    const [row] = parsePaste(
      'text,date,reference,language\n' +
        'The Lord is my shepherd,2026-08-14,Psalm 23:1,nl',
    );

    expect(row).toMatchObject({
      date: '2026-08-14',
      language: 'nl',
      reference: 'Psalm 23:1',
      text: 'The Lord is my shepherd',
    });
    // No translation column: left empty here and defaulted to WEB by the database, which
    // is where the table's own default lives.
    expect(row.translation).toBe('');
  });

  test('a paste with no header is read in the canonical order rather than dropped', () => {
    const rows = parsePaste('2026-08-14,en,Psalm 23:1,The Lord is my shepherd');

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      line: 1,
      date: '2026-08-14',
      language: 'en',
    });
  });

  test('blank lines are not rows', () => {
    expect(parsePaste('\n\n   \n')).toEqual([]);
  });
});

describe('who may change the schedule', () => {
  test('a leader is refused by the database, not by the screen', async () => {
    const leader = await caller({ role: 'leader' });

    // The function checks its own authority and raises, rather than letting RLS turn the
    // write into a silent zero-row success (the trap ADR 0015's plan names).
    await expect(
      runImport(leader.serverClient(), rowsFor('2099-01-02'), {
        replaceExisting: false,
        dryRun: true,
      }),
    ).rejects.toThrow(/only an admin/i);
  });

  test('a leader deleting a verse changes nothing, and is told nothing changed', async () => {
    const leader = await caller({ role: 'leader' });
    const { error } = await admin().from('daily_verses').insert({
      date: '2099-01-03',
      language: 'en',
      reference: 'Psalm 23:1',
      text: 'The Lord is my shepherd.',
    });
    expect(error).toBeNull();

    // The policy makes this a successful statement that touches no row. Reporting it as
    // success is what `removeVerse` refuses to do.
    const outcome = await removeVerse(
      leader.serverClient(),
      '2099-01-03',
      'en',
    );
    expect(outcome).toEqual({ ok: false, reason: 'gone' });

    const survived = await loadVerse(leader.serverClient(), '2099-01-03', 'en');
    expect(survived?.text).toBe('The Lord is my shepherd.');
  });
});

describe('an admin keeping the schedule', () => {
  test('the preview counts, the apply writes, and the second look agrees', async () => {
    const ministryAdmin = await caller({ role: 'admin' });
    const client = ministryAdmin.serverClient();
    const rows = rowsFor('2099-02-01');

    const preview = await runImport(client, rows, {
      replaceExisting: false,
      dryRun: true,
    });
    expect(preview).toMatchObject({
      dryRun: true,
      new: 1,
      existing: 0,
      invalid: 0,
      applied: 0,
    });
    // Nothing is saved until you have seen what it will do.
    expect(await loadVerse(client, '2099-02-01', 'en')).toBeNull();

    const applied = await runImport(client, rows, {
      replaceExisting: false,
      dryRun: false,
    });
    expect(applied.applied).toBe(1);
    expect((await loadVerse(client, '2099-02-01', 'en'))?.reference).toBe(
      'Psalm 23:1',
    );

    // The same paste again is not 1 new day. This is the case the keep/replace choice
    // exists for, and the count the screen shows comes from here.
    const again = await runImport(client, rows, {
      replaceExisting: false,
      dryRun: true,
    });
    expect(again).toMatchObject({ new: 0, existing: 1 });
  });

  test('a row the parser produced but the database cannot read is reported by line', async () => {
    const ministryAdmin = await caller({ role: 'admin' });

    const preview = await runImport(
      ministryAdmin.serverClient(),
      [
        { ...rowsFor('2099-03-01')[0], line: 84, date: '2099-03-32' },
        { ...rowsFor('2099-03-02')[0], line: 119, language: 'ge' },
        { ...rowsFor('2099-03-03')[0], line: 203, text: '' },
      ],
      { replaceExisting: false, dryRun: true },
    );

    expect(preview.invalid).toBe(3);
    expect(preview.problems).toEqual([
      {
        line: 84,
        date: '2099-03-32',
        language: 'en',
        reason: 'date_impossible',
      },
      {
        line: 119,
        date: '2099-03-02',
        language: 'ge',
        reason: 'language_unknown',
      },
      { line: 203, date: '2099-03-03', language: 'en', reason: 'text_blank' },
    ]);
  });

  test('one verse goes through the same batch function, so an edit cannot validate differently', async () => {
    const ministryAdmin = await caller({ role: 'admin' });
    const client = ministryAdmin.serverClient();
    const verse = {
      date: '2099-04-01',
      language: 'de',
      reference: 'Psalm 23,1',
      text: 'Der HERR ist mein Hirte.',
      translation: 'WEB',
    };

    expect(await saveVerse(client, verse)).toEqual({ ok: true });
    // Saving onto an occupied (date, language) IS the edit, which is what the form's hint
    // promises the reader.
    expect(
      await saveVerse(client, { ...verse, text: 'mir wird nichts mangeln.' }),
    ).toEqual({ ok: true });
    expect((await loadVerse(client, '2099-04-01', 'de'))?.text).toBe(
      'mir wird nichts mangeln.',
    );

    // A date the batch would refuse is refused here too, and named as invalid rather than
    // as a failure, so the form can tell the editor to fix their text.
    expect(await saveVerse(client, { ...verse, date: '2099-04-32' })).toEqual({
      ok: false,
      reason: 'invalid',
    });

    expect(await removeVerse(client, '2099-04-01', 'de')).toEqual({ ok: true });
    // Removing what is already gone is not a success: the form reports it rather than
    // telling somebody a verse was removed twice.
    expect(await removeVerse(client, '2099-04-01', 'de')).toEqual({
      ok: false,
      reason: 'gone',
    });
  });
});
