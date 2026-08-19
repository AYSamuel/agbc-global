import { assertEquals } from 'jsr:@std/assert@1';

import {
  buildFanoutTargets,
  planFanout,
  type ChunkRow,
  type FanoutTarget,
} from './core.ts';

function chunkRow(overrides: Partial<ChunkRow> = {}): ChunkRow {
  return {
    delivery_id: 'del-1',
    notification_id: 'note-1',
    device_id: 'dev-1',
    expo_push_token: 'ExponentPushToken[one]',
    type: 'ministry',
    title: 'Global Family Sunday',
    body: 'Every branch worships together.',
    deep_link: '/events',
    ...overrides,
  };
}

Deno.test('a delivery row becomes a message on its scope’s channel', () => {
  const [target] = buildFanoutTargets([chunkRow()]);

  assertEquals(target.deliveryId, 'del-1');
  assertEquals(target.message.to, 'ExponentPushToken[one]');
  assertEquals(target.message.title, 'Global Family Sunday');
  assertEquals(target.message.body, 'Every branch worships together.');
  assertEquals(target.message.channelId, 'ministry');
  assertEquals(target.message.data, {
    deepLink: '/events',
    notificationId: 'note-1',
    type: 'ministry',
  });
});

Deno.test('a branch broadcast rides the branch channel', () => {
  const [target] = buildFanoutTargets([chunkRow({ type: 'branch' })]);
  assertEquals(target.message.channelId, 'branch');
});

Deno.test('the words come from the row, never re-rendered here', () => {
  // The notification was written per recipient language at prepare time (`02`), and this
  // reads it back. If the fan-out rebuilt the text, the push and the notification centre
  // would be two expressions that have to agree rather than one string.
  const [target] = buildFanoutTargets([
    chunkRow({ body: 'Elke gemeente aanbidt samen.' }),
  ]);
  assertEquals(target.message.body, 'Elke gemeente aanbidt samen.');
});

const targets: FanoutTarget[] = [
  {
    deliveryId: 'del-ok',
    deviceId: 'dev-ok',
    message: {
      to: 'ExponentPushToken[ok]',
      title: 't',
      body: 'b',
      data: { deepLink: '/events', notificationId: 'n1', type: 'ministry' },
      channelId: 'ministry',
    },
  },
  {
    deliveryId: 'del-dead',
    deviceId: 'dev-dead',
    message: {
      to: 'ExponentPushToken[dead]',
      title: 't',
      body: 'b',
      data: { deepLink: '/events', notificationId: 'n2', type: 'ministry' },
      channelId: 'ministry',
    },
  },
  {
    deliveryId: 'del-creds',
    deviceId: 'dev-creds',
    message: {
      to: 'ExponentPushToken[creds]',
      title: 't',
      body: 'b',
      data: { deepLink: '/events', notificationId: 'n3', type: 'ministry' },
      channelId: 'ministry',
    },
  },
];

Deno.test('an accepted ticket records against its delivery row', () => {
  const plan = planFanout(targets, [
    { status: 'ok', id: 'tk-1' },
    { status: 'ok', id: 'tk-2' },
    { status: 'ok', id: 'tk-3' },
  ]);

  assertEquals(plan.results[0], {
    deliveryId: 'del-ok',
    ticketId: 'tk-1',
    error: null,
  });
  assertEquals(plan.dead, []);
});

Deno.test('a dead token fails its row and prunes the device', () => {
  const plan = planFanout(targets, [
    { status: 'ok', id: 'tk-1' },
    { status: 'error', error: 'DeviceNotRegistered' },
    { status: 'ok', id: 'tk-3' },
  ]);

  assertEquals(plan.results[1], {
    deliveryId: 'del-dead',
    ticketId: null,
    error: 'DeviceNotRegistered',
  });
  assertEquals(plan.dead, ['dev-dead']);
});

Deno.test('our own credentials failure never prunes anybody', () => {
  const plan = planFanout(targets, [
    { status: 'error', error: 'MismatchSenderId' },
    { status: 'error', error: 'InvalidCredentials' },
    { status: 'error', error: 'MessageTooBig' },
  ]);

  assertEquals(plan.dead, []);
  assertEquals(plan.results.every((result) => result.error !== null), true);
});

Deno.test('a ticket Expo did not return leaves its row PENDING', () => {
  // The difference between "we do not know" and "it did not work". Pending is the work
  // list, so an unanswered row is attempted again and the broadcast stays open.
  const plan = planFanout(targets, [{ status: 'ok', id: 'tk-1' }]);

  assertEquals(plan.results.length, 1);
  assertEquals(plan.results[0].deliveryId, 'del-ok');
});

Deno.test('an empty page plans nothing', () => {
  assertEquals(planFanout([], []), { results: [], dead: [] });
  assertEquals(buildFanoutTargets([]), []);
});
