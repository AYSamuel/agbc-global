import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  ImageBackground,
  Pressable,
  Text,
  View,
  type ImageSourcePropType,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';

import {
  fontFamily,
  hitTarget,
  onInk,
  palette,
  spacing,
  typeScale,
} from '@agbc/shared/theme';

import { Button, GradientFill } from '@/components/ui';
import { HQ_BRANCH } from '@/features/onboarding/branches-snapshot';
import { PRIVACY_URL, TERMS_URL } from '@/lib/links';
import { useBranchStore } from '@/state/branch';
import { useLaunchStore } from '@/state/launch';

// Metro's require() of an asset is untyped; the assertion is the RN-standard shape.
const HERO_IMAGE =
  require('../../assets/images/onboarding-hero.jpg') as ImageSourcePropType;

// ONB-1 (docs/spec/06): photo hero, value statement, and the guest-first escape
// hatch: "I'm just looking" lands on Home as an HQ guest in one tap.
export default function Welcome() {
  const router = useRouter();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const setBranch = useBranchStore((s) => s.setBranch);
  const completeOnboarding = useLaunchStore((s) => s.completeOnboarding);

  const justLooking = () => {
    setBranch({
      id: HQ_BRANCH.id,
      slug: HQ_BRANCH.slug,
      name: HQ_BRANCH.name,
      timezone: HQ_BRANCH.timezone,
    });
    completeOnboarding();
    router.replace('/home');
  };

  return (
    <ImageBackground source={HERO_IMAGE} style={{ flex: 1 }} resizeMode="cover">
      {/* Mockup scrim: ink gradient, light at the top, heavy behind the copy. */}
      <GradientFill
        direction="vertical"
        from={onInk.scrimTop}
        to={onInk.scrimBottom}
      />
      <View
        style={{
          flex: 1,
          justifyContent: 'flex-end',
          paddingHorizontal: spacing.x2l,
          paddingBottom: insets.bottom + spacing.x2l,
        }}
      >
        <Text
          style={[
            typeScale.label,
            {
              fontSize: 11,
              letterSpacing: 2.6,
              color: palette.gold,
              marginBottom: spacing.md,
            },
          ]}
        >
          {t('onboarding.welcomeEyebrow')}
        </Text>
        <Text
          style={[
            typeScale.hero,
            { fontSize: 30, color: onInk.text, marginBottom: spacing.xl },
          ]}
        >
          {t('onboarding.welcomeTitle')}
        </Text>
        <View style={{ gap: spacing.md }}>
          <Button
            label={t('onboarding.getStarted')}
            variant="primary"
            fullWidth
            onPress={() => {
              // Language first (decision 2026-07-20): the rest of onboarding
              // then reads in the user's own language.
              router.push('/onboarding/language');
            }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('onboarding.justLooking')}
            onPress={justLooking}
            style={({ pressed }) => ({
              minHeight: hitTarget.preferred,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text
              style={{
                fontFamily: fontFamily.body.bold,
                fontSize: 13.5,
                color: 'rgba(255,255,255,0.85)',
              }}
            >
              {t('onboarding.justLooking')}
            </Text>
          </Pressable>
        </View>
        <Text
          style={[
            typeScale.body,
            {
              fontSize: 11.5,
              lineHeight: 17,
              color: 'rgba(255,255,255,0.7)',
              textAlign: 'center',
              marginTop: spacing.lg,
            },
          ]}
        >
          {t('onboarding.legalPrefix')}{' '}
          <Text
            accessibilityRole="link"
            style={{ color: onInk.link }}
            onPress={() => {
              void WebBrowser.openBrowserAsync(TERMS_URL);
            }}
          >
            {t('onboarding.terms')}
          </Text>{' '}
          {t('onboarding.legalAnd')}{' '}
          <Text
            accessibilityRole="link"
            style={{ color: onInk.link }}
            onPress={() => {
              void WebBrowser.openBrowserAsync(PRIVACY_URL);
            }}
          >
            {t('onboarding.privacy')}
          </Text>
        </Text>
      </View>
    </ImageBackground>
  );
}
