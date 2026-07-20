import {
  dayBucket,
  formatServiceDay,
  formatServiceTime,
  localMinuteOfWeek,
  resolveNextService,
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
  test('dayBucket labels the coarse distance', () => {
    expect(dayBucket(-10)).toBe('now');
    expect(dayBucket(0)).toBe('now');
    expect(dayBucket(60)).toBe('today');
    expect(dayBucket(30 * 60)).toBe('tomorrow');
    expect(dayBucket(72 * 60)).toBe('later');
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
