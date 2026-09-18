import { describe, expect, test } from 'vitest';

import {
  preachedOn,
  shortDate,
  wholeKb,
  wholeMb,
  wholeMinutes,
} from './format';

/**
 * The shelf's display formatters. The date one earns a file of its own because W4.21
 * changed a rule it had carried since W3.1: the year used to be dropped always, on the
 * grounds that "the queue is months not years", which stopped being true the moment the
 * sync walked an archive going back to 2019.
 */

const NOW = new Date('2026-09-18T10:00:00Z');

describe('preachedOn', () => {
  test('a message from this year reads as it always has, with no year', () => {
    expect(preachedOn('2026-08-09T11:00:00Z', NOW)).toBe('Sunday 9 August');
  });

  test('a message from another year says which one', () => {
    // The defect this fixes: on a search spanning the archive, "Sunday 14 February"
    // above "Sunday 3 November" tells the reader nothing about which is older.
    expect(preachedOn('2019-05-12T11:00:00Z', NOW)).toBe('Sunday 12 May 2019');
    expect(preachedOn('2021-02-14T11:00:00Z', NOW)).toBe(
      'Sunday 14 February 2021',
    );
  });

  test('the boundary is the year, not a rolling window', () => {
    // 1 January is "this year" on 31 December of the same year, and last year's
    // 31 December carries its year even though it is a day away.
    expect(preachedOn('2026-01-01T00:00:00Z', NOW)).toBe('Thursday 1 January');
    expect(preachedOn('2025-12-31T23:00:00Z', NOW)).toBe(
      'Wednesday 31 December 2025',
    );
  });

  test('the date is read in UTC, never the machine’s zone', () => {
    // 23:00 UTC is the next day for anybody east of Greenwich and the same day west of
    // it; the stored instant is what the shelf means, so it must not drift by a day.
    expect(preachedOn('2026-08-09T23:30:00Z', NOW)).toBe('Sunday 9 August');
    expect(preachedOn('2026-08-09T00:30:00Z', NOW)).toBe('Sunday 9 August');
  });
});

describe('the other display units', () => {
  test('shortDate stays day and month: "shelved" is a recent act', () => {
    expect(shortDate('2026-08-04T09:00:00Z')).toBe('4 August');
  });

  test('minutes, MB and KB round for display and never reach zero', () => {
    expect(wholeMinutes(2820)).toBe(47);
    expect(wholeMinutes(1)).toBe(1);
    expect(wholeMb(26_214_400)).toBe(25);
    expect(wholeKb(409_600)).toBe(400);
  });
});
