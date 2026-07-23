import { Pressable, Text, View } from 'react-native';

import { hitTarget, radius, spacing, typeScale } from '@agbc/shared/theme';

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
            style={({ pressed }) => ({
              flex: 1,
              minHeight: hitTarget.min,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: radius.control,
              backgroundColor: selected ? activeBg : 'transparent',
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text
              style={[
                typeScale.bodySemiBold,
                { color: selected ? activeFg : colors.muted },
              ]}
            >
              {segment.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
