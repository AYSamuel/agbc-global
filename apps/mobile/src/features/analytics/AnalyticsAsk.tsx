import { useTranslation } from 'react-i18next';

import { icon, palette } from '@agbc/shared/theme';

import { ActionSheet, InsightsIcon } from '@/components/ui';
import { useNotificationAskStore } from '@/features/notifications/ask';
import { useCelebratedStore } from '@/features/rhythm/celebrated';
import { shutdownAnalytics, useAnalyticsConsentStore } from '@/lib/analytics';
import { useLaunchStore } from '@/state/launch';

/**
 * ANALYTICS-ASK (mockup W2.10 "first-run sheet, once, over guest Home"; docs/spec/20
 * §Consent mechanics, ADR 0020).
 *
 * Product analytics is opt-in, so this is the ask. Three things about when it appears:
 *
 * - **After onboarding, not inside it.** `hasOnboarded` is the gate, which in practice
 *   means the first arrival at Home, because Home is where onboarding lands (`06`). A data
 *   question in front of somebody who has not seen the app yet is a question they cannot
 *   answer, and it would edit two approved onboarding frames to ask it.
 * - **Signed out is the normal case.** First run has no account, and `gate_shown` is a
 *   guest event by definition, so nothing here waits for a member.
 * - **Once.** Yes, no, or dismissed all record an answer, so it never returns. Settings is
 *   the way back, which the sheet's own footnote says.
 *
 * Behind the celebration and the notification ask, for the same reason NotificationAsk sits
 * behind the celebration: an upgrading install can have all three come due in one moment,
 * and this is the least urgent of them. A pile-up of modals is its own bug.
 */
export function AnalyticsAsk() {
  const { t } = useTranslation();
  const consent = useAnalyticsConsentStore((state) => state.consent);
  const hydrated = useAnalyticsConsentStore((state) => state.hydrated);
  const grant = useAnalyticsConsentStore((state) => state.grant);
  const deny = useAnalyticsConsentStore((state) => state.deny);
  const hasOnboarded = useLaunchStore((state) => state.hasOnboarded);
  const celebrating = useCelebratedStore((state) => state.showing !== null);
  const notificationAskDue = useNotificationAskStore(
    (state) => state.pending !== null,
  );

  const due =
    hydrated &&
    consent === 'unasked' &&
    hasOnboarded &&
    !celebrating &&
    !notificationAskDue;

  if (!due) return null;

  return (
    <ActionSheet
      visible
      // The frame draws Lucide's chart glyph in `.gatesheet .gi`, whose foreground is navy
      // on gold; the icon set carries it as InsightsIcon.
      icon={
        <InsightsIcon size={icon.x2l} color={palette.navy} strokeWidth={2} />
      }
      title={t('settings:analytics.askTitle')}
      body={t('settings:analytics.askBody')}
      primaryLabel={t('settings:analytics.askYes')}
      onPrimary={grant}
      secondaryLabel={t('settings:analytics.askNo')}
      // An ACTION, not merely the way out: "No thanks" is a recorded answer, which is what
      // stops the sheet coming back. The scrim and the back button stay a way out and
      // record the same answer, because no answer means no consent either way and asking
      // again next launch would be nagging somebody who has already said not now.
      onSecondary={() => {
        deny();
        void shutdownAnalytics();
      }}
      dismissAnnouncement={t('settings:analytics.askDismissed')}
      onDismiss={() => {
        deny();
        void shutdownAnalytics();
      }}
      footnote={t('settings:analytics.askFootnote')}
    />
  );
}
