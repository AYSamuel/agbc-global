import { assertEquals } from 'jsr:@std/assert@1';

import type { PushReceipt } from '../_shared/push.ts';
import {
  buildRateAlert,
  ERROR_RATE_FLOOR,
  MIN_SAMPLE,
  planSweep,
  shouldAlarm,
  type TicketRow,
} from './core.ts';

const tickets: TicketRow[] = [
  { ticket_id: 't-ok', device_id: 'device-a' },
  { ticket_id: 't-dead', device_id: 'device-b' },
  { ticket_id: 't-dead-2', device_id: 'device-b' },
  { ticket_id: 't-big', device_id: 'device-c' },
  { ticket_id: 't-creds', device_id: 'device-d' },
  { ticket_id: 't-pending', device_id: 'device-e' },
];

function receipt(
  ticketId: string,
  status: 'ok' | 'error',
  error?: string,
): PushReceipt {
  return { ticketId, status, error };
}

Deno.test('a delivered receipt is processed and touches no device', () => {
  const plan = planSweep(tickets, [receipt('t-ok', 'ok')]);
  assertEquals(plan.processed, [
    { ticketId: 't-ok', error: null, source: 'ticket' },
  ]);
  assertEquals(plan.deadDevices, []);
  assertEquals(plan.errored, 0);
});

Deno.test('DeviceNotRegistered prunes the device, once per device', () => {
  const plan = planSweep(tickets, [
    receipt('t-dead', 'error', 'DeviceNotRegistered'),
    receipt('t-dead-2', 'error', 'DeviceNotRegistered'),
  ]);
  // Two tickets, one device: the delete list is deduped or we issue a pointless second
  // delete for a row that is already gone.
  assertEquals(plan.deadDevices, ['device-b']);
  assertEquals(plan.errored, 2);
  assertEquals(plan.processed.length, 2);
  assertEquals(plan.processed[0].error, 'DeviceNotRegistered');
});

Deno.test('MessageTooBig is our bug and never costs a member their registration', () => {
  const plan = planSweep(tickets, [receipt('t-big', 'error', 'MessageTooBig')]);
  assertEquals(plan.deadDevices, []);
  assertEquals(plan.errored, 1);
  assertEquals(plan.processed[0], {
    ticketId: 't-big',
    error: 'MessageTooBig',
    source: 'ticket',
  });
});

Deno.test('a credentials failure is counted apart and prunes nothing', () => {
  // The dangerous case: our FCM key is wrong, EVERY receipt errors, and a naive sweep
  // would delete every device in the ministry.
  const plan = planSweep(tickets, [
    receipt('t-creds', 'error', 'MismatchSenderId'),
    receipt('t-ok', 'error', 'InvalidCredentials'),
  ]);
  assertEquals(plan.deadDevices, []);
  assertEquals(plan.credentialsFailures, 2);
  assertEquals(plan.errored, 2);
});

Deno.test('a ticket Expo has not answered yet is left unprocessed', () => {
  const plan = planSweep(tickets, [receipt('t-ok', 'ok')]);
  const touched = plan.processed.map((p) => p.ticketId);
  assertEquals(touched.includes('t-pending'), false);
});

Deno.test('a receipt for a ticket we did not ask about is ignored', () => {
  // It cannot be attributed to a device, so acting on it could delete the wrong one.
  const plan = planSweep(tickets, [
    receipt('t-someone-elses', 'error', 'DeviceNotRegistered'),
  ]);
  assertEquals(plan.deadDevices, []);
  assertEquals(plan.processed, []);
});

Deno.test('the alarm needs both a real rate and a real sample', () => {
  assertEquals(shouldAlarm(null), false);
  // Above the floor but only three sends: a Tuesday-morning nothing.
  assertEquals(shouldAlarm({ sent: 3, errored: 1, ratio: 0.33 }), false);
  // Enough traffic, under the floor.
  assertEquals(
    shouldAlarm({ sent: MIN_SAMPLE, errored: 1, ratio: 0.05 }),
    false,
  );
  // Exactly at the floor is not "more than" the floor.
  assertEquals(
    shouldAlarm({ sent: 100, errored: 10, ratio: ERROR_RATE_FLOOR }),
    false,
  );
  assertEquals(shouldAlarm({ sent: 100, errored: 11, ratio: 0.11 }), true);
});

Deno.test('an answer goes back to the ledger its ticket came from', () => {
  // The sweep reads both ledgers in one pass (20260820140000), and the two are stamped by
  // different functions. A source carried on the ticket is what keeps a broadcast receipt
  // from being written against `push_tickets`, where it would match nothing and be asked
  // about again for ever.
  const plan = planSweep(
    [
      { ticket_id: 't-auto', device_id: 'd-1', source: 'ticket' },
      { ticket_id: 't-cast', device_id: 'd-2', source: 'broadcast' },
    ],
    [
      { ticketId: 't-auto', status: 'ok' },
      { ticketId: 't-cast', status: 'error', error: 'DeviceNotRegistered' },
    ],
  );

  assertEquals(plan.processed, [
    { ticketId: 't-auto', error: null, source: 'ticket' },
    { ticketId: 't-cast', error: 'DeviceNotRegistered', source: 'broadcast' },
  ]);
});

Deno.test('a dead token is pruned whichever ledger paid for the push', () => {
  // The bug this closes: a member whose only pushes were broadcasts kept their
  // registration for ever, because nothing ever read their receipts.
  const plan = planSweep(
    [{ ticket_id: 't-cast', device_id: 'd-2', source: 'broadcast' }],
    [{ ticketId: 't-cast', status: 'error', error: 'DeviceNotRegistered' }],
  );

  assertEquals(plan.deadDevices, ['d-2']);
});

Deno.test('a ticket with no source is treated as the automated ledger', () => {
  // Rows written before the second ledger existed carry no source, and the older meaning
  // is the safe one: `push_tickets` is where every ticket lived until W3.5.
  const plan = planSweep(
    [{ ticket_id: 't-old', device_id: 'd-1' }],
    [{ ticketId: 't-old', status: 'ok' }],
  );

  assertEquals(plan.processed[0].source, 'ticket');
});

Deno.test('the alert carries numbers and names both likely causes, and no PII', () => {
  const alert = buildRateAlert({ sent: 200, errored: 40, ratio: 0.2 }, null);
  assertEquals(alert.subject.includes('20.0%'), true);
  assertEquals(alert.text.includes('Sent: 200'), true);
  assertEquals(alert.text.includes('Failed: 40'), true);
  // The two causes an operator must tell apart: harmless churn vs total outage.
  assertEquals(alert.text.includes('DeviceNotRegistered'), true);
  assertEquals(alert.text.includes('MismatchSenderId'), true);
  // No token, no member, no notification content ever reaches an inbox (docs/spec/20).
  assertEquals(/ExponentPushToken/.test(alert.text), false);
});
