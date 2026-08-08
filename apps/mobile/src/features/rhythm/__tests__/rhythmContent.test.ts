import { formatAttendanceDate, formatGatheredDate } from '../format';
import { heroContent } from '../heroContent';
import { aheadBadges, earnedBadges } from '../milestones';
import type { RhythmPhase, RhythmState } from '../queries';

// RHYTHM's decisions, asked without rendering: which number leads, which badges
// are shown, and whether a stored date survives being displayed.

// A translator that shows its work, so a test can assert WHICH key was chosen
// and with what, rather than matching English that copy review may reword.
const t = (key: string, options?: Record<string, unknown>): string =>
  options === undefined
    ? key
    : `${key}(${Object.entries(options)
        .map(([name, value]) => `${name}=${String(value)}`)
        .join(',')})`;

function rhythm(
  over: Partial<RhythmState> & { phase: RhythmPhase },
): RhythmState {
  return {
    today: '2026-08-09',
    checkedIn: false,
    currentWeeks: 0,
    longestWeeks: 0,
    lastServiceDate: null,
    ...over,
  };
}

describe('which number leads (docs/spec/10)', () => {
  test('lapsed leads with the longest, and never with the zero the server sends', () => {
    const hero = heroContent(
      rhythm({
        phase: 'lapsed',
        currentWeeks: 0,
        longestWeeks: 11,
        lastServiceDate: '2026-07-05',
      }),
      'en-GB',
      t,
    );
    expect(hero?.number).toBe('11');
    expect(hero?.unit).toBe('rhythm:heroUnitLongest(count=11)');
    expect(hero?.headline).toBe('rhythm:heroLapsed');
    expect(hero?.footnote).toContain('rhythm:heroLastGathered');
  });

  test('a lapsed member with no longest gets the invitation, not a gold 0', () => {
    expect(
      heroContent(rhythm({ phase: 'lapsed', longestWeeks: 0 }), 'en-GB', t),
    ).toBeNull();
  });

  test('grace leads with the run that is still standing', () => {
    const hero = heroContent(
      rhythm({ phase: 'grace', currentWeeks: 5, longestWeeks: 11 }),
      'en-GB',
      t,
    );
    expect(hero?.number).toBe('5');
    expect(hero?.headline).toBe('rhythm:heroGrace(count=5)');
  });

  test('the longest is a footnote only while it is bigger than today', () => {
    const behind = heroContent(
      rhythm({ phase: 'active', currentWeeks: 6, longestWeeks: 11 }),
      'en-GB',
      t,
    );
    expect(behind?.footnote).toBe('rhythm:heroLongest(count=11)');

    const level = heroContent(
      rhythm({ phase: 'active', currentWeeks: 11, longestWeeks: 11 }),
      'en-GB',
      t,
    );
    expect(level?.footnote).toBeNull();
  });

  test('nothing recorded means no hero at all', () => {
    expect(heroContent(rhythm({ phase: 'none' }), 'en-GB', t)).toBeNull();
    // And a running state with nothing to count says the invitation instead of
    // "0 weeks of showing up", which the server does not produce and this
    // screen must not render if it ever did.
    expect(
      heroContent(rhythm({ phase: 'active', currentWeeks: 0 }), 'en-GB', t),
    ).toBeNull();
  });
});

describe('the milestone ladder', () => {
  test('earned badges come back in ladder order, whatever order they arrived in', () => {
    expect(
      earnedBadges(['first_prayer', 'first_service']).map((b) => b.kind),
    ).toEqual(['first_service', 'first_prayer']);
  });

  test('a kind the app cannot name yet is left out, never rendered raw', () => {
    expect(earnedBadges(['plan_7_days']).map((b) => b.kind)).toEqual([]);
  });

  test('"what\'s ahead" never offers something already earned', () => {
    expect(aheadBadges([]).map((b) => b.kind)).toEqual([
      'first_service',
      '4_week_rhythm',
      'first_prayer',
    ]);
    // A content milestone is awarded on approval and owes nothing to Sundays,
    // so a member with no attendance can already hold one.
    expect(aheadBadges(['first_prayer']).map((b) => b.kind)).toEqual([
      'first_service',
      '4_week_rhythm',
    ]);
  });
});

describe('a service_date survives being displayed', () => {
  test('the day is the stored one, wherever the device thinks it is', () => {
    // The trap: parsing "2026-07-26" and formatting it in a zone WEST of UTC
    // renders the Saturday before. The date is a stored fact about a Sunday,
    // and it must read the same in Ogbomosho and in Glasgow.
    expect(formatAttendanceDate('2026-07-26', 'en-GB')).toBe('Sun 26 Jul');
    expect(formatGatheredDate('2026-07-05', 'en-GB')).toBe('Sunday 5 July');
  });

  test('a value that is not a date renders as nothing, never as "Invalid Date"', () => {
    expect(formatAttendanceDate('', 'en-GB')).toBe('');
    expect(formatGatheredDate('2026-13-40', 'en-GB')).toBe('');
  });
});
