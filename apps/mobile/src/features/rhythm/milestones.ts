// The rhythm milestone ladder, as the SERVER awards it.
//
// `attendance_after_insert` (20260807120000) awards `4_week_rhythm` at four weeks
// and `12_week_rhythm` at twelve. This list exists so the strip can say what is
// next; it never decides that a milestone was reached, which is the trigger's job
// and the trigger's alone. If the ladder ever changes it changes in SQL first,
// and this follows in the same PR.
export const RHYTHM_MILESTONES = [4, 12] as const;

/**
 * The next rung above `weeks`, or null once the member is past the last one.
 * Past the top is not an ending: the strip simply stops counting down to
 * something and says the steady thing instead (docs/spec/10: never a nag).
 */
export function nextMilestone(weeks: number): number | null {
  return RHYTHM_MILESTONES.find((rung) => rung > weeks) ?? null;
}

/**
 * How full the ring is: weeks over the NEXT rung, counted from zero.
 *
 * Taken from the approved frames rather than from taste, which is the point of
 * having them: `1` draws a 90deg arc (1/4, the first rung) and `5` draws 150deg
 * (5/12). An earlier version restarted the arc at each rung, which is defensible
 * in the abstract and wrong here twice over: it disagrees with the frame, and it
 * renders an EMPTY ring the moment a member reaches four weeks, so the reward for
 * hitting a milestone is a circle with nothing in it (seen on the phone,
 * 2026-08-08). Past the top rung it reads full, because it is.
 */
export function milestoneFraction(weeks: number): number {
  const next = nextMilestone(weeks);
  if (next === null) return 1;
  return Math.max(0, Math.min(1, weeks / next));
}
