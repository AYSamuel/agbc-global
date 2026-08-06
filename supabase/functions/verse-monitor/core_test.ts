import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';

import { buildVerseAlerts, type DepthRow } from './core.ts';

const OPTIONS = {
  from: 'AGBC <alerts@agbcglobal.com>',
  dashboardUrl: 'https://dashboard.agbcglobal.com',
};

function depth(overrides: Partial<DepthRow> = {}): DepthRow {
  return {
    recipient_id: 'admin-1',
    recipient_email: 'ayo@example.test',
    recipient_name: 'Ayo Samuel',
    subject: '2026-08-06',
    language: 'de',
    days_queued: 9,
    runs_out_on: '2026-08-15',
    stale_from: '2026-08-14',
    ...overrides,
  };
}

Deno.test('a stocked queue alerts nobody', () => {
  assertEquals(buildVerseAlerts([], OPTIONS), []);
});

Deno.test('one email per admin, listing every language that is low', () => {
  const alerts = buildVerseAlerts(
    [
      depth({ language: 'de' }),
      depth({ language: 'nl', days_queued: 3 }),
      depth({
        recipient_id: 'admin-2',
        recipient_email: 'grace@example.test',
        language: 'de',
      }),
    ],
    OPTIONS,
  );

  assertEquals(alerts.length, 2);
  assertStringIncludes(alerts[0].email.text, 'German');
  assertStringIncludes(alerts[0].email.text, 'Dutch');
  assertEquals(alerts[1].email.to, 'grace@example.test');
});

Deno.test('the ledger entry is one row per admin per day', () => {
  const [alert] = buildVerseAlerts(
    [depth({ language: 'de' }), depth({ language: 'fr', days_queued: 0 })],
    OPTIONS,
  );
  assertEquals(alert.entry, {
    recipient_id: 'admin-1',
    kind: 'verse_depth',
    subject: '2026-08-06',
  });
});

Deno.test('the subject leads with how long there is left', () => {
  const [one] = buildVerseAlerts([depth({ days_queued: 9 })], OPTIONS);
  assertEquals(one.email.subject, 'AGBC verses: The verse queue runs out in 9 days');

  const [two] = buildVerseAlerts(
    [depth({ language: 'de', days_queued: 9 }), depth({ language: 'nl', days_queued: 3 })],
    OPTIONS,
  );
  assertEquals(two.email.subject, 'AGBC verses: 2 verse queues run out in 3 days');
});

Deno.test('a language with nothing for today says so outright', () => {
  const [alert] = buildVerseAlerts(
    [depth({ language: 'fr', days_queued: 0, runs_out_on: '2026-08-06' })],
    OPTIONS,
  );
  assertEquals(alert.email.subject, 'AGBC verses: The verse queue has run out');
  assertStringIncludes(alert.email.text, 'French has no verse for today');
});

Deno.test('the line names the day, the days left, and the verse members would be stuck on', () => {
  const [alert] = buildVerseAlerts([depth()], OPTIONS);
  assertStringIncludes(
    alert.email.text,
    'German runs out on 2026-08-15 (9 days left), and members would then be left on the verse for 2026-08-14',
  );
});

Deno.test('a language with no earlier verse at all is a different sentence', () => {
  const [alert] = buildVerseAlerts(
    [depth({ language: 'fr', days_queued: 0, stale_from: null })],
    OPTIONS,
  );
  assertStringIncludes(
    alert.email.text,
    'there is no earlier verse to fall back on at all',
  );
});

// The reason this alert exists rather than a count of rows (docs/spec/22 §1).
Deno.test('the email explains why nobody will report this', () => {
  const [alert] = buildVerseAlerts([depth()], OPTIONS);
  assertStringIncludes(alert.email.text, 'does not show an error');
});

Deno.test('the link goes to the import screen, however the URL was written', () => {
  const [alert] = buildVerseAlerts([depth()], {
    ...OPTIONS,
    dashboardUrl: 'https://dashboard.agbcglobal.com/',
  });
  assertStringIncludes(
    alert.email.text,
    'https://dashboard.agbcglobal.com/verses/import',
  );

  const [offline] = buildVerseAlerts([depth()], {
    ...OPTIONS,
    dashboardUrl: null,
  });
  assertStringIncludes(offline.email.text, 'from the AGBC dashboard');
  assert(!offline.email.text.includes('http'));
});

Deno.test('an unknown language code is printed rather than swallowed', () => {
  const [alert] = buildVerseAlerts([depth({ language: 'yo' })], OPTIONS);
  assertStringIncludes(alert.email.text, 'yo runs out on');
});
