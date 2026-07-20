import { useTranslation } from 'react-i18next';

import { StubScreen } from '@/features/shell/StubScreen';

// LIBRARY placeholder; the library slice is W4.2 (docs/spec/14). Reached via /auth
// once sign-in exists; kept routable so deep paths never dead-end.
export default function Library() {
  const { t } = useTranslation();
  return <StubScreen title={t('more.rows.library')} />;
}
