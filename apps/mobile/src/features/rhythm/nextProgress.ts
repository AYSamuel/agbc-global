import { formatMonthName } from './format';
import type { Translate } from './heroContent';
import { badgeFor } from './milestones';
import type { RhythmState } from './queries';

// What comes next on the rhythm, and how far along it is, as words and one
// fraction (W4.16; mockup section "W4.16 · The rhythm keeps a real calendar").
//
// ONE OWNER FOR "HOW FAR ALONG". Home's ring and RHYTHM's bar both draw
// `fraction` from here, because they sit one tap apart and two computations of
// the same progress are how they would end up disagreeing. Every number comes
// from `rhythm_state()`: which milestone is next (it skips what the member
// already holds), which month is being counted and in which timezone "today"
// fell. The app divides two of those numbers and chooses the words; it never
// counts a week.
//
// THE WORDS NEVER READ A ZERO AND NEVER NAME A MISS (the approved frames). While
// nothing counts toward the month yet, whether because its first week has had
// no gathering so far or because one of its weeks already ended without one,
// the line names the month and nothing else: "in October". A full count toward
// a time rung says "Almost there", never "0 weeks to go": the anniversary is
// this week or has passed, and the next gathering on or after it earns it.

export interface NextProgress {
  /** "Next: A season with us": the Next card's title. */
  title: string;
  /** The Next card's right-hand line: "2 of 4 in September", "8 weeks to go". */
  distance: string;
  /** Home's strip note: "Next: A month of Sundays · 2 of 4 in September". */
  stripNote: string;
  /** 0..1 of the ring and the bar. */
  fraction: number;
}

/**
 * `null` when there is nothing true to say: the server named no next milestone
 * (an older database), a kind this build cannot name, or a month it cannot
 * format. The callers then draw no ring and no card rather than a guess.
 */
export function nextProgress(
  rhythm: RhythmState,
  locale: string,
  t: Translate,
): NextProgress | null {
  const { nextKind, progressDone: done, progressTotal: total } = rhythm;
  if (nextKind === null || total < 1) return null;

  const badge = badgeFor(nextKind);
  if (badge === null) return null;

  const name = t(badge.labelKey, { count: badge.count });
  const title = t('rhythm:nextNamed', { name });
  const fraction = Math.max(0, Math.min(1, done / total));

  if (rhythm.progressMonth !== null) {
    const month = formatMonthName(rhythm.progressMonth, locale);
    if (month === '') return null;
    return done >= 1
      ? {
          title,
          distance: t('rhythm:monthProgress', { done, total, month }),
          stripNote: t('rhythm:stripMonthProgress', {
            name,
            done,
            total,
            month,
          }),
          fraction,
        }
      : {
          title,
          distance: t('rhythm:monthAhead', { month }),
          stripNote: t('rhythm:stripMonthAhead', { name, month }),
          fraction,
        };
  }

  const left = total - done;
  return {
    title,
    distance:
      left < 1
        ? t('rhythm:almostThere')
        : t('rhythm:weeksToGo', { count: left }),
    // Toward a time rung the strip names the rung alone, as it always has: the
    // ring carries the distance, and the card one tap away says it in words.
    stripNote: title,
    fraction,
  };
}
