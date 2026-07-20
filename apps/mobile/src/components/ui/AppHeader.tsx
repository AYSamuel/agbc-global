import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { fontFamily, radius, spacing } from '@agbc/shared/theme';

import { useTheme } from '@/theme';

import { ChevronLeftIcon } from './icons';

// The mockup's .chead pattern (SETTINGS, compose, detail screens): a 40px circle
// back button on the alt surface, centered display title, and a balancing slot on
// the right so the title stays optically centered.
const CONTROL_SIZE = 40;

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
          <ChevronLeftIcon color={colors.text} />
        </Pressable>
      ) : (
        <View style={{ width: CONTROL_SIZE }} />
      )}
      <Text
        accessibilityRole="header"
        numberOfLines={1}
        style={{
          fontFamily: fontFamily.display.extraBold,
          fontSize: 18,
          letterSpacing: -0.36,
          color: colors.text,
          flex: 1,
          textAlign: 'center',
        }}
      >
        {title}
      </Text>
      {trailing ?? <View style={{ width: CONTROL_SIZE }} />}
    </View>
  );
}
