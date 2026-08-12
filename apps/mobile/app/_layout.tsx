import i18n from '@/i18n';

import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack } from 'expo-router';
import { useEffect } from 'react';

import { ToastProvider } from '@/components/ui';
import { AnalyticsAsk } from '@/features/analytics/AnalyticsAsk';
import { prefetchHome } from '@/features/home/queries';
import { prefetchBranches } from '@/features/onboarding/useBranches';
import { NotificationAsk } from '@/features/notifications/NotificationAsk';
import { MilestoneCelebration } from '@/features/rhythm/MilestoneCelebration';
import { SignedOutToast } from '@/features/shell/SignedOutToast';
import { ForcedUpdateGate } from '@/features/update-gate/ForcedUpdateGate';
import { persistOptions, queryClient } from '@/lib/queryPersist';
import { initSentry } from '@/lib/sentry';
import { startWriteQueue } from '@/lib/writeQueue';
import { useAuthStore } from '@/state/auth';
import { installWriteHandlers } from '@/state/writeQueueHandlers';
import { useBranchStore } from '@/state/branch';
import { ThemeProvider, useTheme } from '@/theme';

// At module scope, not in an effect: an error thrown while the tree first mounts is exactly
// the crash worth having, and by the time an effect runs it has already happened. No-ops
// without a DSN (see lib/sentry).
initSentry();

function ThemedStack() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    />
  );
}

export default function RootLayout() {
  useEffect(() => {
    // Launch warm-up (docs/spec/01 §9): the branch list for onboarding, plus
    // Home's date-anchored reads so the first tab paints from cache. Session
    // resolution runs in parallel; SPLASH waits on it (docs/spec/03).
    void prefetchBranches(queryClient);
    void useAuthStore.getState().syncFromSession();
    const { branch } = useBranchStore.getState();
    void prefetchHome(queryClient, branch?.id ?? null, i18n.language);
    // The offline write queue (docs/spec/01 §8): wire what each queued wish
    // does, then hydrate whatever the member tapped before the app last closed
    // and arm the replay triggers. Handlers first, so the hydrate's own drain
    // has somewhere to send them.
    installWriteHandlers();
    return startWriteQueue();
  }, []);

  return (
    // PersistQueryClientProvider hydrates the on-disk cache before mounting the tree
    // (docs/spec/04 offline state): flagged public reads paint from the last session
    // on a cold, offline launch instead of a retry card. See lib/queryPersist.
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={persistOptions}
    >
      <ThemeProvider>
        <ToastProvider>
          <SignedOutToast />
          {/* Both arrive over whatever screen the member is on, so they are
              mounted here rather than on one: a milestone can be awarded by a
              moderator approving a testimony while the app is closed, and the
              check-in that earns one is a queued write that lands whenever the
              signal comes back. The ask waits for the celebration (W2.8). */}
          <MilestoneCelebration />
          <NotificationAsk />
          {/* The analytics opt-in (W2.10), last of the three overlays and deliberately
              lowest priority: it is due on the first Home after onboarding, which for an
              upgrading install can be the same moment as a milestone and a check-in. */}
          <AnalyticsAsk />
          {/* Below-minimum binaries block before any navigation (docs/spec/21 §8). */}
          <ForcedUpdateGate>
            <ThemedStack />
          </ForcedUpdateGate>
        </ToastProvider>
      </ThemeProvider>
    </PersistQueryClientProvider>
  );
}
