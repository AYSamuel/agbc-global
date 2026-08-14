import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { fontFamily, radius, spacing } from '@agbc/shared/theme';

import { useTheme } from '@/theme';

export interface Segment<K extends string> {
  key: K;
  label: string;
  /** Glyph before the label (the player's mode segment draws one; the Family
   * scope toggle does not). Receives the colour the label is drawn in. */
  icon?: (color: string) => ReactNode;
  /**
   * The segment exists but cannot be chosen right now: a message with no video,
   * or one whose audio is not uploaded yet. Dimmed, and it still ANSWERS a press
   * through `onUnavailable` rather than announcing itself disabled, because a
   * control that reacts while claiming to be disabled lies to assistive tech
   * (W3.1 slice 3's rule, kept when the tiles became this control).
   */
  unavailable?: boolean;
  /** Why it cannot be chosen. Spoken on focus, so the reason arrives BEFORE the
   * press rather than only in the toast after it. */
  hint?: string;
}

export interface SegmentedControlProps<K extends string> {
  segments: readonly Segment<K>[];
  value: K;
  onChange: (key: K) => void;
  /** Pressed while `unavailable`. Say the reason; change nothing. */
  onUnavailable?: (key: K) => void;
  /** Accessible name for the group (e.g. "Scope", "Theme"). */
  accessibilityLabel: string;
}

// 05 contract: role tablist/tab, selected state announced, each segment labeled.
export function SegmentedControl<K extends string>({
  segments,
  value,
  onChange,
  onUnavailable,
  accessibilityLabel,
}: SegmentedControlProps<K>) {
  const { colors } = useTheme();
  // Mockup .seg: alt track; the active segment is a raised chip, not a color
  // fill; inactive labels are muted. `raised`, not `card`: card-on-alt has no
  // contrast in dark (see the token's note; fixed 2026-07-21).
  const activeBg = colors.raised;
  const activeFg = colors.text;

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={{
        flexDirection: 'row',
        backgroundColor: colors.alt,
        borderRadius: radius.button,
        padding: spacing.xs,
        gap: spacing.xs,
      }}
    >
      {segments.map((segment) => {
        const selected = segment.key === value;
        const label = selected ? activeFg : colors.muted;
        return (
          <Pressable
            key={segment.key}
            accessibilityRole="tab"
            accessibilityLabel={segment.label}
            accessibilityHint={segment.hint}
            accessibilityState={{ selected }}
            onPress={() => {
              if (segment.unavailable) {
                onUnavailable?.(segment.key);
                return;
              }
              onChange(segment.key);
            }}
            // Mockup .seg button height (padding 9), not a 44px minHeight: hitSlop
            // extends the touch area to the 44px floor without the bulk.
            hitSlop={{ top: 6, bottom: 6 }}
            style={({ pressed }) => ({
              flex: 1,
              flexDirection: 'row',
              gap: 7,
              paddingVertical: 9,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: radius.control,
              backgroundColor: selected ? activeBg : 'transparent',
              opacity: segment.unavailable ? 0.45 : pressed ? 0.85 : 1,
            })}
          >
            {segment.icon?.(label)}
            <Text
              // Mockup .seg button: 13px/700, not the 15/600 body scale.
              // Control labels cap their scale and ellipsize (docs/spec/05,
              // #76): a long branch name at max font pushed the control
              // off-screen on the Family scope toggle.
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
              style={{
                fontFamily: fontFamily.body.bold,
                fontSize: 13,
                color: label,
              }}
            >
              {segment.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
