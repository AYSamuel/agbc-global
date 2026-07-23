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
