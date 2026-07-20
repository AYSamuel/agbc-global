import {
  ActivityIndicator,
  Pressable,
  Text,
  type PressableProps,
} from 'react-native';

import {
  fontFamily,
  hitTarget,
  palette,
  radius,
  spacing,
} from '@agbc/shared/theme';

import { useTheme } from '@/theme';

// Variants per the mockup's .btn classes: 'primary' = btnBg/btnText (navy in light,
// gold in dark); 'accent' = gold fill with navy text on any theme; 'outline' sits on
// card; 'ghost' is muted text only.
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
      ? colors.btnBg
      : variant === 'accent'
        ? colors.accent
        : variant === 'outline'
          ? colors.card
          : 'transparent';
  // Accent (gold) always carries navy text, both themes (05 contrast rule).
  const foreground =
    variant === 'primary'
      ? colors.btnText
      : variant === 'accent'
        ? palette.navy
        : variant === 'outline'
          ? colors.text
          : colors.muted;

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
      {/* Mockup .btn: weight 800 at 15.5 (ghost: 700 at 13.5). */}
      <Text
        style={{
          fontFamily: fontFamily.body.bold,
          fontSize: variant === 'ghost' ? 13.5 : 15.5,
          color: foreground,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
