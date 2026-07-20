import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { spacing } from '@agbc/shared/theme';

import { AppHeader, Screen, SelectRow } from '@/components/ui';
import {
  LANGUAGE_AUTONYMS,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from '@/i18n';
import { useLanguagePrefStore } from '@/state/language';

// Language picker (docs/spec/16): same rows as ONB-3; choosing relocalizes the UI
// instantly (this screen re-renders in the chosen language as proof).
export default function PickLanguage() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const setPref = useLanguagePrefStore((s) => s.setPref);

  const current = i18n.language as SupportedLanguage;

  return (
    <Screen padded={false} widthClass="capped">
      <AppHeader
        title={t('settings:language')}
        backLabel={t('back')}
        onBack={() => {
          router.back();
        }}
      />
      <View
        accessibilityRole="radiogroup"
        style={{
          gap: spacing.md,
          paddingHorizontal: spacing.gutter,
          marginTop: spacing.md,
        }}
      >
        {SUPPORTED_LANGUAGES.map((lang) => {
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
              selected={current === lang}
              onSelect={() => {
                setPref(lang);
              }}
              accessibilityLabel={LANGUAGE_AUTONYMS[lang]}
            />
          );
        })}
      </View>
    </Screen>
  );
}
