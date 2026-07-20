import { useTranslation } from 'react-i18next';

import { StubScreen } from '@/features/shell/StubScreen';

// BRANCHES placeholder; the church-screens slice is W1.7 (docs/spec/04).
export default function Branches() {
  const { t } = useTranslation();
  return <StubScreen title={t('more.rows.branches')} />;
}
