import { milestoneFraction, nextMilestone } from '../milestones';
import { stripContent } from '../StreakStrip';
import type { RhythmPhase, RhythmState } from '../queries';

// The four states of `rhythm_state` as the strip renders them (docs/spec/10).
// Pure, so what each state SAYS can be asserted without a screen: the copy is
// the whole feature here, and "never a scold" is a testable claim.

// A translator that returns the key plus its interpolated count, so a test can
// see which sentence was chosen and with which number, without asserting on
// English that W4.6 will translate.
function t(key: string, options?: Record<string, unknown>): string {
  const count = options?.count;
  const name = options?.name;
  // The next rung is NAMED now, so the stub has to show which name it was given.
  if (typeof name === 'string') return `${key}(${name})`;
  return typeof count === 'number' ? `${key}:${String(count)}` : key;
}

function rhythm(
  phase: RhythmPhase,
  over: Partial<RhythmState> = {},
): RhythmState {
  return {
    today: '2026-08-09',
    checkedIn: false,
    phase,
    currentWeeks: 0,
    longestWeeks: 0,
    lastServiceDate: null,
    ...over,
  };
}

describe('the strip in each state', () => {
  test('none: an invitation, and no ring to be part of the way round', () => {
    const content = stripContent(rhythm('none'), t);
    expect(content.title).toBe('rhythm:stripNoneTitle');
    expect(content.note).toBe('rhythm:stripNoneNote');
    expect(content.ring).toBeNull();
  });

  test('active: the live streak leads, and the note points at the next rung', () => {
    const content = stripContent(
      rhythm('active', { currentWeeks: 5, longestWeeks: 11 }),
      t,
    );
    expect(content.title).toBe('rhythm:stripWeeks:5');
    expect(content.note).toBe('rhythm:nextNamed(rhythm:milestoneTwelveWeek)');
    expect(content.ring).toEqual({ label: '5', fraction: 5 / 12 });
  });

  test('grace: the run still leads, and the missed week is named as covered', () => {
    const content = stripContent(
      rhythm('grace', { currentWeeks: 5, longestWeeks: 11 }),
      t,
    );
    // The run is CARRIED across the missed week, so the number does not drop.
    expect(content.title).toBe('rhythm:stripWeeks:5');
    expect(content.note).toBe('rhythm:stripGraceNote');
    expect(content.ring).not.toBeNull();
  });

  test('lapsed: the longest leads, because the live streak is 0', () => {
    // A 58px gold 0 is exactly the scold docs/spec/10 forbids.
    const content = stripContent(
      rhythm('lapsed', { currentWeeks: 0, longestWeeks: 11 }),
      t,
    );
    expect(content.title).toBe('rhythm:stripLapsedTitle:11');
    expect(content.note).toBe('rhythm:stripLapsedNote');
    expect(content.ring).toBeNull();
  });

  test('there is no top rung to fall off (W2.8 slice 5)', () => {
    // The strip used to run out of ladder and say a "steady rhythm" sentence
    // with a permanently full ring, which is the dead end this slice removed:
    // the most faithful members were the ones it stopped rewarding.
    const twenty = stripContent(rhythm('active', { currentWeeks: 20 }), t);
    expect(twenty.note).toBe('rhythm:nextNamed(rhythm:milestoneHalfYear)');
    expect(twenty.ring?.fraction).toBeCloseTo(20 / 26, 5);

    const decade = stripContent(rhythm('active', { currentWeeks: 520 }), t);
    // Eleven years in: past the named tiers, the name is generated.
    expect(decade.note).toBe('rhythm:nextNamed(rhythm:milestoneYears:11)');
    expect(decade.ring?.fraction).toBeCloseTo(520 / 572, 5);
  });

  test('no state ever renders a bare zero as the headline', () => {
    const phases: RhythmPhase[] = ['none', 'active', 'grace', 'lapsed'];
    for (const phase of phases) {
      const content = stripContent(rhythm(phase, { longestWeeks: 3 }), t);
      expect(content.title).not.toMatch(/:0$/);
    }
  });
});

describe('the milestone ladder', () => {
  test('mirrors the server ladder: 4, 12, 26, 52, then a year at a time', () => {
    // rhythm_week_rungs() in 20260808214722. Two implementations of one ladder
    // is a drift risk, so these are the same numbers pgTAP 031 asserts.
    expect(nextMilestone(0)).toBe(4);
    expect(nextMilestone(3)).toBe(4);
    expect(nextMilestone(4)).toBe(12);
    expect(nextMilestone(12)).toBe(26);
    expect(nextMilestone(26)).toBe(52);
    expect(nextMilestone(52)).toBe(104);
    expect(nextMilestone(103)).toBe(104);
    expect(nextMilestone(104)).toBe(156);
    // Ten years in, there is still one more.
    expect(nextMilestone(520)).toBe(572);
  });

  test('the ring is weeks over the next rung, exactly as the frames draw it', () => {
    // The approved frames are the reference: `1` is a 90deg arc (1/4) and `5` is
    // 150deg (5/12). Restarting the arc at each rung would empty the ring at the
    // moment a milestone is reached, which is the opposite of a reward.
    expect(milestoneFraction(1)).toBe(0.25);
    expect(milestoneFraction(5)).toBeCloseTo(5 / 12, 5);
    expect(milestoneFraction(0)).toBe(0);
    expect(milestoneFraction(4)).toBeCloseTo(4 / 12, 5);
    // Past a rung the ring refills toward the next one rather than sticking full.
    expect(milestoneFraction(12)).toBeCloseTo(12 / 26, 5);
    expect(milestoneFraction(52)).toBeCloseTo(52 / 104, 5);
  });
});
