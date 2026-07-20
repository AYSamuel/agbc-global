import { assertEquals } from 'jsr:@std/assert@1';

import { liveDetectionSummarySchema } from '../../../packages/shared/src/contracts/watch-jobs.ts';
import { parseLivePage } from './live.ts';
import {
  isWithinServiceWindow,
  localMinuteOfWeek,
  type ServiceWindow,
} from './windows.ts';

// Glasgow Sunday noon service, 2h duration: window 11:30-14:00 local.
const HQ_SUNDAY: ServiceWindow[] = [
  { weekday: 0, startTime: '12:00:00', durationMin: 120 },
];

Deno.test('inside the window: Sunday noon in Glasgow (BST, UTC+1)', () => {
  // 2026-07-19 is a Sunday; 11:00 UTC = 12:00 BST.
  const now = new Date('2026-07-19T11:00:00Z');
  assertEquals(isWithinServiceWindow(now, 'Europe/London', HQ_SUNDAY), true);
});

Deno.test('the 30-minute lead opens the window at 11:30 local', () => {
  const at1129 = new Date('2026-07-19T10:29:00Z'); // 11:29 BST
  const at1130 = new Date('2026-07-19T10:30:00Z'); // 11:30 BST
  assertEquals(isWithinServiceWindow(at1129, 'Europe/London', HQ_SUNDAY), false);
  assertEquals(isWithinServiceWindow(at1130, 'Europe/London', HQ_SUNDAY), true);
});

Deno.test('the window closes after start + duration', () => {
  const at1400 = new Date('2026-07-19T13:00:00Z'); // 14:00 BST
  const at1401 = new Date('2026-07-19T13:01:00Z'); // 14:01 BST
  assertEquals(isWithinServiceWindow(at1400, 'Europe/London', HQ_SUNDAY), true);
  assertEquals(isWithinServiceWindow(at1401, 'Europe/London', HQ_SUNDAY), false);
});

Deno.test('a Tuesday is never inside the Sunday window', () => {
  const now = new Date('2026-07-21T11:00:00Z');
  assertEquals(isWithinServiceWindow(now, 'Europe/London', HQ_SUNDAY), false);
});

Deno.test('DST transition day still resolves the local wall clock (BST start)', () => {
  // Europe/London springs forward on 2026-03-29 (a Sunday): 11:00 UTC is noon
  // BST that day, squarely in the window; under a naive fixed-offset it
  // would read 11:00 GMT and sit at the window edge instead.
  const now = new Date('2026-03-29T11:00:00Z');
  assertEquals(isWithinServiceWindow(now, 'Europe/London', HQ_SUNDAY), true);
  // Winter Sunday: 11:00 UTC IS 11:00 GMT: before the 11:30 lead-in.
  const winter = new Date('2026-12-06T11:00:00Z');
  assertEquals(isWithinServiceWindow(winter, 'Europe/London', HQ_SUNDAY), false);
});

Deno.test('Berlin midweek service uses the branch zone, not UTC', () => {
  const services: ServiceWindow[] = [
    { weekday: 3, startTime: '18:00:00', durationMin: 120 },
  ];
  // 2026-07-22 is a Wednesday; 16:30 UTC = 18:30 CEST (inside).
  assertEquals(
    isWithinServiceWindow(new Date('2026-07-22T16:30:00Z'), 'Europe/Berlin', services),
    true,
  );
  // 18:30 UTC in London is outside a Berlin-zoned window's local math? No:
  // the zone belongs to the branch: 18:30 UTC = 20:30 CEST (window closed).
  assertEquals(
    isWithinServiceWindow(new Date('2026-07-22T18:30:00Z'), 'Europe/Berlin', services),
    false,
  );
});

Deno.test('a lead crossing midnight wraps to the previous day', () => {
  // Sunday 00:15 service: the 30-min lead starts Saturday 23:45.
  const services: ServiceWindow[] = [
    { weekday: 0, startTime: '00:15:00', durationMin: 60 },
  ];
  // 2026-07-18 23:50 UTC is Saturday night in UTC.
  assertEquals(
    isWithinServiceWindow(new Date('2026-07-18T23:50:00Z'), 'UTC', services),
    true,
  );
  assertEquals(
    isWithinServiceWindow(new Date('2026-07-18T23:40:00Z'), 'UTC', services),
    false,
  );
});

Deno.test('localMinuteOfWeek maps Sunday noon UTC correctly', () => {
  assertEquals(
    localMinuteOfWeek(new Date('2026-07-19T12:00:00Z'), 'UTC'),
    12 * 60,
  );
});

Deno.test('parseLivePage: live page yields the video id', () => {
  const html =
    '<html><meta name="title" content="Sunday Live"><script>var x = {"isLive":true,"videoId":"abc-123XYZ_9"}</script></html>';
  const probe = parseLivePage(html);
  assertEquals(probe.liveVideoId, 'abc-123XYZ_9');
  assertEquals(probe.liveTitle, 'Sunday Live');
  assertEquals(probe.conclusive, true);
});

Deno.test('parseLivePage: a loaded page without the live marker is conclusively not live', () => {
  const probe = parseLivePage('<html><body>channel page</body></html>');
  assertEquals(probe.liveVideoId, null);
  assertEquals(probe.conclusive, true);
});

Deno.test('parseLivePage: live marker without an id is inconclusive', () => {
  const probe = parseLivePage('<html>{"isLive": true}</html>');
  assertEquals(probe.liveVideoId, null);
  assertEquals(probe.conclusive, false);
});

Deno.test('summaries satisfy the shared zod contract', () => {
  const summary = liveDetectionSummarySchema.parse({
    inServiceWindow: false,
    channelId: null,
    liveVideoId: null,
    flagsCleared: 2,
  });
  assertEquals(summary.flagsCleared, 2);
});
