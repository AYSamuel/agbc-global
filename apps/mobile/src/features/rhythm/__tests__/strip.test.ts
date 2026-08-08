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
    expect(content.note).toBe('rhythm:stripNextNote:12');
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

  test('past the top rung: it stops counting down instead of nagging', () => {
    const content = stripContent(rhythm('active', { currentWeeks: 20 }), t);
    expect(content.note).toBe('rhythm:stripSteadyNote');
    expect(content.ring).toEqual({ label: '20', fraction: 1 });
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
  test('follows the server trigger: 4 then 12, then nothing to chase', () => {
    expect(nextMilestone(0)).toBe(4);
    expect(nextMilestone(3)).toBe(4);
    expect(nextMilestone(4)).toBe(12);
    expect(nextMilestone(12)).toBeNull();
  });

  test('the ring is weeks over the next rung, exactly as the frames draw it', () => {
    // The approved frames are the reference: `1` is a 90deg arc (1/4) and `5` is
    // 150deg (5/12). Restarting the arc at each rung would empty the ring at the
    // moment a milestone is reached, which is the opposite of a reward.
    expect(milestoneFraction(1)).toBe(0.25);
    expect(milestoneFraction(5)).toBeCloseTo(5 / 12, 5);
    expect(milestoneFraction(0)).toBe(0);
    expect(milestoneFraction(4)).toBeCloseTo(4 / 12, 5);
    expect(milestoneFraction(12)).toBe(1);
  });
});
