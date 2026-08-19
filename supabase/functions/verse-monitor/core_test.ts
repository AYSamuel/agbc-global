import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';

import type { OutgoingEmail } from '../_shared/email.ts';
import {
  buildCanaryEmail,
  buildVerseAlerts,
  isCanaryDay,
  runCanary,
  type DepthRow,
} from './core.ts';

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

Deno.test('the canary is due on Mondays and no other day', () => {
  // 2026-08-17 is a Monday; the six days around it are not.
  assertEquals(isCanaryDay(new Date('2026-08-17T07:20:00Z')), true);
  assertEquals(isCanaryDay(new Date('2026-08-16T07:20:00Z')), false);
  assertEquals(isCanaryDay(new Date('2026-08-18T07:20:00Z')), false);
  assertEquals(isCanaryDay(new Date('2026-08-23T07:20:00Z')), false);
});

Deno.test('the canary is UTC, not the runner’s local midnight', () => {
  // A Sunday evening in Berlin is already Monday in UTC, and the schedule is UTC.
  assertEquals(isCanaryDay(new Date('2026-08-17T00:30:00Z')), true);
  assertEquals(isCanaryDay(new Date('2026-08-17T23:30:00Z')), true);
});

Deno.test('the canary is from us, to us, and says nothing else', () => {
  const email = buildCanaryEmail('alerts@agbcglobal.com', new Date('2026-08-17T07:20:00Z'));

  assertEquals(email.from, 'alerts@agbcglobal.com');
  assertEquals(email.to, 'alerts@agbcglobal.com');
  assertEquals(email.subject, 'AGBC email canary');
  // The date is in the body so a stale one in an inbox is obvious.
  assertEquals(email.text.includes('2026-08-17'), true);
  // And it explains what its own absence would mean, for whoever finds it in a filter.
  assertEquals(email.text.includes('sign-in codes'), true);
});

const MONDAY = new Date('2026-08-17T07:20:00Z');
const TUESDAY = new Date('2026-08-18T07:20:00Z');

/** Records what the canary did, so all four branches can be driven from a test. */
function spy() {
  const pings: boolean[] = [];
  const sent: OutgoingEmail[] = [];
  return {
    pings,
    sent,
    ping: (ok: boolean) => {
      pings.push(ok);
      return Promise.resolve();
    },
    send: (email: OutgoingEmail) => {
      sent.push(email);
      return Promise.resolve();
    },
  };
}

Deno.test('on any other day the canary does nothing at all, not even a ping', async () => {
  const s = spy();
  const outcome = await runCanary(TUESDAY, {
    send: s.send,
    from: 'alerts@agbcglobal.com',
    ping: s.ping,
  });

  assertEquals(outcome, 'not due');
  assertEquals(s.sent.length, 0);
  // No ping either way: the check's period is weekly, so silence on a Tuesday is expected
  // and a success ping would reset its clock.
  assertEquals(s.pings, []);
});

Deno.test('on Monday it sends itself the canary and pings success', async () => {
  const s = spy();
  const outcome = await runCanary(MONDAY, {
    send: s.send,
    from: 'alerts@agbcglobal.com',
    ping: s.ping,
  });

  assertEquals(outcome, 'sent');
  assertEquals(s.sent.length, 1);
  assertEquals(s.sent[0].to, 'alerts@agbcglobal.com');
  assertEquals(s.pings, [true]);
});

Deno.test('an unconfigured environment is a FAILED run, not a quiet one', async () => {
  // ADR 0016 read at its word: a job that finds email unconfigured has not succeeded.
  const s = spy();
  const outcome = await runCanary(MONDAY, {
    send: null,
    from: 'alerts@agbcglobal.com',
    ping: s.ping,
  });

  assertEquals(outcome, 'unconfigured');
  assertEquals(s.pings, [false]);
});

Deno.test('a missing from address is the same failure', async () => {
  const s = spy();
  const outcome = await runCanary(MONDAY, {
    send: s.send,
    from: null,
    ping: s.ping,
  });

  assertEquals(outcome, 'unconfigured');
  assertEquals(s.sent.length, 0);
  assertEquals(s.pings, [false]);
});

Deno.test('a send that throws pings failure and never escapes the canary', async () => {
  // The verse queue still has to be checked afterwards, so this must not rethrow.
  const s = spy();
  const outcome = await runCanary(MONDAY, {
    send: () => Promise.reject(new Error('resend is down')),
    from: 'alerts@agbcglobal.com',
    ping: s.ping,
  });

  assertEquals(outcome, 'failed');
  assertEquals(s.pings, [false]);
});
