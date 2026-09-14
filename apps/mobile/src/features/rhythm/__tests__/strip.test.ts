import { nextProgress } from '../nextProgress';
import type { RhythmPhase, RhythmState } from '../queries';
import { stripContent } from '../StreakStrip';

// The strip and the Next card's words, asked without rendering (docs/spec/10;
// mockup W2.8 "the rhythm strip, all four states" and the W4.16 section).
//
// Since W4.16 the app counts nothing: `rhythm_state` names the next milestone and
// how far along it is, and these tests hand that answer in and assert which
// sentence comes out and how full the ring is. The calendar rules themselves are
// pgTAP 056's.

// A translator that shows its work: the key, then every option it was given, so
// a test sees which sentence was chosen and with which numbers and month.
function t(key: string, options?: Record<string, unknown>): string {
  if (options === undefined) return key;
  const shown = Object.entries(options)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => `${name}=${String(value)}`)
    .join(',');
  // A named tier is looked up with `{ count: undefined }`, which says nothing.
  return shown === '' ? key : `${key}(${shown})`;
}

function rhythm(
  phase: RhythmPhase,
  over: Partial<RhythmState> = {},
): RhythmState {
  return {
    today: '2026-09-13',
    checkedIn: false,
    phase,
    currentWeeks: 0,
    longestWeeks: 0,
    lastServiceDate: null,
    nextKind: null,
    progressDone: 0,
    progressTotal: 0,
    progressMonth: null,
    ...over,
  };
}

/** Toward a month of Sundays: `done` of `total` weeks of `month`. */
function towardMonth(done: number, total: number, month: string) {
  return {
    nextKind: '4_week_rhythm',
    progressDone: done,
    progressTotal: total,
    progressMonth: month,
  };
}

/** Toward a time rung, `done` of `total` calendar weeks of the run. */
function towardRung(kind: string, done: number, total: number) {
  return {
    nextKind: kind,
    progressDone: done,
    progressTotal: total,
    progressMonth: null,
  };
}

const MONTH = 'rhythm:milestoneFourWeek';
const SEASON = 'rhythm:milestoneTwelveWeek';

describe('the strip in each state', () => {
  test('none: an invitation, and no ring to be part of the way round', () => {
    const content = stripContent(rhythm('none'), 'en-GB', t);
    expect(content.title).toBe('rhythm:stripNoneTitle');
    expect(content.note).toBe('rhythm:stripNoneNote');
    expect(content.ring).toBeNull();
  });

  test('lapsed: the longest leads, because the live streak is 0', () => {
    // A 58px gold 0 is exactly the scold docs/spec/10 forbids, and the server
    // still answers a next milestone for a lapsed member: the strip ignores it.
    const content = stripContent(
      rhythm('lapsed', {
        currentWeeks: 0,
        longestWeeks: 11,
        ...towardMonth(0, 4, '2026-10-01'),
      }),
      'en-GB',
      t,
    );
    expect(content.title).toBe('rhythm:stripLapsedTitle(count=11)');
    expect(content.note).toBe('rhythm:stripLapsedNote');
    expect(content.ring).toBeNull();
  });

  test('toward the month, on track: the count, in the month being counted', () => {
    // The approved Home frame: "Next: A month of Sundays · 2 of 4 in September".
    const content = stripContent(
      rhythm('active', {
        currentWeeks: 2,
        ...towardMonth(2, 4, '2026-09-01'),
      }),
      'en-GB',
      t,
    );
    expect(content.title).toBe('rhythm:stripWeeks(count=2)');
    expect(content.note).toBe(
      `rhythm:stripMonthProgress(name=${MONTH},done=2,total=4,month=September)`,
    );
    expect(content.ring).toEqual({ label: '2', fraction: 0.5 });
  });

  test('toward the month with nothing counted yet: the month, and no zero anywhere', () => {
    const content = stripContent(
      rhythm('active', {
        currentWeeks: 3,
        ...towardMonth(0, 4, '2026-10-01'),
      }),
      'en-GB',
      t,
    );
    expect(content.note).toBe(
      `rhythm:stripMonthAhead(name=${MONTH},month=October)`,
    );
    expect(content.note).not.toMatch(/done=0/);
    // An EMPTY TRACK, decided with Ayo over hiding the ring: the label is the
    // run, so the ring still says 3 rather than 0.
    expect(content.ring).toEqual({ label: '3', fraction: 0 });
  });

  test('grace: the missed week is named as covered, and the ring still counts', () => {
    // Grace in a month already out of reach: the grace sentence, and the track
    // left empty rather than removed.
    const content = stripContent(
      rhythm('grace', {
        currentWeeks: 5,
        longestWeeks: 11,
        ...towardMonth(0, 4, '2026-10-01'),
      }),
      'en-GB',
      t,
    );
    // The run is CARRIED across the missed week, so the number does not drop.
    expect(content.title).toBe('rhythm:stripWeeks(count=5)');
    expect(content.note).toBe('rhythm:stripGraceNote');
    expect(content.ring).toEqual({ label: '5', fraction: 0 });
  });

  test('the month held: the season is named, and the ring is the run through calendar time', () => {
    const content = stripContent(
      rhythm('active', {
        currentWeeks: 6,
        ...towardRung('12_week_rhythm', 5, 13),
      }),
      'en-GB',
      t,
    );
    expect(content.note).toBe(`rhythm:nextNamed(name=${SEASON})`);
    expect(content.ring?.label).toBe('6');
    expect(content.ring?.fraction).toBeCloseTo(5 / 13, 5);
  });

  test('a server that names nothing next gets the run and no ring, never a guess', () => {
    // A build talking to a database without W4.16's migration.
    const content = stripContent(
      rhythm('active', { currentWeeks: 4 }),
      'en-GB',
      t,
    );
    expect(content.title).toBe('rhythm:stripWeeks(count=4)');
    expect(content.note).toBe('');
    expect(content.ring).toBeNull();
  });

  test('no state ever renders a bare zero as the headline', () => {
    const phases: RhythmPhase[] = ['none', 'active', 'grace', 'lapsed'];
    for (const phase of phases) {
      const content = stripContent(
        rhythm(phase, { longestWeeks: 3, ...towardMonth(0, 4, '2026-10-01') }),
        'en-GB',
        t,
      );
      expect(content.title).not.toMatch(/count=0/);
      expect(content.ring?.label).not.toBe('0');
    }
  });
});

