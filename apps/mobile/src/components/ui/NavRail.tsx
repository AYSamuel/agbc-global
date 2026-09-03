import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  fontFamily,
  palette,
  radius,
  spacing,
  tonal,
} from '@agbc/shared/theme';

import { useTheme } from '@/theme';

import type { TabItem } from './TabBar';

/**
 * The tablet nav rail (mockup `.railnav`, the tablet gallery's shared left edge).
 *
 * `05` puts the rule plainly: above ~600dp the bottom tab bar becomes a rail. It
 * is the SAME five roots in the same order as `TabBar`, and it takes the same
 * `TabItem` list, so a tab cannot exist in one and not the other.
 *
 * Values are the frame's own: 96 wide on a card surface with a right hairline,
 * a 46px gold logo disc, items 76 wide with 24px icons over an 11px bold label,
 * the active item on a 10% blue wash with blue text, then a spacer that pushes a
 * 44px avatar disc to the bottom.
 */
export interface NavRailProps<K extends string> {
  items: readonly TabItem<K>[];
  activeKey: K;
  onPress: (key: K) => void;
  /** The mockup's `.rav`, drawn at the bottom. Optional: a guest has no avatar
   *  to show, and the rail is the same shape without it. */
  avatar?: ReactNode;
  /** Announced as the rail's purpose, since a rail has no visible heading. */
  accessibilityLabel: string;
}

const RAIL_WIDTH = 96;
const ITEM_WIDTH = 76;
const LOGO = 46;

export function NavRail<K extends string>({
  items,
  activeKey,
  onPress,
  avatar,
  accessibilityLabel,
}: NavRailProps<K>) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={{
        width: RAIL_WIDTH,
        backgroundColor: colors.card,
        borderRightWidth: 1,
        borderRightColor: colors.cardline,
        alignItems: 'center',
        // The frame's 16/20; the safe-area insets are added rather than
        // replacing them, because a tablet in landscape has a cutout on one of
        // these edges and the rail is the thing standing in it.
        paddingTop: insets.top + spacing.md,
        paddingBottom: insets.bottom + spacing.lg,
        paddingLeft: insets.left,
      }}
    >
      <View
        // Decorative: the wordmark is not a control and the rail already says
        // what it is.
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: LOGO,
          height: LOGO,
          borderRadius: radius.button,
          backgroundColor: palette.gold,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: spacing.md,
        }}
      >
        <Text
          style={{
            fontFamily: fontFamily.display.extraBold,
            fontSize: 23,
            color: palette.navy,
          }}
        >
          {/* The AGBC monogram. Keyed rather than literal, exactly as
              `brand.line1` and `brand.line2` are: identical in all four
              languages, but the no-literal-strings rule should not need an
              exception carved for it (W4.6 slice 5). */}
          {t('brand.monogram')}
        </Text>
      </View>

      {items.map((item) => {
        const selected = item.key === activeKey;
        const tint = selected ? colors.blue : colors.muted;
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
              width: ITEM_WIDTH,
              alignItems: 'center',
              gap: 5,
              paddingVertical: 11,
              borderRadius: radius.cardTight,
              backgroundColor: selected ? tonal.blueRail.bg : 'transparent',
            }}
          >
            {item.renderIcon?.(tint, 24)}
            {/* Same rule as the bottom bar (`05`, #76): a rail label is a
                control label, so it caps at 1.3x and stays on one line. The
                rail is a fixed 96 wide and a wrapped label would push the
                icons out of alignment exactly as it did in the bar. */}
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={1.3}
              style={{
                fontFamily: fontFamily.body.bold,
                fontSize: 11,
                color: tint,
              }}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}

      <View style={{ flex: 1 }} />
      {avatar}
    </View>
  );
}
