import { Link } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { hitTarget, radius, spacing, typeScale } from '@agbc/shared/theme';

import { Chip } from '@/components/ui';
import { LANGUAGE_AUTONYMS, SUPPORTED_LANGUAGES } from '@/i18n';
import { useLanguagePrefStore } from '@/state/language';
import { useTheme, type ThemePref } from '@/theme';

// DEV-ONLY token/theme/i18n playground (was the pre-W1.1 index screen). Reached by
// URL only; literal strings exempt from the i18n rule (never ships to users).
const PREFS: ThemePref[] = ['system', 'light', 'dark'];

const SWATCHES = [
  'bg',
  'alt',
  'text',
  'sub',
  'muted',
  'card',
  'cardline',
  'band',
  'accent',
  'blue',
  'eye',
  'btnBg',
  'btnText',
] as const;

const PLURAL_DEMO_COUNTS = [0, 1, 2, 5];

export default function TokenDemo() {
  const { colors, name, pref, setPref } = useTheme();
  const { t, i18n } = useTranslation();
  const langPref = useLanguagePrefStore((s) => s.pref);
  const setLangPref = useLanguagePrefStore((s) => s.setPref);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.gutter, gap: spacing.lg }}
    >
      <Text
        style={[typeScale.hero, { color: colors.text, marginTop: spacing.x4l }]}
      >
        {t('appName')}
      </Text>
      <Text style={[typeScale.label, { color: colors.eye }]}>
        Token demo · {name} theme · {i18n.language}
      </Text>

      <Link
        href="/gallery"
        style={[typeScale.bodySemiBold, { color: colors.blue }]}
      >
        Open component gallery
      </Link>

      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        {PREFS.map((p) => (
          <Pressable
            key={p}
            accessibilityRole="button"
            accessibilityState={{ selected: pref === p }}
            onPress={() => {
              setPref(p);
            }}
            style={{
              minHeight: hitTarget.min,
              paddingHorizontal: spacing.lg,
              justifyContent: 'center',
              borderRadius: radius.button,
              backgroundColor: pref === p ? colors.blue : colors.card,
              borderWidth: 1,
              borderColor: colors.cardline,
            }}
          >
            <Text
              style={[
                typeScale.bodySemiBold,
                { color: pref === p ? colors.bandtext : colors.text },
              ]}
            >
              {p}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={{ gap: spacing.sm }}>
        <Text style={[typeScale.section, { color: colors.text }]}>
          Language
        </Text>
        <View
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}
        >
          <Chip
            label="System"
            selected={langPref === 'system'}
            onPress={() => {
              setLangPref('system');
            }}
          />
          {SUPPORTED_LANGUAGES.map((lang) => (
            <Chip
              key={lang}
              label={LANGUAGE_AUTONYMS[lang]}
              selected={langPref === lang}
              onPress={() => {
                setLangPref(lang);
              }}
            />
          ))}
        </View>
        <Text style={[typeScale.body, { color: colors.muted }]}>
          {t('tagline')}
        </Text>
        <Text style={[typeScale.bodyMedium, { color: colors.text }]}>
          {[
            t('tabs.home'),
            t('tabs.watch'),
            t('tabs.family'),
            t('tabs.give'),
            t('tabs.more'),
          ].join(' · ')}
        </Text>
        <Text style={[typeScale.body, { color: colors.muted }]}>
          {PLURAL_DEMO_COUNTS.map((count) => t('weeks', { count })).join(' · ')}
        </Text>
      </View>

      <View style={{ gap: spacing.sm }}>
        <Text style={[typeScale.section, { color: colors.text }]}>Colors</Text>
        {SWATCHES.map((key) => (
          <View
            key={key}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.md,
            }}
          >
            <View
              style={{
                width: spacing.x4l,
                height: spacing.x4l,
                borderRadius: radius.control,
                backgroundColor: colors[key],
                borderWidth: 1,
                borderColor: colors.cardline,
              }}
            />
            <Text style={[typeScale.bodyMedium, { color: colors.text }]}>
              {key}
            </Text>
            <Text style={[typeScale.body, { color: colors.muted }]}>
              {colors[key]}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
