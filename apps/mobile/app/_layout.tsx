import '@/i18n';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';

import { ToastProvider } from '@/components/ui';
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
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ToastProvider>
          <ThemedStack />
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
