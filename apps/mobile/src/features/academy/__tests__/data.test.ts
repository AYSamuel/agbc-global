import { formatFeeMinor, regionalFeesFor } from '../fees';
import { liveRegistrationFor, type RegistrationRow } from '../queries';
import { registrationMessage } from '../registrationContact';
import { narrowLocalizedText, pickLocalized } from '@/lib/localizedJson';

// queries.ts touches the supabase client at import; these tests never do.
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

// The pure core of the Academy feature (docs/spec/13, ADR 0017): locale
// picking, money formatting, and the "am I registered" derivation. These are
// the values a member acts on, so they get the unit suite.

describe('pickLocalized (the one place a locale is picked)', () => {
  const text = { en: 'workbook included', de: 'Arbeitsbuch inbegriffen' };

  test('the active language wins', () => {
    expect(pickLocalized(text, 'de')).toBe('Arbeitsbuch inbegriffen');
  });

  test('a region tag resolves to its base language', () => {
    expect(pickLocalized(text, 'de-AT')).toBe('Arbeitsbuch inbegriffen');
  });

  test('a missing language falls back to English', () => {
    expect(pickLocalized(text, 'fr')).toBe('workbook included');
  });

  test('malformed jsonb narrows to null rather than crashing', () => {
    expect(narrowLocalizedText('a bare string')).toBeNull();
    expect(narrowLocalizedText(['not', 'an', 'object'])).toBeNull();
    expect(narrowLocalizedText({ en: 42 })).toBeNull();
    expect(pickLocalized(null, 'en')).toBeNull();
  });
});

describe('formatFeeMinor (minor units + ISO code, docs/spec/02)', () => {
  test('whole amounts drop the fraction (the frame shows £25, never £25.00)', () => {
    expect(formatFeeMinor(2500, 'GBP', 'en-GB')).toBe('£25');
  });

  test('non-whole amounts keep their pence', () => {
    expect(formatFeeMinor(1250, 'GBP', 'en-GB')).toBe('£12.50');
  });

  test("Stripe's lowercase code renders the same as the catalog's uppercase", () => {
    expect(formatFeeMinor(2500, 'gbp', 'en-GB')).toBe('£25');
  });

  test('the NG override renders in naira', () => {
    expect(formatFeeMinor(500000, 'NGN', 'en-GB')).toMatch(/5,000/);
  });
});

describe('liveRegistrationFor (am I registered, docs/spec/13)', () => {
  const course = { id: 'c-reset', slug: 'grace-reset' };

  function row(overrides: Partial<RegistrationRow> = {}): RegistrationRow {
    return {
      id: 'r1',
      course: 'grace-reset',
      courseId: 'c-reset',
      format: 'Part-time (4 weeks)',
      branch: null,
      amount: 2500,
      currency: 'gbp',
      status: 'pending',
      createdAt: '2026-08-01T00:00:00Z',
      ...overrides,
    };
  }

  test('a linked row matches by course_id', () => {
    expect(liveRegistrationFor([row()], course)?.id).toBe('r1');
  });

  test('an old website row with course_id null matches by slug', () => {
    expect(liveRegistrationFor([row({ courseId: null })], course)?.id).toBe(
      'r1',
    );
  });

  test('a cancelled row leaves no trace (re-registering is a new row)', () => {
    expect(
      liveRegistrationFor([row({ status: 'cancelled' })], course),
    ).toBeNull();
  });

  test('another course does not answer for this one', () => {
    expect(
      liveRegistrationFor(
        [row({ course: 'grace-masterclass', courseId: 'c-mc' })],
        course,
      ),
    ).toBeNull();
  });

  test('no data yet reads as not registered, never as an error', () => {
    expect(liveRegistrationFor(undefined, course)).toBeNull();
  });
});

describe('regionalFeesFor', () => {
  test('picks only this course, in a stable order', () => {
    const fees = [
      { courseId: 'c2', countryCode: 'NG', feeMinor: 800000, currency: 'NGN' },
      { courseId: 'c1', countryCode: 'NG', feeMinor: 500000, currency: 'NGN' },
    ];
    expect(regionalFeesFor(fees, 'c1')).toEqual([
      { courseId: 'c1', countryCode: 'NG', feeMinor: 500000, currency: 'NGN' },
    ]);
    expect(regionalFeesFor(undefined, 'c1')).toEqual([]);
  });
});

describe('registrationMessage (the context line the inbox needs)', () => {
  test("carries course + short ref, then the member's own words untouched", () => {
    const message = registrationMessage(
      'Grace Reset',
      '1a2b3c4d-0000-0000-0000-000000000000',
      'Ich möchte bitte stornieren.',
    );
    expect(message).toBe(
      '[Registration · Grace Reset · ref 1a2b3c4d]\n\nIch möchte bitte stornieren.',
    );
  });
});
