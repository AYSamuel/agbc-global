import { useTranslation } from 'react-i18next';

import { StubScreen } from '@/features/shell/StubScreen';

// EVENTS placeholder; the events slice is W1.7 (docs/spec/11).
export default function Events() {
  const { t } = useTranslation();
  return <StubScreen title={t('more.rows.events')} />;
}
