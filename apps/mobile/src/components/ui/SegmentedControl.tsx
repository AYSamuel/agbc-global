import { Pressable, Text, View } from 'react-native';

import { fontFamily, radius, spacing } from '@agbc/shared/theme';

import { useTheme } from '@/theme';

export interface Segment<K extends string> {
  key: K;
  label: string;
}

export interface SegmentedControlProps<K extends string> {
  segments: readonly Segment<K>[];
  value: K;
  onChange: (key: K) => void;
  /** Accessible name for the group (e.g. "Scope", "Theme"). */
  accessibilityLabel: string;
}

// 05 contract: role tablist/tab, selected state announced, each segment labeled.
export function SegmentedControl<K extends string>({
  segments,
  value,
  onChange,
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
        return (
          <Pressable
            key={segment.key}
            accessibilityRole="tab"
            accessibilityLabel={segment.label}
            accessibilityState={{ selected }}
            onPress={() => {
              onChange(segment.key);
            }}
            // Mockup .seg button height (padding 9), not a 44px minHeight: hitSlop
            // extends the touch area to the 44px floor without the bulk.
            hitSlop={{ top: 6, bottom: 6 }}
            style={({ pressed }) => ({
              flex: 1,
              paddingVertical: 9,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: radius.control,
              backgroundColor: selected ? activeBg : 'transparent',
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text
              // Mockup .seg button: 13px/700, not the 15/600 body scale.
              style={{
                fontFamily: fontFamily.body.bold,
                fontSize: 13,
                color: selected ? activeFg : colors.muted,
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
