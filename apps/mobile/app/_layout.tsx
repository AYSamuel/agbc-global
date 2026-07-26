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
import { useAuthStore } from '@/state/auth';
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
