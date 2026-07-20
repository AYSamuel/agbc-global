import { useTranslation } from 'react-i18next';

import { StubScreen } from '@/features/shell/StubScreen';

// ACADEMY placeholder; the Academy slice is W2.9 (docs/spec/13).
export default function Academy() {
  const { t } = useTranslation();
  return <StubScreen title={t('more.rows.academy')} />;
}
