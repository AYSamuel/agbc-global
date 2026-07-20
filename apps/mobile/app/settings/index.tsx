import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import { fontFamily, spacing } from '@agbc/shared/theme';

import {
  AppHeader,
  Button,
  MenuCard,
  MenuLabel,
  MenuRow,
  Screen,
  SegmentedControl,
} from '@/components/ui';
import { LANGUAGE_AUTONYMS, type SupportedLanguage } from '@/i18n';
import { PRIVACY_URL, TERMS_URL } from '@/lib/links';
import { useTheme } from '@/theme';
import { useThemePrefStore, type ThemePref } from '@/theme/store';

const THEME_SEGMENTS: readonly { key: ThemePref; labelKey: string }[] = [
  { key: 'system', labelKey: 'settings:themeSystem' },
  { key: 'light', labelKey: 'settings:themeLight' },
  { key: 'dark', labelKey: 'settings:themeDark' },
];

// SETTINGS hub, guest level (docs/spec/16; W1.2 scope): appearance + language work
// locally; member rows (profile, notification prefs, blocked members, delete)
// arrive with their phases. Composed from the mockup SETTINGS frame's classes.
export default function Settings() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const themePref = useThemePrefStore((s) => s.pref);
  const setThemePref = useThemePrefStore((s) => s.setPref);

  const currentLanguage = LANGUAGE_AUTONYMS[i18n.language as SupportedLanguage];
  const appVersion = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <Screen padded={false} widthClass="capped">
      <AppHeader
        title={t('settings:title')}
        backLabel={t('back')}
        onBack={() => {
          router.back();
        }}
      />
      <View style={{ paddingHorizontal: spacing.lg }}>
        <MenuLabel label={t('settings:appearance')} />
        <MenuCard>
          {/* Mockup .setseg: a plain row label above the segmented control. */}
          <View style={{ paddingVertical: 13, paddingHorizontal: 15 }}>
            <Text
              style={{
                fontFamily: fontFamily.body.semiBold,
                fontSize: 14.5,
                color: colors.text,
                marginBottom: spacing.sm + 2,
              }}
            >
              {t('settings:theme')}
            </Text>
            <SegmentedControl
              segments={THEME_SEGMENTS.map(({ key, labelKey }) => ({
                key,
                label: t(labelKey),
              }))}
              value={themePref}
              onChange={setThemePref}
              accessibilityLabel={t('settings:theme')}
            />
          </View>
        </MenuCard>

        <View style={{ height: spacing.sm + 2 }} />
        <MenuCard>
          <MenuRow
            icon="🌐"
            label={t('settings:language')}
            value={currentLanguage}
            onPress={() => {
              router.push('/settings/language');
            }}
          />
        </MenuCard>

        <MenuLabel label={t('settings:privacyData')} />
        <MenuCard>
          <MenuRow
            icon="🔒"
            label={t('settings:privacy')}
            onPress={() => {
              void WebBrowser.openBrowserAsync(PRIVACY_URL);
            }}
          />
        </MenuCard>

        <MenuLabel label={t('settings:aboutSection')} />
        <MenuCard>
          <MenuRow
            icon="ℹ️"
            label={t('settings:aboutRow')}
            onPress={() => {
              router.push('/about');
            }}
          />
          <MenuRow
            icon="✉️"
            label={t('settings:contact')}
            onPress={() => {
              router.push('/contact');
            }}
          />
          <MenuRow
            icon="📄"
            label={t('settings:legal')}
            onPress={() => {
              void WebBrowser.openBrowserAsync(TERMS_URL);
            }}
          />
        </MenuCard>

        {/* Guest: Sign in where the member frame shows Sign out (docs/spec/16). */}
        <View style={{ marginTop: spacing.lg }}>
          <Button
            label={t('settings:signin')}
            variant="accent"
            fullWidth
            onPress={() => {
              router.push('/auth');
            }}
          />
        </View>

        <Text
          style={{
            fontFamily: fontFamily.body.regular,
            fontSize: 12,
            color: colors.muted,
            textAlign: 'center',
            paddingTop: spacing.xl,
            paddingBottom: spacing.md,
          }}
        >
          {t('settings:appVersion', { version: appVersion })}
        </Text>
      </View>
    </Screen>
  );
}
