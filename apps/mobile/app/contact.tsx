import { useTranslation } from 'react-i18next';

import { StubScreen } from '@/features/shell/StubScreen';

// CONTACT placeholder; the contact form is W1.7 (docs/spec/04).
export default function Contact() {
  const { t } = useTranslation();
  return <StubScreen title={t('more.rows.contact')} />;
}
