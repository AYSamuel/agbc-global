import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { hitTarget, radius, spacing, typeScale } from '@agbc/shared/theme';

import { Button, Screen } from '@/components/ui';
import {
  deviceLanguage,
  LANGUAGE_AUTONYMS,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from '@/i18n';
import { useLanguagePrefStore } from '@/state/language';
import { useLaunchStore } from '@/state/launch';
import { useTheme } from '@/theme';

// ONB-3 (docs/spec/06): language choice, preselected from the device locale when it
// matches; applying relocalizes the UI immediately (the store drives i18next live).
export default function PickLanguage() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors, name } = useTheme();
  const setLangPref = useLanguagePrefStore((s) => s.setPref);
  const completeOnboarding = useLaunchStore((s) => s.completeOnboarding);
  const [selected, setSelected] = useState(deviceLanguage());
  const activeBorder = name === 'light' ? colors.blue : colors.accent;

  const choose = (lang: SupportedLanguage) => {
    setSelected(lang);
    // Immediate relocalization per docs/spec/06: the screen re-renders in the
    // chosen language the moment it is tapped.
    setLangPref(lang);
  };

  return (
    <Screen widthClass="capped">
      <View style={{ gap: spacing.sm, marginTop: spacing.x3l }}>
        <Text style={[typeScale.label, { color: colors.muted }]}>
          {t('onboarding.step', { current: 2, total: 2 })}
        </Text>
        <Text style={[typeScale.hero, { color: colors.text }]}>
          {t('onboarding.languageTitle')}
        </Text>
        <Text style={[typeScale.body, { color: colors.muted }]}>
          {t('onboarding.languageSubtitle')}
        </Text>
      </View>

      <View
        accessibilityRole="radiogroup"
        style={{ gap: spacing.md, marginTop: spacing.x2l }}
      >
        {SUPPORTED_LANGUAGES.map((lang) => (
          <Pressable
            key={lang}
            accessibilityRole="radio"
            accessibilityLabel={LANGUAGE_AUTONYMS[lang]}
            accessibilityState={{ selected: selected === lang }}
            onPress={() => {
              choose(lang);
            }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.md,
              minHeight: hitTarget.preferred,
              padding: spacing.lg,
              borderRadius: radius.cardTight,
              backgroundColor: colors.card,
              borderWidth: selected === lang ? 2 : 1,
              borderColor: selected === lang ? activeBorder : colors.cardline,
              opacity: pressed ? 0.9 : 1,
            })}
          >
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{
                width: 40,
                height: 40,
                borderRadius: radius.control,
                backgroundColor: colors.util,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={[typeScale.label, { color: colors.text }]}>
                {lang.toUpperCase()}
              </Text>
            </View>
            <Text style={[typeScale.bodySemiBold, { color: colors.text }]}>
              {LANGUAGE_AUTONYMS[lang]}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={{ marginTop: spacing.x2l }}>
        <Button
          label={t('onboarding.continue')}
          variant="primary"
          fullWidth
          onPress={() => {
            completeOnboarding();
            router.replace('/home');
          }}
        />
      </View>
    </Screen>
  );
}
