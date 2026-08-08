import { useTranslation } from 'react-i18next';

import { StatusPanel, type StatusPanelRing } from '@/components/ui';

import { milestoneFraction, nextMilestone } from './milestones';
import type { RhythmState } from './queries';

// Home's rhythm strip (docs/spec/07 §7, mockup W2.8 "the rhythm strip, all four
// states"): the ink `.rhythm` panel, in whichever of `rhythm_state`'s four
// states the member is in.
//
// EVERY number here is the server's. The app chooses a sentence and nothing
// else: the grace maths, the DST handling and what counts as a week are settled
// in SQL and asserted in pgTAP 030 (docs/spec/10).
//
// THE RING appears only while a run is in progress. It is progress toward the
// next milestone, and in `none` and `lapsed` there is no run to be part of the
// way through: a big gold 0 is exactly the scold `10` forbids, so the panel
// carries the sentence alone.

export interface StripContent {
  title: string;
  note: string;
  ring: StatusPanelRing | null;
}

/**
 * Pure so the four states can be asserted without rendering (and so the copy
 * decision sits in one readable place).
 */
export function stripContent(
  rhythm: RhythmState,
  t: (key: string, options?: Record<string, unknown>) => string,
): StripContent {
  // The invitation also covers a running state with nothing to count. The server
  // does not produce one (a streak row exists only once attendance does, and
  // `none` is what a member without it gets), but "0-week rhythm" is the exact
  // scold `10` forbids, so the one place it could ever be rendered says
  // something kind instead of trusting that it cannot happen.
  if (rhythm.phase === 'none' || rhythm.currentWeeks < 1) {
    if (rhythm.phase !== 'lapsed') {
      return {
        title: t('rhythm:stripNoneTitle'),
        note: t('rhythm:stripNoneNote'),
        ring: null,
      };
    }
  }

  if (rhythm.phase === 'lapsed') {
    // The live streak reads 0 here and the longest is untouched, so the longest
    // is what leads: it is the true thing that also encourages (docs/spec/10).
    return {
      title: t('rhythm:stripLapsedTitle', { count: rhythm.longestWeeks }),
      note: t('rhythm:stripLapsedNote'),
      ring: null,
    };
  }

  const upcoming = nextMilestone(rhythm.currentWeeks);
  return {
    title: t('rhythm:stripWeeks', { count: rhythm.currentWeeks }),
    note:
      rhythm.phase === 'grace'
        ? // The one line that names the missed week, and it names it as covered.
          t('rhythm:stripGraceNote')
        : upcoming === null
          ? t('rhythm:stripSteadyNote')
          : t('rhythm:stripNextNote', { count: upcoming }),
    ring: {
      label: String(rhythm.currentWeeks),
      fraction: milestoneFraction(rhythm.currentWeeks),
    },
  };
}

export function StreakStrip({ rhythm }: { rhythm: RhythmState }) {
  const { t } = useTranslation();
  const { title, note, ring } = stripContent(rhythm, t);

  return (
    <StatusPanel
      label={t('rhythm:stripLabel')}
      title={title}
      note={note}
      ring={ring}
      // docs/spec/05: the strip is grouped and reads as one phrase rather than
      // three fragments ("5-week rhythm, next milestone 12 weeks").
      accessibilityLabel={`${title}. ${note}`}
    />
  );
}
