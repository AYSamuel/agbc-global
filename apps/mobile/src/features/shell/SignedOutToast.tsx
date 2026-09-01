import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { useToast } from '@/components/ui';
import { useAuthStore } from '@/state/auth';

// The docs/spec/03 refresh-failure transition: guest in place, plus a
// NON-BLOCKING "you've been signed out" notice. The mockup has no banner
// frame, so this rides the existing Toast primitive (live region included);
// a persistent banner variant would need a mockup frame + approval first.
//
// TWO REASONS, TWO SENTENCES (W4.5). An erased account is not a session that lapsed, and
// "please sign in again" would send somebody to a door that no longer opens. `03` gives it
// its own words, and this is the one place that has to know the difference.
export function SignedOutToast() {
  const { t } = useTranslation('auth');
  const toast = useToast();
  const reason = useAuthStore((s) => s.endedSession);
  const clear = useAuthStore((s) => s.clearEndedSession);

  useEffect(() => {
    if (reason === null) return;
    toast.show(
      reason === 'deleted' ? t('accountGoneBanner') : t('signedOutBanner'),
    );
    clear();
  }, [reason, toast, t, clear]);

  return null;
}
