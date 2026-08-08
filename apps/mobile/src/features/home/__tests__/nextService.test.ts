import {
  checkInOpen,
  dayBucket,
  formatServiceDay,
  formatServiceTime,
  localMinuteOfWeek,
  resolveNextService,
  type NextService,
  type ServiceRow,
} from '../nextService';

// Next-service selection (docs/spec/07 §3): branch-timezone math, the
// [start - 30, start + duration] window, and the zero-rows fallback.

function service(overrides: Partial<ServiceRow> = {}): ServiceRow {
  return {
    weekday: 0,
    start_time: '12:00:00',
    duration_min: 120,
    kind: 'sunday',
    label: '',
    ...overrides,
  };
}

describe('resolveNextService', () => {
  test('picks the soonest upcoming service', () => {
    const sunday = service({ weekday: 0, start_time: '12:00:00' });
    const wednesday = service({ weekday: 3, start_time: '18:00:00' });
    // 2026-07-20 is a Monday, 09:00 UTC.
    const next = resolveNextService(
      [sunday, wednesday],
      'UTC',
      new Date('2026-07-20T09:00:00Z'),
    );
    expect(next?.service.weekday).toBe(3);
    expect(next?.isInWindow).toBe(false);
  });

  test('a running service wins and reports as running', () => {
    // Sunday 12:30 UTC: 30 minutes into the noon service.
    const next = resolveNextService(
      [service()],
      'UTC',
      new Date('2026-07-19T12:30:00Z'),
    );
    expect(next?.isRunning).toBe(true);
    expect(next?.isInWindow).toBe(true);
    expect(next?.minutesUntil).toBeLessThan(0);
  });

  test('the 30-minute lead counts as in-window but not running', () => {
    const next = resolveNextService(
      [service()],
      'UTC',
      new Date('2026-07-19T11:45:00Z'),
    );
    expect(next?.isInWindow).toBe(true);
    expect(next?.isRunning).toBe(false);
    expect(next?.minutesUntil).toBe(15);
  });

  test('after the window closes it rolls to next week', () => {
    // Sunday 14:30 UTC: the noon service (120 min) ended at 14:00.
    const next = resolveNextService(
      [service()],
      'UTC',
      new Date('2026-07-19T14:30:00Z'),
    );
    expect(next?.isInWindow).toBe(false);
    expect(next?.minutesUntil).toBeGreaterThan(6 * 24 * 60);
  });

  test('the branch timezone decides, not the device', () => {
    // 11:00 UTC on Sunday = 12:00 BST in Glasgow: the service is starting.
    const glasgow = resolveNextService(
      [service()],
      'Europe/London',
      new Date('2026-07-19T11:00:00Z'),
    );
    expect(glasgow?.isRunning).toBe(true);
    // Same instant in Lagos (UTC+1 year-round) is also noon.
    const lagos = resolveNextService(
      [service()],
      'Africa/Lagos',
      new Date('2026-07-19T11:00:00Z'),
    );
    expect(lagos?.isRunning).toBe(true);
    // But in Berlin (UTC+2 in July) it is already 13:00: still inside the
    // 120-minute window, and running.
    const berlin = resolveNextService(
      [service()],
      'Europe/Berlin',
      new Date('2026-07-19T11:00:00Z'),
    );
    expect(berlin?.isRunning).toBe(true);
  });

  test('zero rows yields null so the caller renders the display strings', () => {
    expect(resolveNextService([], 'UTC', new Date())).toBeNull();
  });

  test('unparseable rows are skipped, never crash Home', () => {
    const next = resolveNextService(
      [service({ start_time: 'nonsense' }), service({ weekday: 3 })],
      'UTC',
      new Date('2026-07-20T09:00:00Z'),
    );
    expect(next?.service.weekday).toBe(3);
  });

  test('an unknown timezone degrades to the fallback instead of throwing', () => {
    expect(localMinuteOfWeek(new Date(), 'Not/AZone')).toBe(-1);
    expect(resolveNextService([service()], 'Not/AZone', new Date())).toBeNull();
  });
});

