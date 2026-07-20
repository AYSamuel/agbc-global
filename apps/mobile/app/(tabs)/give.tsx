import { useTranslation } from 'react-i18next';

import { GiveTabIcon } from '@/components/ui';
import { StubIcon } from '@/features/shell/StubIcon';
import { TabStub } from '@/features/shell/TabStub';

// GIVE tab root placeholder; the Give slice is W1.6 (docs/spec/12).
export default function Give() {
  const { t } = useTranslation();
  return (
    <TabStub
      title={t('tabs.give')}
      body={t('tabStubs.give')}
      icon={<StubIcon Icon={GiveTabIcon} />}
    />
  );
}
