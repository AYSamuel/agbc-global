import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import {
  fontFamily,
  palette,
  radius,
  spacing,
  tonal,
} from '@agbc/shared/theme';

import { useTheme } from '@/theme';

/**
 * The mockup's rounded action pill, shared by every Family reaction: `.glory`,
 * `.glory.on`, `.praybtn`, `.praybtn.committed`, `.praybtn.on`. One shape, an
 * optional leading icon, and a tone that carries the state.
 *
 * Distinct from `Chip`, which is a SELECTION control (filled with btnBg when
 * chosen). This is an ACTION whose tone reports what the member has already done:
 * neutral = not yet, gold = committed, green = fulfilled.
 */
export type ActionPillTone = 'neutral' | 'gold' | 'goldSoft' | 'green';

export interface ActionPillProps {
  label: string;
  onPress?: () => void;
  tone?: ActionPillTone;
  icon?: ReactNode;
  /** Announced state for a toggle-like pill (Glory on/off). */
  selected?: boolean;
  accessibilityLabel?: string;
}

export function ActionPill({
  label,
  onPress,
  tone = 'neutral',
  icon,
  selected,
  accessibilityLabel,
}: ActionPillProps) {
  const { colors } = useTheme();

  const toneStyle =
    tone === 'neutral'
      ? { bg: colors.alt, border: colors.cardline, fg: colors.sub }
      : tone === 'gold'
        ? { ...tonal.gold, fg: colors.text }
        : tone === 'goldSoft'
          ? { ...tonal.goldSoft, fg: colors.eye }
          : { ...tonal.green, fg: palette.green };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={selected === undefined ? undefined : { selected }}
      onPress={onPress}
      disabled={!onPress}
      // The pill renders at the mockup's compact height (8px vertical padding,
      // ~34px tall), but hitSlop extends the TOUCH area past the 44px floor so
      // the 05 accessibility contract still holds without a bloated-looking pill
      // (fixed 2026-07-23 after the mockup diff).
      hitSlop={{ top: 6, bottom: 6 }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: 7,
        paddingVertical: spacing.sm,
        paddingHorizontal: spacing.md + 2,
        borderRadius: radius.full,
        backgroundColor: toneStyle.bg,
        borderWidth: 1,
        borderColor: toneStyle.border,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      {icon ? <View accessible={false}>{icon}</View> : null}
      <Text
        style={{
          fontFamily: fontFamily.body.bold,
          fontSize: 12.5,
          color: toneStyle.fg,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
