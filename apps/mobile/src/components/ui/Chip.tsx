import { Pressable, Text } from 'react-native';

import { hitTarget, radius, spacing, typeScale } from '@agbc/shared/theme';

import { useTheme } from '@/theme';

export interface ChipProps {
  label: string;
  onPress?: () => void;
  selected?: boolean;
  /**
   * Override for the accessible label recipe. The branch chip passes
   * "Current branch {name}, change branch" per the 05 contract.
   */
  accessibilityLabel?: string;
}

export function Chip({
  label,
  onPress,
  selected = false,
  accessibilityLabel,
}: ChipProps) {
  const { colors } = useTheme();

  // Selected fill follows btnBg/btnText (navy in light, gold in dark), the mockup's
  // selection color pair; never gold-on-light (05 contrast rule).
  const activeBg = colors.btnBg;
  const activeFg = colors.btnText;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected }}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({
        minHeight: hitTarget.min,
        justifyContent: 'center',
        paddingHorizontal: spacing.lg,
        borderRadius: radius.full,
        backgroundColor: selected ? activeBg : colors.card,
        borderWidth: 1,
        borderColor: selected ? 'transparent' : colors.cardline,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Text
        style={[
          typeScale.bodySemiBold,
          { color: selected ? activeFg : colors.text },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}
