import { useTranslation } from 'react-i18next';

import { StubScreen } from '@/features/shell/StubScreen';

// AUTH placeholder: sign-in arrives at W2.1 (docs/spec/03). Every auth-needing
// action routes here until GateSheet + the real AUTH-1..4 flow exist (W2.2).
export default function AuthStub() {
  const { t } = useTranslation();
  return <StubScreen title={t('authStub.title')} body={t('authStub.body')} />;
}
