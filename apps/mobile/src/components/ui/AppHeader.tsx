import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import {
  fontFamily,
  icon,
  radius,
  spacing,
  typeScale,
} from '@agbc/shared/theme';

import { useTheme } from '@/theme';

import { ChevronLeftIcon, CloseIcon } from './icons';

// The mockup's .chead pattern (SETTINGS, compose, detail screens): a 40px circle
// back button on the alt surface, centered display title, and a balancing slot on
// the right so the title stays optically centered.
//
// The compose frames (lines 1147 and 1610) use the same row with an X instead of
// the chevron, because leaving a composer discards rather than goes back. Same
// component, different glyph: `leading`.
const CONTROL_SIZE = 40;

/**
 * A BACK BUTTON MUST BE NAMED, and the type is what enforces it (W4.6 slice 5).
 *
 * `backLabel` used to be optional with `'Back'` as its default, so a screen that
 * forgot it announced the English word to a German member's screen reader while
 * every test passed and every visible string was translated. No live screen was
 * doing it, which is the cheapest moment to make it impossible: the pairing is a
 * union now, so an `onBack` without a `backLabel` is a compile error rather than
 * a silent fallback to English.
 */
type LeadingControl =
  | {
      /** Renders the back affordance. */
      onBack: () => void;
      /** Accessible label for it, resolved from i18n at the call site. */
      backLabel: string;
      /** Glyph: a chevron to go back, an X to leave. */
      leading?: 'back' | 'close';
    }
  | { onBack?: never; backLabel?: never; leading?: never };

export type AppHeaderProps = LeadingControl & {
  title: string;
  /** Right-side slot: bell, branch chip, overflow menu. */
  trailing?: ReactNode;
  /**
   * How the title is set. `title` is `.chead`, which nearly every screen wears.
   * `eyebrow` is the player's `.pl-top .lbl`: small, tracked, uppercase and muted,
   * because on that screen the message's own title is the heading and a second
   * bold one above it competes with it (synced 2026-08-14, W3.1 slice 4: the
   * player had been wearing the settings header since W1.3).
   */
  titleStyle?: 'title' | 'eyebrow';
};

export function AppHeader({
  title,
  onBack,
  backLabel,
  leading = 'back',
  trailing,
  titleStyle = 'title',
}: AppHeaderProps) {
  const { colors } = useTheme();
  const eyebrow = titleStyle === 'eyebrow';

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.sm,
        paddingHorizontal: spacing.gutter,
        paddingTop: spacing.md,
        paddingBottom: spacing.md,
      }}
    >
      {onBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={backLabel}
          onPress={onBack}
          hitSlop={spacing.sm}
          style={({ pressed }) => ({
            width: CONTROL_SIZE,
            height: CONTROL_SIZE,
            borderRadius: radius.full,
            backgroundColor: colors.alt,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.7 : 1,
          })}
        >
          {leading === 'close' ? (
            <CloseIcon size={icon.lg} color={colors.text} strokeWidth={2} />
          ) : (
            <ChevronLeftIcon color={colors.text} />
          )}
        </Pressable>
      ) : (
        <View style={{ width: CONTROL_SIZE }} />
      )}
      <Text
        accessibilityRole="header"
        numberOfLines={1}
        style={
          eyebrow
            ? [
                typeScale.label,
                {
                  // `.pl-top .lbl`: 11px / 800 / .16em, uppercase, muted.
                  fontSize: 11,
                  letterSpacing: 1.76,
                  color: colors.muted,
                  flex: 1,
                  textAlign: 'center',
                },
              ]
            : {
                fontFamily: fontFamily.display.extraBold,
                fontSize: 18,
                letterSpacing: -0.36,
                color: colors.text,
                flex: 1,
                textAlign: 'center',
              }
        }
      >
        {title}
      </Text>
      {trailing ?? <View style={{ width: CONTROL_SIZE }} />}
    </View>
  );
}
