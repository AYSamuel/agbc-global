import { assertEquals } from 'jsr:@std/assert@1';

import {
  buildTargets,
  planTickets,
  type DeliveryRow,
  type PushTarget,
} from './notify.ts';

function row(overrides: Partial<DeliveryRow> = {}): DeliveryRow {
  return {
    notification_id: 'n-1',
    profile_id: 'p-1',
    language: 'en',
    type: 'service_reminder',
    template_key: 'service.starts_soon',
    params: { branch: 'AGBC Glasgow' },
    deep_link: '/home',
    device_id: 'd-1',
    expo_push_token: 'ExponentPushToken[one]',
    ...overrides,
  };
}

Deno.test("a created row becomes an addressed message on its type's channel", () => {
  const [target] = buildTargets([row()]);

  assertEquals(target.deviceId, 'd-1');
  assertEquals(target.message.to, 'ExponentPushToken[one]');
  assertEquals(target.message.title, 'Service starts in 1 hour');
  assertEquals(target.message.body, 'AGBC Glasgow');
  // Service reminders are the one category that interrupts, and Android decides that from
  // the channel (docs/spec/15).
  assertEquals(target.message.channelId, 'service_reminders');
  assertEquals(target.message.data, {
    deepLink: '/home',
    notificationId: 'n-1',
    type: 'service_reminder',
  });
});

Deno.test("the words are the recipient's, not the sender's", () => {
  const [de] = buildTargets([row({ language: 'de' })]);
  assertEquals(de.message.title, 'Der Gottesdienst beginnt in 1 Stunde');

  const [fr] = buildTargets([row({ language: 'fr' })]);
  assertEquals(fr.message.title, 'Le culte commence dans 1 heure');
});

Deno.test('a member with no device is written but not pushed', () => {
  // The whole reason deliver_notifications LEFT JOINs devices: the row exists, the
  // notification centre will show it, and there is simply nothing to send.
  assertEquals(
    buildTargets([row({ device_id: null, expo_push_token: null })]),
    [],
  );
});

Deno.test('one member with two devices gets two messages, one notification', () => {
  const targets = buildTargets([
    row({ device_id: 'd-1', expo_push_token: 'ExponentPushToken[phone]' }),
    row({ device_id: 'd-2', expo_push_token: 'ExponentPushToken[tablet]' }),
  ]);

  assertEquals(targets.length, 2);
  assertEquals(
    targets.map((target) => target.message.data.notificationId),
    ['n-1', 'n-1'],
  );
});

Deno.test('an unknown template still sends something a member can act on', () => {
  const [target] = buildTargets([
    row({ template_key: 'nothing.like.this', params: null }),
  ]);
  assertEquals(target.message.title, 'AGBC Global');
  assertEquals(target.message.body, 'You have a new notification');
});

const targets: PushTarget[] = [
  {
    deviceId: 'd-ok',
    message: {
      to: 'ExponentPushToken[ok]',
      title: 't',
      body: 'b',
      data: { deepLink: '/home', notificationId: 'n-1', type: 'service_reminder' },
      channelId: 'service_reminders',
    },
  },
  {
    deviceId: 'd-dead',
    message: {
      to: 'ExponentPushToken[dead]',
      title: 't',
      body: 'b',
      data: { deepLink: '/home', notificationId: 'n-2', type: 'service_reminder' },
      channelId: 'service_reminders',
    },
  },
  {
    deviceId: 'd-big',
    message: {
      to: 'ExponentPushToken[big]',
      title: 't',
      body: 'b',
      data: { deepLink: '/home', notificationId: 'n-3', type: 'service_reminder' },
      channelId: 'service_reminders',
    },
  },
];

Deno.test('accepted tickets are recorded against the device they were sent to', () => {
  const plan = planTickets(targets, [
    { status: 'ok', id: 'tk-1' },
    { status: 'ok', id: 'tk-2' },
    { status: 'ok', id: 'tk-3' },
  ]);

  assertEquals(plan.record, [
    { ticket_id: 'tk-1', device_id: 'd-ok' },
    { ticket_id: 'tk-2', device_id: 'd-dead' },
    { ticket_id: 'tk-3', device_id: 'd-big' },
  ]);
  assertEquals(plan.dead, []);
  assertEquals(plan.errored, 0);
});

Deno.test('a send-time DeviceNotRegistered prunes that device and records no ticket', () => {
  const plan = planTickets(targets, [
    { status: 'ok', id: 'tk-1' },
    { status: 'error', error: 'DeviceNotRegistered' },
    { status: 'ok', id: 'tk-3' },
  ]);

  assertEquals(plan.record, [
    { ticket_id: 'tk-1', device_id: 'd-ok' },
    { ticket_id: 'tk-3', device_id: 'd-big' },
  ]);
  assertEquals(plan.dead, ['d-dead']);
  assertEquals(plan.errored, 1);
});

Deno.test("our own failures never delete somebody's registration", () => {
  // MessageTooBig is a payload bug and MismatchSenderId means the FCM key in EAS is wrong.
  // Pruning on either would destroy registrations during an outage we caused.
  const plan = planTickets(targets, [
    { status: 'error', error: 'MessageTooBig' },
    { status: 'error', error: 'MismatchSenderId' },
    { status: 'error', error: 'MessageRateExceeded' },
  ]);

  assertEquals(plan.dead, []);
  assertEquals(plan.record, []);
  assertEquals(plan.errored, 3);
});

Deno.test('a device that fails twice is pruned once', () => {
  const twice: PushTarget[] = [targets[1], targets[1]];
  const plan = planTickets(twice, [
    { status: 'error', error: 'DeviceNotRegistered' },
    { status: 'error', error: 'DeviceNotRegistered' },
  ]);
  assertEquals(plan.dead, ['d-dead']);
});

Deno.test('a ticket Expo did not return leaves its device alone', () => {
  // push.ts guarantees one ticket per message, but a short array must never shift the
  // join and prune the wrong device.
  const plan = planTickets(targets, [{ status: 'ok', id: 'tk-1' }]);
  assertEquals(plan.record, [{ ticket_id: 'tk-1', device_id: 'd-ok' }]);
  assertEquals(plan.dead, []);
  assertEquals(plan.errored, 0);
});
