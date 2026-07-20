import { useTranslation } from 'react-i18next';

import { FamilyTabIcon } from '@/components/ui';
import { StubIcon } from '@/features/shell/StubIcon';
import { TabStub } from '@/features/shell/TabStub';

// FAMILY tab root placeholder; the wedge slice is W1.5 (docs/spec/09).
export default function Family() {
  const { t } = useTranslation();
  return (
    <TabStub
      title={t('tabs.family')}
      body={t('tabStubs.family')}
      icon={<StubIcon Icon={FamilyTabIcon} />}
    />
  );
}