describe('the Next card, every shape', () => {
  test('a five-Sunday month says four of five, not a month', () => {
    const progress = nextProgress(
      rhythm('active', { currentWeeks: 4, ...towardMonth(4, 5, '2026-11-01') }),
      'en-GB',
      t,
    );
    expect(progress?.title).toBe(`rhythm:nextNamed(name=${MONTH})`);
    expect(progress?.distance).toBe(
      'rhythm:monthProgress(done=4,total=5,month=November)',
    );
    expect(progress?.fraction).toBeCloseTo(0.8, 5);
  });

  test('nothing counted yet toward the month names the month alone', () => {
    const progress = nextProgress(
      rhythm('active', { currentWeeks: 3, ...towardMonth(0, 4, '2026-10-01') }),
      'en-GB',
      t,
    );
    expect(progress?.distance).toBe('rhythm:monthAhead(month=October)');
    expect(progress?.fraction).toBe(0);
  });

  test('toward a time rung, the weeks left', () => {
    const progress = nextProgress(
      rhythm('active', {
        currentWeeks: 6,
        ...towardRung('12_week_rhythm', 5, 13),
      }),
      'en-GB',
      t,
    );
    expect(progress?.distance).toBe('rhythm:weeksToGo(count=8)');
  });

  test('a full count is "almost there", never "0 weeks to go"', () => {
    // The anniversary is this week or has passed with no gathering since: the
    // next gathering on or after it earns the badge.
    const progress = nextProgress(
      rhythm('grace', {
        currentWeeks: 12,
        ...towardRung('12_week_rhythm', 13, 13),
      }),
      'en-GB',
      t,
    );
    expect(progress?.distance).toBe('rhythm:almostThere');
    expect(progress?.fraction).toBe(1);
  });

  test('a returning member is pointed past what they hold, and far away still reads kindly', () => {
    const progress = nextProgress(
      rhythm('active', {
        currentWeeks: 2,
        ...towardRung('26_week_rhythm', 1, 26),
      }),
      'en-GB',
      t,
    );
    expect(progress?.title).toBe(
      'rhythm:nextNamed(name=rhythm:milestoneHalfYear)',
    );
    expect(progress?.distance).toBe('rhythm:weeksToGo(count=25)');
  });

  test('past the named tiers the name is generated, because the ladder has no top', () => {
    const progress = nextProgress(
      rhythm('active', {
        currentWeeks: 60,
        ...towardRung('104_week_rhythm', 104, 105),
      }),
      'en-GB',
      t,
    );
    expect(progress?.title).toBe(
      'rhythm:nextNamed(name=rhythm:milestoneYears(count=2))',
    );
    expect(progress?.distance).toBe('rhythm:weeksToGo(count=1)');
  });

  test('the month is named in the member language, from a date that cannot slip a day', () => {
    const progress = nextProgress(
      rhythm('active', { currentWeeks: 2, ...towardMonth(2, 4, '2026-10-01') }),
      'de-DE',
      t,
    );
    // 1 October, formatted anywhere west of UTC without the carrier, is 30
    // September: the card would count toward the wrong month.
    expect(progress?.distance).toBe(
      'rhythm:monthProgress(done=2,total=4,month=Oktober)',
    );
  });

  test('nothing true to say means no card: an unknown kind, no total, or no month', () => {
    expect(
      nextProgress(
        rhythm('active', { ...towardRung('plan_7_days', 1, 7) }),
        'en-GB',
        t,
      ),
    ).toBeNull();
    expect(
      nextProgress(
        rhythm('active', { ...towardRung('12_week_rhythm', 0, 0) }),
        'en-GB',
        t,
      ),
    ).toBeNull();
    expect(
      nextProgress(
        rhythm('active', { ...towardMonth(1, 4, 'not-a-date') }),
        'en-GB',
        t,
      ),
    ).toBeNull();
  });

  test('the ring and the bar are one fraction, and it never leaves 0..1', () => {
    const over = nextProgress(
      rhythm('active', { ...towardRung('12_week_rhythm', 20, 13) }),
      'en-GB',
      t,
    );
    expect(over?.fraction).toBe(1);
    const strip = stripContent(
      rhythm('active', {
        currentWeeks: 6,
        ...towardRung('12_week_rhythm', 5, 13),
      }),
      'en-GB',
      t,
    );
    const card = nextProgress(
      rhythm('active', {
        currentWeeks: 6,
        ...towardRung('12_week_rhythm', 5, 13),
      }),
      'en-GB',
      t,
    );
    expect(strip.ring?.fraction).toBe(card?.fraction);
  });
});
