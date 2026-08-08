// The rhythm milestone ladder, as the SERVER awards it.
//
// `attendance_after_insert` (20260807120000) awards `4_week_rhythm` at four weeks
// and `12_week_rhythm` at twelve. This list exists so the strip can say what is
// next; it never decides that a milestone was reached, which is the trigger's job
// and the trigger's alone. If the ladder ever changes it changes in SQL first,
// and this follows in the same PR.
//
// AND IT IS ABOUT TO CHANGE. Two rungs is a dead end: past twelve weeks the ring
// sits full and nothing is ever celebrated again. The endless ladder (4, 12, 26,
// 52, then yearly, plus cumulative gathering counts) is decided and specified in
// docs/spec/plans/W2.8-member-home-and-rhythm.md; it lands with its migration.
// Nothing here needs to anticipate it beyond knowing that this array grows.
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

/**
 * The badge for each milestone kind the server can award today.
 *
 * `milestones.kind` is TEXT on purpose ("kinds are data, so a new one needs no
 * migration"), so this list is the app's side of that bargain rather than a
 * mirror of a database enum. A kind that arrives without an entry here is left
 * out of the badges instead of rendering its raw key at somebody: a milestone
 * the app cannot name yet is a missing translation, not something to celebrate
 * with a string like `plan_7_days`. Adding a kind server-side therefore means
 * adding it here, in the same PR, which is the same rule the week ladder above
 * already keeps.
 *
 * The glyphs are the approved frames' verbatim (W2.8 "RHYTHM · grace" and
 * "· lapsed"); `12_week_rhythm` is the one the frames never drew, and it takes
 * the star because the rung above fire should read as further, not louder. The
 * labels are i18n keys, because the glyph is decoration and the word is copy.
 */
export interface MilestoneBadge {
  kind: string;
  /** Decorative; the label is what assistive tech reads. */
  glyph: string;
  labelKey: string;
}

export const MILESTONE_BADGES: readonly MilestoneBadge[] = [
  {
    kind: 'first_service',
    glyph: '🎉',
    labelKey: 'rhythm:milestoneFirstService',
  },
  { kind: '4_week_rhythm', glyph: '🔥', labelKey: 'rhythm:milestoneFourWeek' },
  {
    kind: '12_week_rhythm',
    glyph: '🌟',
    labelKey: 'rhythm:milestoneTwelveWeek',
  },
  {
    kind: 'first_prayer',
    glyph: '🙏',
    labelKey: 'rhythm:milestoneFirstPrayer',
  },
  {
    kind: 'first_testimony',
    glyph: '✦',
    labelKey: 'rhythm:milestoneFirstTestimony',
  },
] as const;

/**
 * What the `none` state offers as "What's ahead", in the frame's own order:
 * turn up, keep turning up, and pray with somebody. Deliberately NOT the top of
 * the ladder in order, which would put "12-week rhythm" in front of a member who
 * has never been, and deliberately not everything unearned, which would read as
 * a list of things not done yet.
 */
const AHEAD_ORDER: readonly string[] = [
  'first_service',
  '4_week_rhythm',
  'first_prayer',
];

/** The earned badges, in ladder order; unknown kinds are dropped (see above). */
export function earnedBadges(kinds: readonly string[]): MilestoneBadge[] {
  return MILESTONE_BADGES.filter((badge) => kinds.includes(badge.kind));
}

/**
 * The `none` state's "What's ahead", minus anything already earned: a member can
 * reach RHYTHM with `first_prayer` behind them and no attendance at all, because
 * content milestones are awarded on approval and have nothing to do with Sundays.
 * Showing them that one as still ahead would be the app forgetting something they
 * actually did.
 */
export function aheadBadges(kinds: readonly string[]): MilestoneBadge[] {
  return AHEAD_ORDER.filter((kind) => !kinds.includes(kind)).flatMap((kind) =>
    MILESTONE_BADGES.filter((badge) => badge.kind === kind),
  );
}
