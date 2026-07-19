import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { hitTarget, spacing, typeScale } from '@agbc/shared/theme';

import { useTheme } from '@/theme';

export interface TabItem<K extends string> {
  key: K;
  label: string;
  /** Icon receives the resolved color at the call site via renderIcon. */
  renderIcon?: (color: string, size: number) => ReactNode;
  badge?: number;
}

export interface TabBarProps<K extends string> {
  items: readonly TabItem<K>[];
  activeKey: K;
  onPress: (key: K) => void;
}

// Presentational 5-tab bar (05): active = blue in light / gold in dark; role tab with
// selected state; the accessible label includes the badge count where present. Route
// wiring happens at W1.2.
export function TabBar<K extends string>({
  items,
  activeKey,
  onPress,
}: TabBarProps<K>) {
  const { colors, name } = useTheme();
  const insets = useSafeAreaInsets();
  const activeColor = name === 'light' ? colors.blue : colors.accent;

  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: colors.card,
        borderTopWidth: 1,
        borderTopColor: colors.cardline,
        paddingBottom: insets.bottom,
      }}
    >
      {items.map((item) => {
        const selected = item.key === activeKey;
        const tint = selected ? activeColor : colors.muted;
        const label =
          item.badge && item.badge > 0
            ? `${item.label}, ${String(item.badge)} new`
            : item.label;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected }}
            onPress={() => {
              onPress(item.key);
            }}
            style={{
              flex: 1,
              minHeight: hitTarget.preferred,
              alignItems: 'center',
              justifyContent: 'center',
              gap: spacing.xs,
              paddingVertical: spacing.sm,
            }}
          >
            {item.renderIcon?.(tint, 22)}
            <Text
              style={[typeScale.label, { color: tint, letterSpacing: 0.5 }]}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
