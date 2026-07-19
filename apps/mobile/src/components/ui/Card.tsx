import type { PropsWithChildren } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { radius, spacing } from '@agbc/shared/theme';

import { useTheme } from '@/theme';

export interface CardProps extends PropsWithChildren {
  /** Pressable cards get press feedback and a button role. */
  onPress?: () => void;
  accessibilityLabel?: string;
  /** 05 radii: tight 16 (settings rows), card 18 (default), hero 22. */
  size?: 'tight' | 'card' | 'hero';
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const RADIUS = {
  tight: radius.cardTight,
  card: radius.card,
  hero: radius.cardHero,
} as const;

export function Card({
  children,
  onPress,
  accessibilityLabel,
  size = 'card',
  style,
  testID,
}: CardProps) {
  const { colors } = useTheme();

  const surface: ViewStyle = {
    backgroundColor: colors.card,
    borderColor: colors.cardline,
    borderWidth: 1,
    borderRadius: RADIUS[size],
    padding: spacing.xl,
  };

  if (!onPress) {
    return (
      <View testID={testID} style={[surface, style]}>
        {children}
      </View>
    );
  }

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [surface, { opacity: pressed ? 0.9 : 1 }, style]}
    >
      {children}
    </Pressable>
  );
}
