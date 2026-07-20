import '@/i18n';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useEffect } from 'react';

import { ToastProvider } from '@/components/ui';
import { prefetchBranches } from '@/features/onboarding/useBranches';
import { ForcedUpdateGate } from '@/features/update-gate/ForcedUpdateGate';
import { ThemeProvider, useTheme } from '@/theme';

// One data layer for the whole app (frontend standard): stale-while-revalidate by
// default; per-feature options tune from here.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
    },
  },
});

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
    // Warm the branch list during SPLASH/ONB-1 so ONB-2 has it on arrival.
    void prefetchBranches(queryClient);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ToastProvider>
          {/* Below-minimum binaries block before any navigation (docs/spec/21 §8). */}
          <ForcedUpdateGate>
            <ThemedStack />
          </ForcedUpdateGate>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
