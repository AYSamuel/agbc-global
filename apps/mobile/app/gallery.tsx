import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { spacing, typeScale } from '@agbc/shared/theme';

import { Button, Card, Chip, Eyebrow, SegmentedControl } from '@/components/ui';
import { ThemeScope, useTheme, type ThemeName } from '@/theme';

// DEV-ONLY gallery route (W0.8): every primitive in BOTH themes on one screen for
// screenshot checks per docs/spec/25. Never linked from product navigation; literal
// strings exempt from the i18n rule (this screen never ships to users).

function ScopePreview() {
  const [scope, setScope] = useState<'branch' | 'everywhere'>('everywhere');
  return (
    <SegmentedControl
      accessibilityLabel="Scope"
      segments={[
        { key: 'everywhere', label: 'Everywhere' },
        { key: 'branch', label: 'My branch' },
      ]}
      value={scope}
      onChange={setScope}
    />
  );
}

function PrimitiveSet({ theme }: { theme: ThemeName }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.bg,
        padding: spacing.gutter,
        gap: spacing.lg,
      }}
    >
      <Text style={[typeScale.section, { color: colors.text }]}>{theme}</Text>
      <Eyebrow label="Eyebrow label" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        <Button label="Primary" variant="primary" />
        <Button label="Accent" variant="accent" />
        <Button label="Outline" variant="outline" />
        <Button label="Ghost" variant="ghost" />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        <Button label="Disabled" disabled />
        <Button label="Loading" loading />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        <Chip
          label="AGBC Berlin"
          selected
          accessibilityLabel="Current branch AGBC Berlin, change branch"
        />
        <Chip label="Glasgow" />
        <Chip label="Filter" />
      </View>
      <ScopePreview />
      <Card>
        <Text style={[typeScale.cardTitle, { color: colors.text }]}>
          Static card
        </Text>
        <Text style={[typeScale.body, { color: colors.muted }]}>
          Surface + cardline border, radius 18.
        </Text>
      </Card>
      <Card
        size="hero"
        onPress={() => {
          // gallery: press feedback only
        }}
        accessibilityLabel="Pressable hero card"
      >
        <Text style={[typeScale.cardTitle, { color: colors.text }]}>
          Pressable hero card
        </Text>
      </Card>
    </View>
  );
}

export default function Gallery() {
  return (
    <ScrollView>
      <ThemeScope name="light">
        <PrimitiveSet theme="light" />
      </ThemeScope>
      <ThemeScope name="dark">
        <PrimitiveSet theme="dark" />
      </ThemeScope>
    </ScrollView>
  );
}
