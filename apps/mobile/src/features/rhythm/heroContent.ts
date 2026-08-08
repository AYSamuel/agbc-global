import { formatGatheredDate } from './format';
import type { RhythmState } from './queries';

// RHYTHM's hero, as a decision about copy and nothing else (mockup frames
// "RHYTHM · streak, grace-framed", "· grace", "· lapsed").
//
// Pure, so all four states can be asserted without rendering, and so the one
// judgement `10` cares most about is readable in one place: WHICH NUMBER LEADS.
// The server hands the screen `current_weeks` and `longest_weeks`; choosing
// between them is the whole difference between encouragement and a scold.

export interface HeroContent {
  /** The 58px gold number. Already a string: it is a glyph, not arithmetic. */
  number: string;
  /** The uppercase unit under it. */
  unit: string;
  /** The sentence. */
  headline: string;
  /** The quiet line beneath, when there is one worth saying. */
  footnote: string | null;
}

export type Translate = (
  key: string,
  options?: Record<string, unknown>,
) => string;

/**
 * `null` means "this member has no hero", which is the `none` state: the screen
 * shows the invitation instead. Also returned for a lapsed member whose longest
 * is somehow zero, which the server does not produce (lapsed implies attendance
 * happened) but which would otherwise render a 58px gold **0**, the exact scold
 * `10` forbids. One guard, in the one place the number is chosen.
 */
export function heroContent(
  rhythm: RhythmState,
  locale: string,
  t: Translate,
): HeroContent | null {
  if (rhythm.phase === 'none') return null;

  if (rhythm.phase === 'lapsed') {
    if (rhythm.longestWeeks < 1) return null;
    // The live streak reads 0 here and the longest is untouched (docs/spec/10:
    // "monotonic; never taken away"), so the longest is what leads. Nothing on
    // this screen counts down to a next milestone either: the ring and the
    // progress bar are progress through a run, and there is no run in progress.
    return {
      number: String(rhythm.longestWeeks),
      unit: t('rhythm:heroUnitLongest', { count: rhythm.longestWeeks }),
      headline: t('rhythm:heroLapsed'),
      footnote:
        rhythm.lastServiceDate === null
          ? null
          : t('rhythm:heroLastGathered', {
              date: formatGatheredDate(rhythm.lastServiceDate, locale),
            }),
    };
  }

  // active and grace both lead with the live run: in `grace` the missed week is
  // carried, and the run is genuinely still standing (docs/spec/10, and the
  // arithmetic is `recompute_streak`'s, never this file's). The same defensive
  // floor as the strip: a running state with nothing to count would say
  // "0-week rhythm", so it says the invitation instead.
  if (rhythm.currentWeeks < 1) return null;

  return {
    number: String(rhythm.currentWeeks),
    unit: t('rhythm:heroUnitWeeks'),
    headline:
      rhythm.phase === 'grace'
        ? t('rhythm:heroGrace', { count: rhythm.currentWeeks })
        : t('rhythm:heroActive', { count: rhythm.currentWeeks }),
    // Only when it is a bigger number than the one already on screen. Repeating
    // the current run back as "your longest" says nothing, and this line exists
    // to hold onto something that was earned, not to grade today against it.
    footnote:
      rhythm.longestWeeks > rhythm.currentWeeks
        ? t('rhythm:heroLongest', { count: rhythm.longestWeeks })
        : null,
  };
}
