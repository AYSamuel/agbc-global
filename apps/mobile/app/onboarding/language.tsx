import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { spacing, typeScale } from '@agbc/shared/theme';

import { Button, Screen, SelectRow } from '@/components/ui';
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
  const { colors } = useTheme();
  const setLangPref = useLanguagePrefStore((s) => s.setPref);
  const completeOnboarding = useLaunchStore((s) => s.completeOnboarding);
  const [selected, setSelected] = useState(deviceLanguage());

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
        <Text style={[typeScale.section, { fontSize: 26, color: colors.text }]}>
          {t('onboarding.languageTitle')}
        </Text>
        <Text style={[typeScale.body, { fontSize: 13.5, color: colors.sub }]}>
          {t('onboarding.languageSubtitle')}
        </Text>
      </View>

      <View
        accessibilityRole="radiogroup"
        style={{ gap: spacing.md, marginTop: spacing.x2l }}
      >
        {SUPPORTED_LANGUAGES.map((lang) => {
          // Mockup: the sub line is the language's name in the CURRENT UI
          // language, omitted when it matches the autonym (the EN row in English).
          const localizedName = t(`languages.${lang}`);
          return (
            <SelectRow
              key={lang}
              tileLabel={lang.toUpperCase()}
              title={LANGUAGE_AUTONYMS[lang]}
              subtitle={
                localizedName === LANGUAGE_AUTONYMS[lang]
                  ? undefined
                  : localizedName
              }
              selected={selected === lang}
              onSelect={() => {
                choose(lang);
              }}
              accessibilityLabel={LANGUAGE_AUTONYMS[lang]}
            />
          );
        })}
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
