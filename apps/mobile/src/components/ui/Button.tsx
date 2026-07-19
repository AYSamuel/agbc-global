import {
  ActivityIndicator,
  Pressable,
  Text,
  type PressableProps,
} from 'react-native';

import { hitTarget, radius, spacing, typeScale } from '@agbc/shared/theme';

import { useTheme } from '@/theme';

// The four 05 variants. Contrast rule: gold ('accent') carries navy text and is meant
// for dark/navy surroundings or emphasis moments; 'primary' (blue) is the default CTA.
export type ButtonVariant = 'primary' | 'accent' | 'outline' | 'ghost';

export interface ButtonProps extends Omit<
  PressableProps,
  'style' | 'children'
> {
  label: string;
  variant?: ButtonVariant;
  loading?: boolean;
  fullWidth?: boolean;
}

export function Button({
  label,
  variant = 'primary',
  loading = false,
  fullWidth = false,
  disabled,
  ...pressableProps
}: ButtonProps) {
  const { colors } = useTheme();
  const isDisabled = disabled === true || loading;

  const background =
    variant === 'primary'
      ? colors.blue
      : variant === 'accent'
        ? colors.accent
        : 'transparent';
  // Accent (gold) always carries navy text, both themes (05 contrast rule).
  const foreground =
    variant === 'primary'
      ? colors.bandtext
      : variant === 'accent'
        ? '#14213d'
        : variant === 'outline'
          ? colors.text
          : colors.blue;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      {...pressableProps}
      style={({ pressed }) => ({
        minHeight: hitTarget.preferred,
        paddingHorizontal: spacing.x2l,
        borderRadius: radius.button,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: spacing.sm,
        backgroundColor: background,
        borderWidth: variant === 'outline' ? 1 : 0,
        borderColor: colors.cardline,
        opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1,
        alignSelf: fullWidth ? 'stretch' : 'auto',
      })}
    >
      {loading ? <ActivityIndicator size="small" color={foreground} /> : null}
      <Text style={[typeScale.bodySemiBold, { color: foreground }]}>
        {label}
      </Text>
    </Pressable>
  );
}
