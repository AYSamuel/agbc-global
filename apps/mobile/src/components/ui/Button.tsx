import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
  type PressableProps,
} from 'react-native';

import {
  fontFamily,
  hitTarget,
  onInk,
  palette,
  radius,
  spacing,
  tonal,
} from '@agbc/shared/theme';

import { useTheme } from '@/theme';

// Variants per the mockup's .btn classes: 'primary' = btnBg/btnText (navy in light,
// gold in dark); 'accent' = gold fill with navy text on any theme; 'outline' sits on
// card; 'ghost' is muted text only; 'glass' is the translucent white button the
// mockup uses ON ink/photo surfaces (.btn.glass), where 'outline' would paint a
// light card-colored block; 'danger' is `.btn.danger`, a solid red with white text,
// for the button that ends something (Block, Delete). Red in BOTH themes: the mockup
// keeps --red constant, and a destructive action is the one control that should not
// change temperature with the theme. 'confirmed' is `.btn.confirmed` (W2.9): an answer
// already given, holding its place in the layout rather than vanishing, in the gold
// wash + `--eye` border and text that reads in both themes. It is the page-surface
// sibling of the hero's `.btn.gold.on` ("You're here"), whose white-on-ink treatment
// is invisible on a light page.
export type ButtonVariant =
  'primary' | 'accent' | 'outline' | 'ghost' | 'glass' | 'danger' | 'confirmed';

export interface ButtonProps extends Omit<
  PressableProps,
  'style' | 'children'
> {
  label: string;
  variant?: ButtonVariant;
  loading?: boolean;
  fullWidth?: boolean;
  /**
   * Fill the parent's main axis (flex: 1). For side-by-side pairs whose
   * labels may wrap at large text scale: both buttons stay equal height
   * instead of the wrapped one outgrowing its sibling (#76).
   */
  fill?: boolean;
  /** Leading icon (mockup buttons that carry a glyph, e.g. "I will pray"). */
  icon?: ReactNode;
  /**
   * Recolours the LABEL without changing the surface. The mockup writes Sign out
   * as `.btn.outline` with `color:var(--red)`: an ordinary control that names a
   * consequence, not the solid red of Delete or Block (`.btn.danger`, which is
   * the variant). Kept as a tone rather than a seventh variant so the two cannot
   * drift apart.
   */
  tone?: 'danger';
}

export function Button({
  label,
  variant = 'primary',
  loading = false,
  fullWidth = false,
  fill = false,
  icon,
  tone,
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
          : variant === 'glass'
            ? 'rgba(255,255,255,0.16)'
            : variant === 'danger'
              ? palette.red
              : variant === 'confirmed'
                ? tonal.gold.bg
                : 'transparent';
  // Accent (gold) always carries navy text, both themes (05 contrast rule);
  // glass sits on ink/photo, so its text is always white; danger is white on red.
  const base =
    variant === 'primary'
      ? colors.btnText
      : variant === 'accent'
        ? palette.navy
        : variant === 'outline'
          ? colors.text
          : variant === 'glass' || variant === 'danger'
            ? onInk.text
            : // `--eye` reads in both themes, which is the whole reason the
              // frame's `.btn.confirmed` uses it: deep gold on light, bright
              // gold on dark (05 contrast rule).
              variant === 'confirmed'
              ? colors.eye
              : colors.muted;
  // The tone recolours the label only; the surface stays the variant's.
  const foreground = tone === 'danger' ? palette.red : base;

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
        borderWidth:
          variant === 'outline' || variant === 'glass'
            ? 1
            : variant === 'confirmed'
              ? 1.5
              : 0,
        borderColor:
          variant === 'glass'
            ? 'rgba(255,255,255,0.28)'
            : variant === 'confirmed'
              ? colors.eye
              : colors.cardline,
        opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1,
        alignSelf: fullWidth ? 'stretch' : 'auto',
        flex: fill ? 1 : undefined,
      })}
    >
      {loading ? <ActivityIndicator size="small" color={foreground} /> : null}
      {!loading && icon ? <View accessible={false}>{icon}</View> : null}
      {/* Mockup .btn: weight 800 at 15.5 (ghost: 700 at 13.5). Centered so a
          label wrapped at large text scale stays symmetric (#76). */}
      <Text
        style={{
          fontFamily:
            variant === 'ghost'
              ? fontFamily.body.bold
              : fontFamily.body.extraBold,
          fontSize: variant === 'ghost' ? 13.5 : 15.5,
          color: foreground,
          textAlign: 'center',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
