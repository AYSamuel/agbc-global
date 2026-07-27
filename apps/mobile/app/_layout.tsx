import i18n from '@/i18n';

import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Stack } from 'expo-router';
import { useEffect } from 'react';

import { ToastProvider } from '@/components/ui';
import { prefetchHome } from '@/features/home/queries';
import { prefetchBranches } from '@/features/onboarding/useBranches';
import { SignedOutToast } from '@/features/shell/SignedOutToast';
import { ForcedUpdateGate } from '@/features/update-gate/ForcedUpdateGate';
import { persistOptions, queryClient } from '@/lib/queryPersist';
import { startWriteQueue } from '@/lib/writeQueue';
import { useAuthStore } from '@/state/auth';
import { installWriteHandlers } from '@/state/writeQueueHandlers';
import { useBranchStore } from '@/state/branch';
import { ThemeProvider, useTheme } from '@/theme';

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
          {/* Below-minimum binaries block before any navigation (docs/spec/21 §8). */}
          <ForcedUpdateGate>
            <ThemedStack />
          </ForcedUpdateGate>
        </ToastProvider>
      </ThemeProvider>
    </PersistQueryClientProvider>
  );
}
