// What the rhythm milestone kinds are CALLED. Never whether one was reached.
//
// The server awards (`attendance_after_insert`) and the server says what is next and
// how far along it is (`rhythm_state`'s `next_kind` and `progress_*`, W4.16). This
// file used to mirror the week ladder so a screen could count toward the next rung
// itself, and that mirror is gone on purpose: since W4.16 a month of Sundays is every
// week of one calendar month and a season is three calendar months, which depends on
// "today" in the browsed branch's timezone and on which badges the member already
// holds, and the app decides neither.
//
// THE WEEK-RHYTHM KINDS ARE IDENTIFIERS, NOT COUNTS. They kept their names when W4.16
// moved them onto the calendar: `4_week_rhythm` is a month of Sundays, `12_week_rhythm`
// a season, `26_week_rhythm` half a year, `52_week_rhythm` a year and `<52n>_week_rhythm`
// n years. Renaming them would re-celebrate every badge already held, because
// `celebrated.ts` keeps each device's list of kinds it has told (and a renamed kind
// reads as news). So the numbers below are parsed as names; do not "fix" them into
// weeks.
//
// Both ladders are endless, which is the whole point of W2.8 slice 5: `4, 12, done`
// meant the ring sat permanently full and nothing was ever celebrated again for the
// people who show up most.

/** Named gathering tiers; past the last one it is one rung per hundred, forever. */
const NAMED_GATHERING_RUNGS = [10, 25, 50, 100] as const;
/** The identifier step of the yearly kinds: `104_week_rhythm` is two years. */
const WEEKS_IN_YEAR = 52;
const GATHERINGS_PER_RUNG = 100;

/**
 * What a milestone kind IS, once read.
 *
 * `milestones.kind` is TEXT on purpose ("kinds are data, so a new one needs no
 * migration"), and with an endless ladder a fixed catalog is no longer possible:
 * there is no list that contains `520_week_rhythm`. So the week rungs and the
 * gathering counts are PARSED (`<n>_week_rhythm`, `<n>_gatherings`) and only the
 * genuinely named kinds are looked up.
 *
 * `count` is what the label interpolates. A kind this build cannot read at all
 * still returns null, and callers still drop it rather than render its raw key at
 * somebody: a milestone the app cannot name is a missing translation, not
 * something to celebrate with a string like `plan_7_days`.
 */
export interface MilestoneBadge {
  kind: string;
  /** Decorative; the label is what assistive tech reads. */
  glyph: string;
  labelKey: string;
  celebrateTitleKey: string;
  celebrateBodyKey: string;
  /** Interpolated into all three keys when the tier is generated rather than named. */
  count?: number;
  /**
   * "Your 50th gathering" is an ORDINAL, and i18next selects `_ordinal_*` forms
   * only when told: `{ count }` alone looks for `_one`/`_other`, finds neither,
   * and renders the raw key at the member. Seen on the phone reading
   * "milestoneGatherings" (2026-08-09), which is the exact trap this slice's
   * plan warned about.
   */
  ordinal?: true;
}

/** The kinds that are a name rather than a number. */
const NAMED_KINDS: readonly MilestoneBadge[] = [
  {
    kind: 'first_service',
    glyph: '🎉',
    labelKey: 'rhythm:milestoneFirstService',
    celebrateTitleKey: 'rhythm:celebrateFirstServiceTitle',
    celebrateBodyKey: 'rhythm:celebrateFirstServiceBody',
  },
  {
    kind: 'first_prayer',
    glyph: '🙏',
    labelKey: 'rhythm:milestoneFirstPrayer',
    celebrateTitleKey: 'rhythm:celebrateFirstPrayerTitle',
    celebrateBodyKey: 'rhythm:celebrateFirstPrayerBody',
  },
  {
    kind: 'first_testimony',
    glyph: '✦',
    labelKey: 'rhythm:milestoneFirstTestimony',
    celebrateTitleKey: 'rhythm:celebrateFirstTestimonyTitle',
    celebrateBodyKey: 'rhythm:celebrateFirstTestimonyBody',
  },
];

/**
 * The named week tiers, in church language rather than counted: a month of
 * Sundays, a season, half a year, a year (decided with Ayo 2026-08-08). Past
 * them the label is generated from the number of years, because "a season" does
 * not extend to eleven of them.
 */
