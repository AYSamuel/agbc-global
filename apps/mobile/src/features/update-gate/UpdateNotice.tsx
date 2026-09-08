import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, Linking } from 'react-native';

import { icon, palette } from '@agbc/shared/theme';

import { ActionSheet, UpdateIcon } from '@/components/ui';
import { localDateKey } from '@/features/home/queries';
import { useNotificationAskStore } from '@/features/notifications/ask';
import { useCelebratedStore } from '@/features/rhythm/celebrated';
import { useVisitConfirmStore } from '@/features/rhythm/visiting';
import { useAnalyticsConsentStore } from '@/lib/analytics/consent';
import { storeUrl } from '@/lib/links';
import { useLaunchStore } from '@/state/launch';

import { checkForUpdate, startUpdate } from './inAppUpdates';
import { mayCheckToday, shouldTakeOver, useUpdateNoticeStore } from './notice';

/**
 * UPDATE-NOTICE (mockup W4.10 "a new version is ready"; docs/spec/plans/W4.10).
 *
 * The app has only ever had the WALL: `app_config.minimum_supported_version` and a screen
 * that refuses to go further. Nothing told a member that an ordinary new version existed,
 * so the only update they ever heard about was one that had already locked them out.
 *
 * A SHEET rather than a line on Home, because it is one decision with an action, which is
 * what every other app-level ask here is. A banner would also tie it to Home, and an
 * update is not Home's business.
 *
 * WHAT THE BUTTON DOES IS THE PLATFORM'S CHOICE, not ours (see `inAppUpdates.ts`): on
 * Android it hands over to Play's flexible flow, which downloads while the member carries
 * on and restarts the app when it lands; on iOS it opens the App Store. If the platform
 * declines to take over at all, the store listing opens instead, which is the same
 * fallback `UpdateRequiredScreen` has always used. A tap never does nothing.
 *
 * FLEXIBLE, NOT IMMEDIATE, and that is the whole point of this state: an optional update
 * must not take the screen. The one case that does take the screen never reaches this
 * sheet at all: `shouldTakeOver` sends a member far enough behind straight into Play's
 * immediate flow, which is Google's screen rather than ours. The floor above stays what it
 * has always been.
 *
 * LAST IN THE QUEUE OF OVERLAYS. A celebration, the notification ask, the visiting
 * confirm and the analytics ask can each come due in the same instant on an upgrading
 * install, and this is the least urgent of the five: nothing is waiting on it and it will
 * be back tomorrow. Mounted INSIDE `ForcedUpdateGate`, so a binary that is already blocked
 * never gets an optional notice on top of the wall.
 */
export function UpdateNotice() {
  const { t } = useTranslation();
  const available = useUpdateNoticeStore((state) => state.available);
  const answered = useUpdateNoticeStore((state) => state.answered);

  const hasOnboarded = useLaunchStore((state) => state.hasOnboarded);
  const celebrating = useCelebratedStore((state) => state.showing !== null);
  const notificationAskDue = useNotificationAskStore(
    (state) => state.pending !== null,
  );
  const visitConfirmDue = useVisitConfirmStore(
    (state) => state.pending !== null,
  );
  // Stands in for "the analytics ask is due": that sheet's own condition is
  // hydrated + unasked + onboarded, and `hasOnboarded` is already required here,
  // so an unanswered consent is exactly the case to stay behind.
  const analyticsAskDue = useAnalyticsConsentStore(
    (state) => state.hydrated && state.consent === 'unasked',
  );

  useEffect(() => {
    let cancelled = false;

    const run = () => {
      const state = useUpdateNoticeStore.getState();
      // Already found and waiting on an answer: asking Play twice changes nothing.
      if (state.available !== null) return;
      if (!mayCheckToday(state.lastShownDay, localDateKey(new Date()))) return;
      void checkForUpdate().then((result) => {
        if (cancelled || result === null) return;
        if (!result.updateAvailable) return;
        // Android, after an earlier tap: the download is already running and the
        // module will install it on its own. Asking again would be nonsense.
        if (result.updateInProgress === true) return;
        if (shouldTakeOver(result)) {
          // Far enough behind that this is no longer an offer. Play's own screen
          // IS the interface here, which is why there is no frame for it and why
          // the day is deliberately not burnt: the app is about to be replaced,
          // and a member who backs out of Play's dialog meets it again on the
          // next foreground, which is what an immediate update is for. If Play
          // will not take over after all, degrade to the ordinary sheet rather
          // than saying nothing.
          void startUpdate(true).then((started) => {
            if (!started && !cancelled) {
              useUpdateNoticeStore.getState().found(result.storeVersion);
            }
          });
          return;
        }
        useUpdateNoticeStore.getState().found(result.storeVersion);
      });
    };

    // On mount AND on every foreground, because a cold start is not the common
    // case on Android: the app can sit resident for days, and a member who never
    // relaunches would otherwise never be told. The once-a-day guard above is what
    // keeps that cheap.
    run();
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') run();
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  const due =
    available !== null &&
    hasOnboarded &&
    !celebrating &&
    !notificationAskDue &&
    !visitConfirmDue &&
    !analyticsAskDue;

  if (!due) return null;

  const close = () => {
    answered(localDateKey(new Date()));
  };

  return (
    <ActionSheet
      visible
      // The frame draws Lucide's circle-arrow-up in `.gatesheet .gi`, navy on
      // gold; the icon set carries it as UpdateIcon, which the wall already uses.
      icon={<UpdateIcon size={icon.x2l} color={palette.navy} strokeWidth={2} />}
      title={t('updateNotice.title')}
      body={t('updateNotice.body')}
      primaryLabel={t('updateNotice.cta')}
      onPrimary={() => {
        // Closed BEFORE the platform takes over, and the day is burnt whatever
        // happens next: Play's own dialog can still be cancelled, and asking
        // again an hour later would be nagging somebody already asked.
        close();
        void startUpdate(false).then((started) => {
          if (!started) void Linking.openURL(storeUrl());
        });
      }}
      secondaryLabel={t('notNow')}
      dismissAnnouncement={t('updateNotice.dismissed')}
      onDismiss={close}
      footnote={t('updateNotice.footnote')}
    />
  );
}
