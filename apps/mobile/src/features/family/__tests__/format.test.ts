import { formatDate, initials, joinMeta, relativeAge } from '../format';

// Pure formatting logic (docs/spec/09 meta lines). Deterministic clock throughout:
// relativeAge takes `now` as an argument precisely so these never touch the wall.

describe('relativeAge', () => {
  const now = new Date('2026-07-21T12:00:00Z');

  test('under a minute reads as "now"', () => {
    expect(relativeAge('2026-07-21T11:59:30Z', now)).toEqual({ unit: 'now' });
  });

  test('minutes, hours, and days bucket by the elapsed floor', () => {
    expect(relativeAge('2026-07-21T11:40:00Z', now)).toEqual({
      unit: 'minute',
      count: 20,
    });
    expect(relativeAge('2026-07-21T07:00:00Z', now)).toEqual({
      unit: 'hour',
      count: 5,
    });
    expect(relativeAge('2026-07-19T12:00:00Z', now)).toEqual({
      unit: 'day',
      count: 2,
    });
  });

  test('past a week it becomes an absolute date, not "9d"', () => {
    const age = relativeAge('2026-07-10T12:00:00Z', now);
    expect(age.unit).toBe('date');
  });

  test('a future timestamp clamps to "now" rather than going negative', () => {
    // A device clock running fast must never render "in -3 hours".
    expect(relativeAge('2026-07-21T15:00:00Z', now)).toEqual({ unit: 'now' });
  });

  test('an unparseable timestamp degrades to a date, never throws', () => {
    expect(relativeAge('not-a-date', now)).toEqual({
      unit: 'date',
      iso: 'not-a-date',
    });
  });
});

describe('initials', () => {
  test('single name yields one letter, full name yields two', () => {
    expect(initials('Sarah')).toBe('S');
    expect(initials('Sarah Okafor')).toBe('SO');
    expect(initials('Tunde Ade Bello')).toBe('TB');
  });

  test('null, empty, and whitespace yield nothing (the card falls back to a glyph)', () => {
    expect(initials(null)).toBe('');
    expect(initials('')).toBe('');
    expect(initials('   ')).toBe('');
  });

  test('an accented or astral first character is not split', () => {
    expect(initials('Émilie')).toBe('É');
    expect(initials('𝓖race')).toBe('𝓖'.toUpperCase());
  });
});

describe('joinMeta', () => {
  test('drops null and empty parts and joins with the interpunct', () => {
    expect(joinMeta(['AGBC Glasgow', null, '2h'])).toBe('AGBC Glasgow · 2h');
    expect(joinMeta([null, '', 'only'])).toBe('only');
    expect(joinMeta([null, null])).toBe('');
  });
});

describe('formatDate', () => {
  test('formats to the locale, and an invalid date is empty not a crash', () => {
    expect(formatDate('2026-07-21T12:00:00Z', 'en')).toContain('2026');
    expect(formatDate('nope', 'en')).toBe('');
  });
});
