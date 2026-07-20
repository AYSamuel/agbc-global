import { useTranslation } from 'react-i18next';

import { StubScreen } from '@/features/shell/StubScreen';

// PLAN placeholder; the devotional plan slice is W4.4 (docs/spec/10).
export default function Plan() {
  const { t } = useTranslation();
  return <StubScreen title={t('more.rows.devotional')} />;
}
