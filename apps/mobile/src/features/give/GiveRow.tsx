import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { fontFamily, radius, spacing } from '@agbc/shared/theme';

import { ChevronRightIcon } from '@/components/ui';
import { useTheme } from '@/theme';

// GIVE "Other ways to give" row (mockup .giverow): a glyph tile, a two-line
// title/subtitle, and a trailing chevron. Used for PayPal and Bank transfer.
export interface GiveRowProps {
  icon: ReactNode;
  title: string;
  subtitle: string;
  onPress: () => void;
  accessibilityLabel: string;
}

export function GiveRow({
  icon,
  title,
  subtitle,
  onPress,
  accessibilityLabel,
}: GiveRowProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        // Mockup .giverow: padding 13x15, card surface, 1px border, radius 16.
        paddingVertical: 13,
        paddingHorizontal: 15,
        minHeight: 44,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.cardline,
        borderRadius: radius.cardTight,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {/* .gic: 38 square alt tile; the glyph is decorative, the row is labelled. */}
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: 38,
          height: 38,
          borderRadius: 11,
          backgroundColor: colors.alt,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {icon}
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontFamily: fontFamily.body.bold,
            fontSize: 14.5,
            color: colors.text,
          }}
        >
          {title}
        </Text>
        <Text
          style={{
            fontFamily: fontFamily.body.regular,
            fontSize: 12,
            color: colors.muted,
            marginTop: 1,
          }}
        >
          {subtitle}
        </Text>
      </View>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <ChevronRightIcon color={colors.muted} />
      </View>
    </Pressable>
  );
}
