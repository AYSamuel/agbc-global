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

import { hitTarget, spacing, typeScale } from '@agbc/shared/theme';

import { Button } from '@/components/ui';
import { HQ_BRANCH } from '@/features/onboarding/branches-snapshot';
import { useBranchStore } from '@/state/branch';
import { useLaunchStore } from '@/state/launch';

// TODO(W4.6 legal pass): confirm the exact terms/privacy paths on the website.
const TERMS_URL = 'https://agbcglobal.com/terms';
const PRIVACY_URL = 'https://agbcglobal.com/privacy';

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
    setBranch({ id: HQ_BRANCH.id, slug: HQ_BRANCH.slug, name: HQ_BRANCH.name });
    completeOnboarding();
    router.replace('/home');
  };

  return (
    <ImageBackground source={HERO_IMAGE} style={{ flex: 1 }} resizeMode="cover">
      {/* Legibility scrim; the mockup's photo hero carries light text. */}
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(10,15,24,0.55)',
          justifyContent: 'flex-end',
          padding: spacing.gutter,
          paddingBottom: insets.bottom + spacing.x2l,
          gap: spacing.md,
        }}
      >
        <Text style={[typeScale.label, { color: '#ffcf4a' }]}>
          {t('onboarding.welcomeEyebrow')}
        </Text>
        <Text style={[typeScale.hero, { color: '#ffffff' }]}>
          {t('onboarding.welcomeTitle')}
        </Text>
        <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
          <Button
            label={t('onboarding.getStarted')}
            variant="primary"
            fullWidth
            onPress={() => {
              router.push('/onboarding/branch');
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
              style={[
                typeScale.bodySemiBold,
                { color: 'rgba(255,255,255,0.85)' },
              ]}
            >
              {t('onboarding.justLooking')}
            </Text>
          </Pressable>
        </View>
        <Text
          style={[
            typeScale.body,
            {
              color: 'rgba(255,255,255,0.6)',
              fontSize: 12,
              textAlign: 'center',
            },
          ]}
        >
          {t('onboarding.legalPrefix')}{' '}
          <Text
            accessibilityRole="link"
            style={{ textDecorationLine: 'underline' }}
            onPress={() => {
              void WebBrowser.openBrowserAsync(TERMS_URL);
            }}
          >
            {t('onboarding.terms')}
          </Text>{' '}
          {t('onboarding.legalAnd')}{' '}
          <Text
            accessibilityRole="link"
            style={{ textDecorationLine: 'underline' }}
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
