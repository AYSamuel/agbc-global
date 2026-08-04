import { useTranslation } from 'react-i18next';

import { formatDate, relativeAge } from './format';

/**
 * The mockup's "2h" / "5h" / "1d" meta line, translated. Past a week it becomes a
 * real date, because "9d" stops carrying meaning.
 *
 * Reads the clock once per render rather than ticking: a feed card does not need
 * a live-updating timestamp, and a per-card interval on a 50-row list is a real
 * cost for a cosmetic gain. The 60s feed poll re-renders these anyway.
 */
export function useRelativeAgeLabel(iso: string): string {
  const { t, i18n } = useTranslation();
  const age = relativeAge(iso, new Date());
  switch (age.unit) {
    case 'now':
      return t('family:ageNow');
    case 'minute':
      return t('family:ageMinutes', { count: age.count });
    case 'hour':
      return t('family:ageHours', { count: age.count });
    case 'day':
      return t('family:ageDays', { count: age.count });
    case 'date':
      return formatDate(age.iso, i18n.language);
  }
}

/**
 * The same instant in words: "3 min ago", "Yesterday", "2 days ago".
 *
 * MY-POSTS' frame writes its times out where the feed cards abbreviate them ("5h"), and
 * that is the right way round: a feed card is scanned in a column of twenty and needs to
 * be terse, while the author of four posts is reading each line. Same classification,
 * different vocabulary, so the two can never disagree about which day it is.
 *
 * The frame's oldest card says "1 week ago"; past the relative ceiling this still gives
 * way to a real date, which is what every other surface in the app does at that age and
 * what the detail screens show.
 */
export function useVerboseAgeLabel(iso: string): string {
  const { t, i18n } = useTranslation();
  const age = relativeAge(iso, new Date());
  switch (age.unit) {
    case 'now':
      return t('family:ageNow');
    case 'minute':
      return t('family:ageMinutesAgo', { count: age.count });
    case 'hour':
      return t('family:ageHoursAgo', { count: age.count });
    case 'day':
      // Yesterday is a word people use; "1 day ago" is a computer's way of saying it.
      return age.count === 1
        ? t('family:ageYesterday')
        : t('family:ageDaysAgo', { count: age.count });
    case 'date':
      return formatDate(age.iso, i18n.language);
  }
}
