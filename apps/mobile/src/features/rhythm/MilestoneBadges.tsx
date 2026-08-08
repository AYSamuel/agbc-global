import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';

import { fontFamily, radius, spacing, tonal } from '@agbc/shared/theme';

import { useTheme } from '@/theme';

import type { MilestoneBadge } from './milestones';

/**
 * The mockup's `.mbadges` row of `.mbadge` cards, in both tones the frames draw:
 * earned (gold wash, text label) and `.mbadge.up`, the not-yet on RHYTHM's empty
 * state (alt wash, muted label).
 *
 * `.mbadges{gap:10;padding:0 16;overflow-x:auto}` ·
 * `.mbadge{width:96;radius:16;padding:14px 8px;centred}` ·
 * `.mbadge .mi{40px circle;rgba(255,207,74,.20);margin-bottom:8;font-size:18}`
 *
 * Two deliberate departures from the frame's CSS, both from `05`:
 *
 *  - the glyph colour is `colors.eye`, not the frame's literal `#b98600`. Deep
 *    gold is the light-surface gold; on a dark card it fails the contrast rule
 *    `05` sets, and `eye` is that rule already expressed (deep on light, bright
 *    on dark). It only shows on `✦`; the emoji carry their own colour.
 *  - `width:96` becomes a MINIMUM width. A fixed 96 clips its own label the
 *    moment the reader turns type up, and these are content labels rather than
 *    control labels, so they scale in full and the badge grows with them.
 */
export function MilestoneBadges({
  badges,
  tone = 'earned',
}: {
  badges: readonly MilestoneBadge[];
  tone?: 'earned' | 'ahead';
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const earned = tone === 'earned';

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{
        gap: spacing.md - 2,
        paddingHorizontal: spacing.lg,
      }}
    >
      {badges.map((badge) => (
        <View
          key={badge.kind}
          accessible
          accessibilityLabel={t(badge.labelKey)}
          style={{
            minWidth: 96,
            maxWidth: 160,
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.cardline,
            borderRadius: radius.cardTight,
            paddingVertical: spacing.lg - 2,
            paddingHorizontal: spacing.sm,
            alignItems: 'center',
          }}
        >
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{
              width: 40,
              height: 40,
              borderRadius: radius.full,
              backgroundColor: earned ? tonal.gold.bg : colors.alt,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: spacing.sm,
            }}
          >
            <Text
              style={{
                fontSize: 18,
                lineHeight: 24,
                color: earned ? colors.eye : colors.muted,
              }}
            >
              {badge.glyph}
            </Text>
          </View>
          <Text
            style={{
              fontFamily: fontFamily.body.bold,
              fontSize: 11,
              lineHeight: 14,
              color: earned ? colors.text : colors.muted,
              textAlign: 'center',
            }}
          >
            {t(badge.labelKey)}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}
