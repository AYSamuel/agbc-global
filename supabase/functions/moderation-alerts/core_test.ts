import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';

import { buildDigests, type AlertRow } from './core.ts';

const NOW = new Date('2026-08-06T12:00:00Z');

const OPTIONS = {
  from: 'AGBC <alerts@agbcglobal.com>',
  dashboardUrl: 'https://dashboard.agbcglobal.com',
  now: NOW,
};

function row(overrides: Partial<AlertRow> = {}): AlertRow {
  return {
    recipient_id: 'leader-1',
    recipient_email: 'grace@example.test',
    recipient_name: 'Grace Bello',
    recipient_role: 'leader',
    kind: 'queue_new',
    subject: 'testimony:t1',
    item_kind: 'testimony',
    branch_id: 'branch-1',
    branch_name: 'AGBC Glasgow',
    waiting_since: '2026-08-06T09:00:00Z',
    is_safeguarding: false,
    ...overrides,
  };
}

Deno.test('nothing waiting sends nothing', () => {
  assertEquals(buildDigests([], OPTIONS), []);
});

Deno.test('one email per recipient, however many things are waiting', () => {
  const digests = buildDigests(
    [
      row({ subject: 'testimony:t1' }),
      row({ subject: 'prayer:p1', item_kind: 'prayer' }),
      row({
        recipient_id: 'admin-1',
        recipient_email: 'ayo@example.test',
        recipient_name: 'Ayo',
        recipient_role: 'admin',
        kind: 'queue_overdue',
        subject: 'testimony:t9',
      }),
    ],
    OPTIONS,
  );

  assertEquals(digests.length, 2);
  assertEquals(digests[0].email.to, 'grace@example.test');
  assertEquals(digests[0].entries.length, 2);
  assertEquals(digests[1].email.to, 'ayo@example.test');
});

Deno.test('the ledger entries are exactly what was announced', () => {
  const [digest] = buildDigests([row({ subject: 'prayer:p1' })], OPTIONS);
  assertEquals(digest.entries, [
    { recipient_id: 'leader-1', kind: 'queue_new', subject: 'prayer:p1' },
  ]);
});

Deno.test('the subject counts what is waiting, and names it', () => {
  const [posts] = buildDigests(
    [row({ subject: 'testimony:t1' }), row({ subject: 'testimony:t2' })],
    OPTIONS,
  );
  assertEquals(
    posts.email.subject,
    'AGBC dashboard: 2 posts waiting for review',
  );

  const [reports] = buildDigests(
    [row({ kind: 'report_new', item_kind: 'report', subject: 'report:r1' })],
    OPTIONS,
  );
  assertEquals(
    reports.email.subject,
    'AGBC dashboard: 1 report waiting for review',
  );

  const [mixed] = buildDigests(
    [
      row({ subject: 'testimony:t1' }),
      row({ kind: 'report_new', item_kind: 'report', subject: 'report:r1' }),
    ],
    OPTIONS,
  );
  assertEquals(
    mixed.email.subject,
    'AGBC dashboard: 2 items waiting for review',
  );
});

Deno.test('an escalation takes over the subject, and counts only the late ones', () => {
  const [digest] = buildDigests(
    [
      row({ subject: 'testimony:t1' }),
      row({
        kind: 'queue_overdue',
        subject: 'testimony:t2',
        waiting_since: '2026-08-01T09:00:00Z',
      }),
    ],
    OPTIONS,
  );

  assertEquals(
    digest.email.subject,
    'AGBC dashboard: 1 post waiting more than 48 hours',
  );
  // Both still appear in the body: the escalation is the headline, not the whole story.
  assertStringIncludes(digest.email.text, '1 post waiting more than 48 hours');
  assertStringIncludes(digest.email.text, '1 post waiting for review');
});

// Found in the first live run rather than by reasoning: an admin is the fallback moderator for
// a leaderless branch AND the recipient of every escalation, so one old post reached them
// twice and the email counted it as two.
Deno.test('one item escalated to the same reader is one line, not two', () => {
  const [digest] = buildDigests(
    [
      row({
        recipient_id: 'admin-1',
        kind: 'queue_new',
        subject: 'prayer:p1',
        item_kind: 'prayer',
        waiting_since: '2026-08-03T12:00:00Z',
      }),
      row({
        recipient_id: 'admin-1',
        kind: 'queue_overdue',
        subject: 'prayer:p1',
        item_kind: 'prayer',
        waiting_since: '2026-08-03T12:00:00Z',
      }),
    ],
    OPTIONS,
  );

  assertEquals(
    digest.email.subject,
    'AGBC dashboard: 1 post waiting more than 48 hours',
  );
  assert(!digest.email.text.includes('waiting for review'));
  // Both are still recorded: this reader has now been told, under both headings.
  assertEquals(digest.entries.length, 2);
});

