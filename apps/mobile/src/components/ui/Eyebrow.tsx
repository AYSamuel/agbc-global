import { Text, View } from 'react-native';

import { spacing, typeScale } from '@agbc/shared/theme';

import { useTheme } from '@/theme';

// Uppercase label + short rule, color `eye` (05). Purely decorative rule; the label is
// the accessible text.
export function Eyebrow({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ width: spacing.x2l, height: 2, backgroundColor: colors.eye }}
      />
      <Text style={[typeScale.label, { color: colors.eye }]}>{label}</Text>
    </View>
  );
}
