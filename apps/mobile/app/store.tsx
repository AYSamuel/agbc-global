import { useTranslation } from 'react-i18next';

import { StubScreen } from '@/features/shell/StubScreen';

// STORE placeholder; the bookstore slice is W4.2 (docs/spec/14).
export default function Store() {
  const { t } = useTranslation();
  return <StubScreen title={t('more.rows.bookstore')} />;
}
