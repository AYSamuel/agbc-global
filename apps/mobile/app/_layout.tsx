import i18n from '@/i18n';

import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { ToastProvider } from '@/components/ui';
import { NowPlayingBar } from '@/features/watch/NowPlayingBar';
import { NowPlayingProvider } from '@/features/watch/nowPlaying';
import { useLayout } from '@/lib/layout';
import { TabletShell } from '@/features/shell/TabletShell';
import { AnalyticsAsk } from '@/features/analytics/AnalyticsAsk';
import { prefetchHome } from '@/features/home/queries';
import { prefetchBranches } from '@/features/onboarding/useBranches';
import { NotificationAsk } from '@/features/notifications/NotificationAsk';
import { useNotifications } from '@/features/notifications/useNotifications';
import { MilestoneCelebration } from '@/features/rhythm/MilestoneCelebration';
import { VisitConfirm } from '@/features/rhythm/VisitConfirm';
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

/**
 * Push runtime (W3.3 slice 4): the six Android channels, this device's token, and routing
 * for a tapped notification. Mounted INSIDE the providers because it needs the router and
 * i18n, and rendered as nothing: it is behaviour, not UI.
 */
function PushRuntime() {
  useNotifications();
  return null;
}

function ThemedStack() {
  const { colors } = useTheme();
  const { isTablet } = useLayout();
  const segments = useSegments() as string[];
  // A phone's STACK screens have no tab bar to dock the now-playing bar above,
  // so it docks at the bottom edge here, under the whole stack (frame
  // `NOW-PLAYING-BAR · over a screen without tabs`). Tab screens draw it in the
  // tab bar host and a tablet in the shell, so this host stands aside for both.
  const hostsBar = !isTablet && segments[0] !== '(tabs)';
  return (
    // The rail is a SIBLING of the whole stack on a tablet, so it survives a
    // pushed route the way every tablet frame draws it (W4.7 slice 4). On a
    // phone TabletShell renders its children and nothing else.
    <TabletShell>
      <View style={{ flex: 1 }}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
          }}
        />
        {hostsBar ? <NowPlayingBar where="bottom-edge" /> : null}
      </View>
    </TabletShell>
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
    // GestureHandlerRootView is what lets a gesture claim a touch natively, ahead
    // of a scroll view (W4.9 slice 2: the player's seek bar). It has to sit at
    // the root, above every screen, or the gestures inside are inert on Android.
    // PersistQueryClientProvider hydrates the on-disk cache before mounting the tree
    // (docs/spec/04 offline state): flagged public reads paint from the last session
    // on a cold, offline launch instead of a retry card. See lib/queryPersist.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={persistOptions}
      >
        <ThemeProvider>
          <ToastProvider>
            <SignedOutToast />
            <PushRuntime />
            {/* Both arrive over whatever screen the member is on, so they are
              mounted here rather than on one: a milestone can be awarded by a
              moderator approving a testimony while the app is closed, and the
              check-in that earns one is a queued write that lands whenever the
              signal comes back. The ask waits for the celebration (W2.8). */}
            <MilestoneCelebration />
            <NotificationAsk />
            {/* And the question that comes BEFORE a check-in rather than after
              one: "are you actually at the branch you are browsing?". Here for
              the same reason as the two above, plus one of its own: the
              gate-return replay raises it after AUTH-4 has already moved the
              member, so no single screen can be relied on to be looking. */}
            <VisitConfirm />
            {/* The analytics opt-in (W2.10), last of the three overlays and deliberately
              lowest priority: it is due on the first Home after onboarding, which for an
              upgrading install can be the same moment as a milestone and a check-in. */}
            <AnalyticsAsk />
            {/* Below-minimum binaries block before any navigation (docs/spec/21 §8). */}
            <ForcedUpdateGate>
              {/* One player for the app's life, above every screen (W4.9 slice 3):
                  inside the gate, because a blocked binary has no business
                  playing anything, and inside the providers it needs (auth for
                  sign-out, the query client for the re-mint). */}
              <NowPlayingProvider>
                <ThemedStack />
              </NowPlayingProvider>
            </ForcedUpdateGate>
          </ToastProvider>
        </ThemeProvider>
      </PersistQueryClientProvider>
    </GestureHandlerRootView>
  );
}
