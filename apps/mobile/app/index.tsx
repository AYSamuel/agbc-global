import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
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

import { usePendingDeepLinkStore } from '@/features/notifications/pendingDeepLink';
import { resolveAuthEntryRoute, useAuthStore } from '@/state/auth';
import { useLaunchStore } from '@/state/launch';
import { useTheme } from '@/theme';

const SPLASH_MS = 1200;

// SPLASH (docs/spec/06): brand moment, auto-advances after ~1.2s. First launch goes
// to onboarding; returning users go straight to Home with restored choices; a
// half-created profile (killed mid-AUTH-3) resumes AUTH-3 (docs/spec/03). Routing
// waits for the timer, store hydration, AND session resolution.
export default function Splash() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const hydrated = useLaunchStore((s) => s.hydrated);
  const hasOnboarded = useLaunchStore((s) => s.hasOnboarded);
  const setHydrated = useLaunchStore((s) => s.setHydrated);
  const authStatus = useAuthStore((s) => s.status);
  const [authTimedOut, setAuthTimedOut] = useState(false);

  // Failsafe: if store hydration or session resolution never lands (an
  // AsyncStorage read error, a hung profile read), don't strand the user on the
  // splash forever. Force the gates open after a bounded wait; the defaults
  // route to onboarding / guest, the safe first-run paths.
  useEffect(() => {
    const failsafe = setTimeout(() => {
      setHydrated();
      setAuthTimedOut(true);
    }, SPLASH_MS + 2500);
    return () => {
      clearTimeout(failsafe);
    };
  }, [setHydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const effectiveStatus =
      authStatus === 'loading' ? (authTimedOut ? 'guest' : null) : authStatus;
    if (effectiveStatus === null) return;
    const timer = setTimeout(() => {
      router.replace(resolveAuthEntryRoute(hasOnboarded, effectiveStatus));
      // A notification tap that LAUNCHED the app has been waiting for this moment: it
      // could not navigate during the first mount, because this replace would have
      // landed on top of it (found on device 2026-08-16, W3.3 slice 4). Pushed after
      // the entry route so back still returns somewhere sensible, and only for a
      // member, since every deep-linked destination that matters is member-only and a
      // guest belongs in the gate rather than on a stranger's screen.
      const store = usePendingDeepLinkStore.getState();
      store.markEntryDone();
      const pending = store.take();
      if (pending !== null && effectiveStatus === 'member') {
        router.push(pending as Parameters<typeof router.push>[0]);
      }
    }, SPLASH_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [hydrated, hasOnboarded, authStatus, authTimedOut, router]);

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
