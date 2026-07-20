import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import {
  fontFamily,
  onInk,
  palette,
  radius,
  spacing,
  typeScale,
} from '@agbc/shared/theme';

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
        gap: spacing.lg,
        paddingHorizontal: spacing.x4l,
      }}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: 76,
          height: 76,
          borderRadius: radius.cardHero,
          backgroundColor: palette.gold,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text
          style={{
            fontFamily: fontFamily.display.extraBold,
            fontSize: 40,
            color: palette.navy,
          }}
        >
          {t('brand.line1').charAt(0)}
        </Text>
      </View>
      <Text style={[typeScale.hero, { fontSize: 30, color: onInk.text }]}>
        {t('brand.line1')}
      </Text>
      <Text
        style={[
          typeScale.label,
          { fontSize: 11, letterSpacing: 2.6, color: palette.gold },
        ]}
      >
        {t('brand.line2')}
      </Text>
      <Text
        style={[
          typeScale.body,
          {
            fontSize: 14,
            lineHeight: 21,
            color: onInk.sub,
            textAlign: 'center',
            maxWidth: 240,
          },
        ]}
      >
        {t('tagline')}
      </Text>
    </View>
  );
}
