import { Children, type PropsWithChildren, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import {
  fontFamily,
  hitTarget,
  palette,
  radius,
  spacing,
} from '@agbc/shared/theme';

import { useTheme } from '@/theme';

import { ChevronRightIcon } from './icons';

// The mockup's menu hub vocabulary (.mlabel / .mcard / .mrow: MORE hub, SETTINGS,
// future NOTIF-PREFS): an uppercase section label, a card of rows with hairline
// separators, each row an icon tile + label + trailing value/badge/chevron.

export function MenuLabel({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <Text
      style={{
        fontFamily: fontFamily.body.bold,
        fontSize: 11,
        letterSpacing: 1.5,
        textTransform: 'uppercase',
        color: colors.muted,
        paddingHorizontal: spacing.xs,
        paddingTop: spacing.lg,
        paddingBottom: spacing.sm,
      }}
    >
      {label}
    </Text>
  );
}

export function MenuCard({ children }: PropsWithChildren) {
  const { colors } = useTheme();
  const rows = Children.toArray(children);
  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.cardline,
        borderRadius: radius.cardTight,
        overflow: 'hidden',
      }}
    >
      {rows.map((row, index) => (
        // Index keys are safe here: menu rows are a static list, never reordered.
        <View key={index}>
          {index > 0 ? (
            <View style={{ height: 1, backgroundColor: colors.cardline }} />
          ) : null}
          {row}
        </View>
      ))}
    </View>
  );
}

export interface MenuRowProps {
  /** Emoji glyph rendered in the alt tile (mockup .mic uses emoji, not SVG). */
  icon: string;
  label: string;
  /** Muted trailing value before the chevron (mockup .val). */
  value?: string;
  /** Trailing pill instead of the chevron (mockup .lock, e.g. "Sign in"). */
  badge?: string;
  /** Custom trailing slot; wins over badge/chevron (e.g. a segmented control). */
  trailing?: ReactNode;
  danger?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}

export function MenuRow({
  icon,
  label,
  value,
  badge,
  trailing,
  danger = false,
  onPress,
  accessibilityLabel,
}: MenuRowProps) {
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 13,
        paddingVertical: 14,
        paddingHorizontal: 15,
        minHeight: hitTarget.min,
        backgroundColor: pressed ? colors.alt : 'transparent',
      })}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          backgroundColor: colors.alt,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: 16 }}>{icon}</Text>
      </View>
      <Text
        style={{
          fontFamily: fontFamily.body.semiBold,
          fontSize: 14.5,
          // Mockup .mrow.danger: the label goes red (Delete account).
          color: danger ? palette.red : colors.text,
          flex: 1,
        }}
      >
        {label}
      </Text>
      {value ? (
        <Text
          style={{
            fontFamily: fontFamily.body.regular,
            fontSize: 13.5,
            color: colors.muted,
            marginRight: spacing.sm,
          }}
        >
          {value}
        </Text>
      ) : null}
      {trailing ??
        (badge ? (
          <Text
            style={{
              fontFamily: fontFamily.body.bold,
              fontSize: 10.5,
              color: colors.muted,
              backgroundColor: colors.alt,
              borderRadius: radius.full,
              paddingVertical: 3,
              paddingHorizontal: 9,
              overflow: 'hidden',
            }}
          >
            {badge}
          </Text>
        ) : (
          <ChevronRightIcon size={18} color={colors.muted} />
        ))}
    </Pressable>
  );
}
