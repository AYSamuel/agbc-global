import { Stack } from 'expo-router';

import { ToastProvider } from '@/components/ui';
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
  return (
    <ThemeProvider>
      <ToastProvider>
        <ThemedStack />
      </ToastProvider>
    </ThemeProvider>
  );
}
