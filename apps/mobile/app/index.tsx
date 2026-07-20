import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { radius, spacing, typeScale } from '@agbc/shared/theme';

import { resolveEntryRoute, useLaunchStore } from '@/state/launch';
import { useTheme } from '@/theme';

const SPLASH_MS = 1200;

// SPLASH (docs/spec/06): brand moment, auto-advances after ~1.2s. First launch goes
// to onboarding; returning users go straight to Home with restored choices. Routing
// waits for both the timer AND store hydration.
export default function Splash() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const hydrated = useLaunchStore((s) => s.hydrated);
  const hasOnboarded = useLaunchStore((s) => s.hasOnboarded);

  useEffect(() => {
    if (!hydrated) return;
    const timer = setTimeout(() => {
      router.replace(resolveEntryRoute(hasOnboarded));
    }, SPLASH_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [hydrated, hasOnboarded, router]);

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.band,
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
        padding: spacing.gutter,
      }}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: 64,
          height: 64,
          borderRadius: radius.card,
          backgroundColor: colors.accent,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: spacing.md,
        }}
      >
        <Text style={[typeScale.hero, { color: '#14213d' }]}>
          {t('brand.line1').charAt(0)}
        </Text>
      </View>
      <Text style={[typeScale.hero, { color: colors.bandtext }]}>
        {t('brand.line1')}
      </Text>
      <Text style={[typeScale.label, { color: colors.accent }]}>
        {t('brand.line2')}
      </Text>
      <Text
        style={[
          typeScale.body,
          { color: colors.bandtext, opacity: 0.75, marginTop: spacing.md },
        ]}
      >
        {t('tagline')}
      </Text>
    </View>
  );
}
