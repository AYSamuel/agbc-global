import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { hitTarget, spacing, typeScale } from '@agbc/shared/theme';

import { useTheme } from '@/theme';

import { ChevronLeftIcon } from './icons';

export interface AppHeaderProps {
  title: string;
  /** Renders the back affordance when provided. */
  onBack?: () => void;
  /** Accessible label for the back control (i18n key resolution at call sites). */
  backLabel?: string;
  /** Right-side slot: bell, branch chip, overflow menu. */
  trailing?: ReactNode;
}

export function AppHeader({
  title,
  onBack,
  backLabel = 'Back',
  trailing,
}: AppHeaderProps) {
  const { colors } = useTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        minHeight: hitTarget.preferred,
        paddingHorizontal: spacing.md,
      }}
    >
      {onBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={backLabel}
          onPress={onBack}
          hitSlop={spacing.sm}
          style={({ pressed }) => ({
            minWidth: hitTarget.min,
            minHeight: hitTarget.min,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <ChevronLeftIcon color={colors.text} />
        </Pressable>
      ) : (
        <View style={{ width: spacing.sm }} />
      )}
      <Text
        accessibilityRole="header"
        numberOfLines={1}
        style={[typeScale.cardTitle, { color: colors.text, flex: 1 }]}
      >
        {title}
      </Text>
      {trailing}
    </View>
  );
}
