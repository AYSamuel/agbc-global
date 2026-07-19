import { Pressable, ScrollView, Text, View } from 'react-native';

import { hitTarget, radius, spacing, typeScale } from '@agbc/shared/theme';

import { useTheme, type ThemePref } from '@/theme';

// W0.7 demo screen: tokens + fonts + theme toggle, replaced by SPLASH at W1.1.
// Dev-only surface: literal strings are exempt from the i18n-keys rule until W0.9
// wires i18n (this screen never ships).
const PREFS: ThemePref[] = ['system', 'light', 'dark'];

const SWATCHES = [
  'bg',
  'alt',
  'util',
  'line',
  'text',
  'muted',
  'card',
  'cardline',
  'band',
  'accent',
  'blue',
] as const;

export default function TokenDemo() {
  const { colors, name, pref, setPref } = useTheme();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: spacing.gutter, gap: spacing.lg }}
    >
      <Text
        style={[typeScale.hero, { color: colors.text, marginTop: spacing.x4l }]}
      >
        AGBC Global
      </Text>
      <Text style={[typeScale.label, { color: colors.eye }]}>
        Token demo · {name} theme
      </Text>

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

      <View
        style={{
          backgroundColor: colors.card,
          borderColor: colors.cardline,
          borderWidth: 1,
          borderRadius: radius.card,
          padding: spacing.xl,
          gap: spacing.sm,
        }}
      >
        <Text style={[typeScale.section, { color: colors.text }]}>
          Typography
        </Text>
        <Text style={[typeScale.cardTitle, { color: colors.text }]}>
          Card title · Bricolage 700
        </Text>
        <Text style={[typeScale.body, { color: colors.text }]}>
          Body · Hanken 400. Belonging made visible across every nation.
        </Text>
        <Text style={[typeScale.bodyMedium, { color: colors.muted }]}>
          Muted medium · Hanken 500
        </Text>
        <Text style={[typeScale.label, { color: colors.eye }]}>
          Label · eyebrow
        </Text>
      </View>

      <View
        style={{
          backgroundColor: colors.band,
          borderRadius: radius.cardHero,
          padding: spacing.xl,
          gap: spacing.sm,
        }}
      >
        <Text style={[typeScale.cardTitle, { color: colors.bandtext }]}>
          Band surface
        </Text>
        <Text style={[typeScale.body, { color: colors.bandtext }]}>
          Gold accent carries on dark and navy surfaces.
        </Text>
        <View
          style={{
            alignSelf: 'flex-start',
            backgroundColor: colors.accent,
            borderRadius: radius.full,
            paddingHorizontal: spacing.lg,
            paddingVertical: spacing.sm,
          }}
        >
          <Text style={[typeScale.bodySemiBold, { color: '#14213d' }]}>
            Glory to God
          </Text>
        </View>
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