const WEEK_TIERS: Record<number, { glyph: string; key: string } | undefined> = {
  4: { glyph: '🔥', key: 'FourWeek' },
  12: { glyph: '🌟', key: 'TwelveWeek' },
  26: { glyph: '🕊️', key: 'HalfYear' },
  52: { glyph: '👑', key: 'Year' },
};

function weekBadge(kind: string, weeks: number): MilestoneBadge | null {
  const tier = WEEK_TIERS[weeks];
  if (tier) {
    return {
      kind,
      glyph: tier.glyph,
      labelKey: `rhythm:milestone${tier.key}`,
      celebrateTitleKey: `rhythm:celebrate${tier.key}Title`,
      celebrateBodyKey: `rhythm:celebrate${tier.key}Body`,
    };
  }
  // Generated: only whole years past the named tiers are ever awarded, so a
  // remainder means a kind from some other ladder and is not ours to name.
  if (weeks <= WEEKS_IN_YEAR || weeks % WEEKS_IN_YEAR !== 0) return null;
  return {
    kind,
    glyph: '💛',
    labelKey: 'rhythm:milestoneYears',
    celebrateTitleKey: 'rhythm:celebrateYearsTitle',
    celebrateBodyKey: 'rhythm:celebrateYearsBody',
    count: weeks / WEEKS_IN_YEAR,
  };
}

function gatheringBadge(kind: string, total: number): MilestoneBadge | null {
  const named = (NAMED_GATHERING_RUNGS as readonly number[]).includes(total);
  const generated =
    total > GATHERINGS_PER_RUNG && total % GATHERINGS_PER_RUNG === 0;
  if (!named && !generated) return null;
  return {
    kind,
    glyph: '🎉',
    labelKey: 'rhythm:milestoneGatherings',
    celebrateTitleKey: 'rhythm:celebrateGatheringsTitle',
    celebrateBodyKey: 'rhythm:celebrateGatheringsBody',
    count: total,
    ordinal: true,
  };
}

/** The badge for a kind, or null for one this build cannot read. */
export function badgeFor(kind: string): MilestoneBadge | null {
  const named = NAMED_KINDS.find((badge) => badge.kind === kind);
  if (named) return named;

  const weeks = /^(\d+)_week_rhythm$/.exec(kind);
  if (weeks) return weekBadge(kind, Number(weeks[1]));

  const gatherings = /^(\d+)_gatherings$/.exec(kind);
  if (gatherings) return gatheringBadge(kind, Number(gatherings[1]));

  return null;
}

/**
 * The earned badges, oldest first.
 *
 * Ordered by ACHIEVEMENT now rather than by a fixed ladder position, because
 * with two endless ladders interleaving there is no single order to sort by: a
 * member reaches their fiftieth gathering somewhere between their first year and
 * their second. The rows arrive oldest-first from the server, which is the order
 * they actually happened in.
 */
export function earnedBadges(kinds: readonly string[]): MilestoneBadge[] {
  return kinds
    .map(badgeFor)
    .filter((badge): badge is MilestoneBadge => badge !== null);
}

/**
 * What the `none` state offers as "What's ahead", in the frame's own order:
 * turn up, keep turning up, and pray with somebody. Deliberately NOT the top of
 * the ladder in order, which would put a year of Sundays in front of a member who
 * has never been, and deliberately not everything unearned, which would read as
 * a list of things not done yet.
 */
const AHEAD_ORDER: readonly string[] = [
  'first_service',
  '4_week_rhythm',
  'first_prayer',
];

/**
 * The `none` state's "What's ahead", minus anything already earned: a member can
 * reach RHYTHM with `first_prayer` behind them and no attendance at all, because
 * content milestones are awarded on approval and have nothing to do with Sundays.
 * Showing them that one as still ahead would be the app forgetting something they
 * actually did.
 */
export function aheadBadges(kinds: readonly string[]): MilestoneBadge[] {
  return AHEAD_ORDER.filter((kind) => !kinds.includes(kind))
    .map(badgeFor)
    .filter((badge): badge is MilestoneBadge => badge !== null);
}
