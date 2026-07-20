import { useTranslation } from 'react-i18next';

import { WatchTabIcon } from '@/components/ui';
import { StubIcon } from '@/features/shell/StubIcon';
import { TabStub } from '@/features/shell/TabStub';

// WATCH tab root placeholder; the real Watch slice is W1.3 (docs/spec/08).
export default function Watch() {
  const { t } = useTranslation();
  return (
    <TabStub
      title={t('tabs.watch')}
      body={t('tabStubs.watch')}
      icon={<StubIcon Icon={WatchTabIcon} />}
    />
  );
}