describe('display helpers', () => {
  test('the eyebrow names the branch-local DAY, not the hours away', () => {
    // The bug this replaces: 2026-08-08 is a Saturday, and at 21:15 in Glasgow
    // the noon Sunday service is 14h45m away. Bucketing by elapsed hours called
    // that "today", so Home told members all Saturday evening that the service
    // was TODAY (seen on the phone, 2026-08-08). It crosses one branch-local
    // midnight, so it is tomorrow.
    const saturdayEvening = resolveNextService(
      [service({ weekday: 0, start_time: '12:00' })],
      'Europe/London',
      new Date('2026-08-08T20:15:00Z'),
    );
    expect(saturdayEvening).not.toBeNull();
    expect(dayBucket(saturdayEvening as NextService)).toBe('tomorrow');
  });

  test('a service later the same day is today, however many hours off', () => {
    // Sunday 00:30 in Glasgow: the noon service is 11.5 hours away and shares
    // the day, which is the case the old arithmetic got right by accident.
    const earlySunday = resolveNextService(
      [service({ weekday: 0, start_time: '12:00' })],
      'Europe/London',
      new Date('2026-08-08T23:30:00Z'),
    );
    expect(dayBucket(earlySunday as NextService)).toBe('today');
  });

  test('two midnights away is later, not tomorrow', () => {
    // Friday 09:00 in Glasgow, service Sunday noon: two midnights.
    const friday = resolveNextService(
      [service({ weekday: 0, start_time: '12:00' })],
      'Europe/London',
      new Date('2026-08-07T08:00:00Z'),
    );
    expect(dayBucket(friday as NextService)).toBe('later');
  });

  test('a running service is now, whatever day it started on', () => {
    const running = resolveNextService(
      [service()],
      'UTC',
      new Date('2026-07-19T12:30:00Z'),
    );
    expect(dayBucket(running as NextService)).toBe('now');
  });

  test('service time renders the branch wall clock, not a converted one', () => {
    expect(formatServiceTime('12:00:00', 'en-GB')).toContain('12:00');
    expect(formatServiceTime('18:30', 'en-GB')).toContain('18:30');
    expect(formatServiceTime('bad', 'en-GB')).toBe('');
  });

  test('weekday names are localized', () => {
    expect(formatServiceDay(0, 'en-GB')).toBe('Sunday');
    expect(formatServiceDay(3, 'en-GB')).toBe('Wednesday');
    expect(formatServiceDay(0, 'de')).toBe('Sonntag');
  });
});

// "I'm here" is offered around service time (docs/spec/10, `04`): from the same
// 30-minute lead the card uses, through the end of the branch's own day. Both
// edges are the feature: the near one stops a check-in hours before anyone
// gathers, the far one keeps it for the member who taps on the way home.
describe('checkInOpen', () => {
  const sunday = service({ weekday: 0, start_time: '12:00:00' });

  test('closed the morning of, before the lead begins', () => {
    // Sunday 09:00 UTC: three hours early, and nobody is there yet.
    expect(checkInOpen([sunday], 'UTC', new Date('2026-07-19T09:00:00Z'))).toBe(
      false,
    );
  });

  test('opens 30 minutes before the service starts', () => {
    expect(checkInOpen([sunday], 'UTC', new Date('2026-07-19T11:30:00Z'))).toBe(
      true,
    );
  });

  test('stays open while the service runs', () => {
    expect(checkInOpen([sunday], 'UTC', new Date('2026-07-19T12:45:00Z'))).toBe(
      true,
    );
  });

  test('stays open after it ends, to the end of the branch day', () => {
    // 22:00, long after the noon service: the member was still there.
    expect(checkInOpen([sunday], 'UTC', new Date('2026-07-19T22:00:00Z'))).toBe(
      true,
    );
  });

  test('closed the next day, even minutes past midnight', () => {
    expect(checkInOpen([sunday], 'UTC', new Date('2026-07-20T00:10:00Z'))).toBe(
      false,
    );
  });

  test("reads the BRANCH's clock, not the device's", () => {
    // 23:30 UTC on Saturday is already Sunday 01:30 in Lagos, so a Lagos
    // service that day has not reached its lead yet.
    const lagos = service({ weekday: 0, start_time: '11:00:00' });
    expect(
      checkInOpen([lagos], 'Africa/Lagos', new Date('2026-07-18T23:30:00Z')),
    ).toBe(false);
    // ...and Sunday 09:00 UTC is 10:00 in Lagos: inside the lead.
    expect(
      checkInOpen([lagos], 'Africa/Lagos', new Date('2026-07-19T09:30:00Z')),
    ).toBe(true);
  });

  test('a service running past midnight keeps it, while the card still says "now"', () => {
    // Found on a device, 2026-08-08: a late gathering starting 23:30 was still
    // running at 00:02, the hero still read HAPPENING NOW, and the check-in had
    // vanished because the weekday had rolled over. The people it disappeared
    // for were the ones sitting in the room.
    const late = service({
      weekday: 5,
      start_time: '23:30:00',
      duration_min: 120,
    });
    // Friday 23:45 UTC: fifteen minutes in.
    expect(checkInOpen([late], 'UTC', new Date('2026-07-17T23:45:00Z'))).toBe(
      true,
    );
    // Saturday 00:20 UTC: fifty minutes in, and a different weekday.
    expect(checkInOpen([late], 'UTC', new Date('2026-07-18T00:20:00Z'))).toBe(
      true,
    );
    // Saturday 02:00 UTC: it ended at 01:30, and this is no longer its day.
    expect(checkInOpen([late], 'UTC', new Date('2026-07-18T02:00:00Z'))).toBe(
      false,
    );
  });

  test('a branch with no rows never offers it (docs/spec/07 zero-rows rule)', () => {
    expect(checkInOpen([], 'UTC', new Date('2026-07-19T12:00:00Z'))).toBe(
      false,
    );
  });

  test('an unknown timezone never offers it on a guess', () => {
    expect(
      checkInOpen([sunday], 'Not/AZone', new Date('2026-07-19T12:00:00Z')),
    ).toBe(false);
  });
});
