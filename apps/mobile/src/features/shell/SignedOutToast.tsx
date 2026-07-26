import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { useToast } from '@/components/ui';
import { useAuthStore } from '@/state/auth';

// The docs/spec/03 refresh-failure transition: guest in place, plus a
// NON-BLOCKING "you've been signed out" notice. The mockup has no banner
// frame, so this rides the existing Toast primitive (live region included);
// a persistent banner variant would need a mockup frame + approval first.
export function SignedOutToast() {
  const { t } = useTranslation('auth');
  const toast = useToast();
  const bannerVisible = useAuthStore((s) => s.signedOutBanner);
  const clear = useAuthStore((s) => s.clearSignedOutBanner);

  useEffect(() => {
    if (!bannerVisible) return;
    toast.show(t('signedOutBanner'));
    clear();
  }, [bannerVisible, toast, t, clear]);

  return null;
}
