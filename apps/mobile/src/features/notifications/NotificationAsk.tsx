import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { palette } from '@agbc/shared/theme';

import { ActionSheet, BellIcon } from '@/components/ui';
import { useCelebratedStore } from '@/features/rhythm/celebrated';
import { useAuthStore } from '@/state/auth';

import { useNotificationAskStore } from './ask';
import { permissionState, requestPermission } from './permission';

/**
 * NOTIF-ASK (mockup W2.8 "pre-permission sheet, after the first 'I'm here'";
 * docs/spec/06 §"Notification permission: in context, not in onboarding").
 *
 * A short sheet that explains the value BEFORE the OS dialog, because iOS shows
 * that dialog once per install and a refusal is permanent. It never appears in
 * onboarding, and it never appears cold: a check-in has just been recorded.
 *
 * Mounted at the root next to the celebration, and DELIBERATELY BEHIND IT. The
 * first "I'm here" is both a first service and a first value moment, so both
 * overlays come due at the same instant; the frames' flow puts the celebration
 * first ("checked in -> celebration -> reminder sheet"), and two modals at once
 * would be a pile-up.
 *
 * What this does NOT do is register a token or create a channel. Those are
 * W3.3's, with the six Android channels that have to exist before anything is
 * delivered; what W2.8 owns is the moment, and the moment is a check-in.
 */
export function NotificationAsk() {
  const { t } = useTranslation();
  const isMember = useAuthStore((state) => state.status === 'member');
  const pending = useNotificationAskStore((state) => state.pending);
  const markAsked = useNotificationAskStore((state) => state.markAsked);
  const clearPending = useNotificationAskStore((state) => state.clearPending);
  // A celebration is on screen: wait for it.
  const celebrating = useCelebratedStore((state) => state.showing !== null);

  // Whether the OS would even show a dialog. Asked once, when the sheet becomes
  // due: a member who granted or permanently refused elsewhere is not worth
  // interrupting, and `undetermined` is the only state this sheet can help with.
  const [askable, setAskable] = useState<boolean | null>(null);
  const due = isMember && pending && !celebrating;

  useEffect(() => {
    if (!due || askable !== null) return;
    let mounted = true;
    void permissionState().then((state) => {
      if (!mounted) return;
      if (state === 'undetermined') {
        setAskable(true);
        return;
      }
      setAskable(false);
      // `unavailable` is NOT an answer. It means this build cannot ask at all
      // (a dev client older than the one that first linked expo-notifications),
      // and spending the one ask on it would leave the member permanently
      // unasked the moment the module arrives. Only an OS that has actually
      // answered, by granting or by refusing for good, closes the question.
      if (state !== 'unavailable') markAsked();
      else clearPending();
    });
    return () => {
      mounted = false;
    };
  }, [due, askable, markAsked, clearPending]);

  if (!due || askable !== true) return null;

  return (
    <ActionSheet
      visible
      // The frame draws a bell emoji; `.gatesheet .gi` specifies a NAVY
      // foreground on its gold tile, which an emoji cannot honour, and the app
      // already has this bell in its icon set (Home's header).
      icon={<BellIcon size={26} color={palette.navy} strokeWidth={2} />}
      title={t('rhythm:notifyTitle')}
      body={t('rhythm:notifyBody')}
      primaryLabel={t('rhythm:notifyYes')}
      onPrimary={() => {
        // The sheet has explained; the OS dialog may now fire. Marked asked
        // BEFORE awaiting it, because the answer does not change whether this
        // app has had its one ask (`06`: declining degrades gracefully, and
        // Settings is where it can be turned on later).
        markAsked();
        void requestPermission();
      }}
      secondaryLabel={t('common:notNow')}
      dismissAnnouncement={t('rhythm:notifyDismissed')}
      onDismiss={() => {
        markAsked();
        clearPending();
      }}
      footnote={t('rhythm:notifyFootnote')}
    />
  );
}