Deno.test('a safeguarding flag is said first and said plainly', () => {
  const [digest] = buildDigests(
    [
      row({ subject: 'testimony:t1' }),
      row({
        kind: 'report_new',
        item_kind: 'report',
        subject: 'report:r1',
        is_safeguarding: true,
      }),
    ],
    OPTIONS,
  );

  const lines = digest.email.text.split('\n');
  const flagged = lines.findIndex((line) => line.includes('safeguarding'));
  const waiting = lines.findIndex((line) => line.includes('Waiting for you'));
  assert(flagged > 0 && flagged < waiting, 'the flag comes before the list');
});

Deno.test('the age shown is the oldest in the group, in whole units', () => {
  const [digest] = buildDigests(
    [
      row({ subject: 'testimony:t1', waiting_since: '2026-08-06T11:30:00Z' }),
      row({ subject: 'testimony:t2', waiting_since: '2026-08-03T12:00:00Z' }),
    ],
    OPTIONS,
  );
  assertStringIncludes(digest.email.text, 'oldest 3 days');

  const [minutes] = buildDigests(
    [row({ waiting_since: '2026-08-06T11:59:10Z' })],
    OPTIONS,
  );
  assertStringIncludes(minutes.email.text, 'oldest 0 minutes');

  const [hour] = buildDigests(
    [row({ waiting_since: '2026-08-06T11:00:00Z' })],
    OPTIONS,
  );
  assertStringIncludes(hour.email.text, 'oldest 1 hour');
});

Deno.test('branches are named, and stop being listed past three', () => {
  const [one] = buildDigests([row()], OPTIONS);
  assertStringIncludes(one.email.text, '(AGBC Glasgow)');

  const [many] = buildDigests(
    ['Glasgow', 'Berlin', 'Emmen', 'Ogbomosho'].map((name, index) =>
      row({ subject: `testimony:t${index}`, branch_name: `AGBC ${name}` }),
    ),
    OPTIONS,
  );
  assertStringIncludes(
    many.email.text,
    '(AGBC Glasgow, AGBC Berlin, AGBC Emmen and 1 more)',
  );
});

Deno.test('the links point only at the queues this digest is about', () => {
  const [posts] = buildDigests([row()], OPTIONS);
  assertStringIncludes(
    posts.email.text,
    'Moderation queue: https://dashboard.agbcglobal.com/moderation',
  );
  assert(!posts.email.text.includes('/reports'), 'no link to an empty inbox');

  const [reports] = buildDigests(
    [row({ kind: 'report_new', item_kind: 'report', subject: 'report:r1' })],
    OPTIONS,
  );
  assertStringIncludes(
    reports.email.text,
    'Reports: https://dashboard.agbcglobal.com/reports',
  );
  assert(!reports.email.text.includes('/moderation'));
});

Deno.test('a deployment with no dashboard URL still says something useful', () => {
  const [digest] = buildDigests([row()], { ...OPTIONS, dashboardUrl: null });
  assertStringIncludes(digest.email.text, 'Open the AGBC dashboard');
  assert(!digest.email.text.includes('http'));
});

Deno.test('a trailing slash on the dashboard URL does not double up', () => {
  const [digest] = buildDigests([row()], {
    ...OPTIONS,
    dashboardUrl: 'https://dashboard.agbcglobal.com/',
  });
  assertStringIncludes(
    digest.email.text,
    'https://dashboard.agbcglobal.com/moderation',
  );
});

Deno.test('a member with no display name is still greeted', () => {
  const [digest] = buildDigests([row({ recipient_name: '' })], OPTIONS);
  assertStringIncludes(digest.email.text, 'Hello,');
});

// The rule this whole email is shaped by (docs/spec/20). The batch does not return bodies, so
// this is a guard against a future "just the first line so they know what it is about".
Deno.test('the whole email is counts, ages and places: never content', () => {
  const [digest] = buildDigests(
    [
      row({ subject: 'testimony:t1' }),
      row({
        kind: 'report_new',
        item_kind: 'report',
        subject: 'report:r1',
        is_safeguarding: true,
        waiting_since: '2026-08-06T10:00:00Z',
      }),
    ],
    OPTIONS,
  );

  assertEquals(
    digest.email.text,
    [
      'Hello Grace,',
      '',
      'One of the reports below is flagged as a safeguarding concern. Please open that one first.',
      '',
      'Waiting for you in the AGBC dashboard:',
      '',
      '  - 1 report to look at, oldest 2 hours (AGBC Glasgow)',
      '  - 1 post waiting for review, oldest 3 hours (AGBC Glasgow)',
      '',
      'Moderation queue: https://dashboard.agbcglobal.com/moderation',
      'Reports: https://dashboard.agbcglobal.com/reports',
      '',
      'This email carries no part of what was written. The words stay in the dashboard.',
    ].join('\n'),
  );
});
