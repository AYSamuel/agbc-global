import {
  eventDateParts,
  formatEventDay,
  formatEventTime,
  instantWallClock,
  isPastEvent,
  parseWallClock,
  wallClockToInstant,
} from '../format';

// Event wall-clock math (docs/spec/02: wall-clock + IANA zone, never a
// pre-converted instant). The qa standard asks for DST transitions and
// non-UTC zones explicitly: UTC-only tests hide the whole bug class.

describe('parseWallClock', () => {
  it('reads the PostgREST timestamp shape', () => {
    expect(parseWallClock('2026-08-24T19:00:00')).toEqual({
      year: 2026,
      month: 8,
      day: 24,
      hour: 19,
      minute: 0,
    });
  });

  it('rejects garbage rather than guessing', () => {
    expect(parseWallClock('not a date')).toBeNull();
    expect(parseWallClock('2026-08-24')).toBeNull();
  });
});

describe('isPastEvent', () => {
  // 2026-08-24T18:00Z = 19:00 in Berlin (CEST, UTC+2).
  const berlinEvent = '2026-08-24T19:00:00';

  it('is upcoming while the branch wall clock is behind the start', () => {
    const now = new Date('2026-08-24T16:59:00Z'); // 18:59 Berlin
    expect(isPastEvent(berlinEvent, 'Europe/Berlin', now)).toBe(false);
  });

  it('is past once the branch wall clock passes the start', () => {
    const now = new Date('2026-08-24T17:01:00Z'); // 19:01 Berlin
    expect(isPastEvent(berlinEvent, 'Europe/Berlin', now)).toBe(true);
  });

  it('judges in the EVENT zone, not the device zone', () => {
    // 09:30 in Lagos (UTC+1) while UTC already reads 08:30: a 09:00 Lagos
    // event is past even though a UTC wall clock would say otherwise.
    const now = new Date('2026-08-24T08:30:00Z');
    expect(isPastEvent('2026-08-24T09:00:00', 'Africa/Lagos', now)).toBe(true);
  });

  it('fails open (upcoming) on an unknown zone instead of crashing', () => {
    const now = new Date('2026-08-24T08:30:00Z');
    expect(isPastEvent('2026-08-24T09:00:00', 'Not/AZone', now)).toBe(false);
  });
});

describe('wallClockToInstant', () => {
  it('converts a Berlin summer wall clock (CEST, UTC+2)', () => {
    const instant = wallClockToInstant('2026-08-24T19:00:00', 'Europe/Berlin');
    expect(instant?.toISOString()).toBe('2026-08-24T17:00:00.000Z');
  });

  it('converts a Berlin winter wall clock (CET, UTC+1)', () => {
    const instant = wallClockToInstant('2026-12-06T19:00:00', 'Europe/Berlin');
    expect(instant?.toISOString()).toBe('2026-12-06T18:00:00.000Z');
  });

  it('handles London (UTC+0 winter) and Lagos (UTC+1, no DST)', () => {
    expect(
      wallClockToInstant('2026-12-06T10:00:00', 'Europe/London')?.toISOString(),
    ).toBe('2026-12-06T10:00:00.000Z');
    expect(
      wallClockToInstant('2026-12-06T09:00:00', 'Africa/Lagos')?.toISOString(),
    ).toBe('2026-12-06T08:00:00.000Z');
  });

  it('resolves a nonexistent spring-forward time to a real instant', () => {
    // Europe/Berlin 2026-03-29: 02:30 does not exist (clocks jump 02:00->03:00).
    const instant = wallClockToInstant('2026-03-29T02:30:00', 'Europe/Berlin');
    expect(instant).not.toBeNull();
    // Whichever side the resolution lands on, it must be within the jump hour.
    const ms = instant?.getTime() ?? 0;
    expect(ms).toBeGreaterThanOrEqual(Date.parse('2026-03-29T00:30:00Z'));
    expect(ms).toBeLessThanOrEqual(Date.parse('2026-03-29T01:30:00Z'));
  });

  it('returns null on an unknown zone', () => {
    expect(wallClockToInstant('2026-08-24T19:00:00', 'Not/AZone')).toBeNull();
  });
});

describe('display formatting (event-zone, via the UTC carrier)', () => {
  it('renders the mockup date block parts', () => {
    expect(eventDateParts('2026-08-24T19:00:00', 'en')).toEqual({
      day: '24',
      month: 'Aug',
    });
  });

  it('renders day and time as written, no zone conversion', () => {
    expect(formatEventDay('2026-08-24T19:00:00', 'en')).toBe('Monday');
    expect(formatEventTime('2026-08-24T19:00:00', 'en')).toMatch(/7:00/);
  });
});

describe('instantWallClock', () => {
  it('reads an instant in a non-UTC zone', () => {
    expect(
      instantWallClock(new Date('2026-08-24T17:01:00Z'), 'Europe/Berlin'),
    ).toEqual({ year: 2026, month: 8, day: 24, hour: 19, minute: 1 });
  });

  it('returns null on an unknown zone', () => {
    expect(instantWallClock(new Date(), 'Not/AZone')).toBeNull();
  });
});
