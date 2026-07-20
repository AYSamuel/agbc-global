import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import {
  fontFamily,
  hitTarget,
  onInk,
  palette,
  radius,
  spacing,
  typeScale,
} from '@agbc/shared/theme';

import { useTheme } from '@/theme';

import { GradientFill } from './Gradient';
import { CheckIcon } from './icons';

// The mockup's .sel row (ONB-2/ONB-3, reused by future settings pickers): gradient
// initial tile, title (+ optional badge), optional sub line, radio circle on the
// right that fills with a check when selected. Radio semantics for assistive tech.

export interface SelectRowProps {
  tileLabel: string;
  title: string;
  subtitle?: string;
  /** Rendered inline after the title (e.g. the HQ pill). */
  badge?: ReactNode;
  selected: boolean;
  onSelect: () => void;
  accessibilityLabel: string;
}

export function SelectRow({
  tileLabel,
  title,
  subtitle,
  badge,
  selected,
  onSelect,
  accessibilityLabel,
}: SelectRowProps) {
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
      onPress={onSelect}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        minHeight: hitTarget.preferred,
        // 1px less when selected so the thicker border does not shift content.
        padding: selected ? spacing.lg - 1 : spacing.lg,
        borderRadius: radius.cardTight,
        backgroundColor: colors.card,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? colors.btnBg : colors.cardline,
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: 44,
          height: 44,
          borderRadius: radius.control,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <GradientFill from={palette.blue} to={palette.navy} />
        <Text
          style={{
            fontFamily: fontFamily.display.bold,
            fontSize: 17,
            color: onInk.text,
          }}
        >
          {tileLabel}
        </Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
          }}
        >
          <Text style={[typeScale.bodySemiBold, { color: colors.text }]}>
            {title}
          </Text>
          {badge}
        </View>
        {subtitle ? (
          <Text
            style={[typeScale.body, { fontSize: 12.5, color: colors.muted }]}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View
        style={{
          width: 24,
          height: 24,
          borderRadius: radius.full,
          borderWidth: 2,
          borderColor: selected ? colors.btnBg : colors.cardline,
          backgroundColor: selected ? colors.btnBg : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {selected ? (
          <CheckIcon size={14} color={colors.btnText} strokeWidth={3} />
        ) : null}
      </View>
    </Pressable>
  );
}
