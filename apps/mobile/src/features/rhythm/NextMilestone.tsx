import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { fontFamily, palette, radius, spacing } from '@agbc/shared/theme';

import { useTheme } from '@/theme';

import { milestoneFraction, nextMilestone } from './milestones';

/**
 * The mockup's `.nextm` card with its `.pbar`: what the next rung is, how far
 * away it is, and a bar that is the same fraction the Home strip's ring draws.
 *
 * `.nextm{margin:12px 16px 0;radius:16;padding:15px 16px}` ·
 * `.nt{13.5px/700, space-between, baseline}` · `.ng{12px muted 700}` ·
 * `.pbar{height:5;radius:100;background:alt}` · `.pbar i{background:green}`
 *
 * ONE SOURCE for the fraction: `milestoneFraction`, which the strip already
 * uses. Two components computing "how far along" from the same number is how
 * they end up disagreeing, and this one is drawn directly under the other.
 *
 * Renders nothing past the last rung. There is no next milestone to count down
 * to, and inventing one so the card has something to say would be the nag `10`
 * forbids: the hero says the steady thing instead.
 */
export function NextMilestone({ weeks }: { weeks: number }) {
  const { t } = useTranslation();
  const { colors } = useTheme();

  const next = nextMilestone(weeks);
  if (next === null) return null;
  const fraction = milestoneFraction(weeks);

  return (
    <View
      accessible
      accessibilityLabel={`${t('rhythm:nextMilestone', { count: next })}. ${t(
        'rhythm:weeksToGo',
        { count: next - weeks },
      )}`}
      style={{
        marginHorizontal: spacing.lg,
        marginTop: spacing.md,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.cardline,
        borderRadius: radius.cardTight,
        paddingVertical: spacing.lg - 1,
        paddingHorizontal: spacing.lg,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: spacing.sm,
        }}
      >
        <Text
          style={{
            flex: 1,
            fontFamily: fontFamily.body.bold,
            fontSize: 13.5,
            color: colors.text,
          }}
        >
          {t('rhythm:nextMilestone', { count: next })}
        </Text>
        <Text
          style={{
            fontFamily: fontFamily.body.bold,
            fontSize: 12,
            color: colors.muted,
          }}
        >
          {t('rhythm:weeksToGo', { count: next - weeks })}
        </Text>
      </View>
      {/* Decoration: the two lines above already say the same thing in words. */}
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          flexDirection: 'row',
          height: 5,
          borderRadius: radius.full,
          backgroundColor: colors.alt,
          overflow: 'hidden',
          marginTop: spacing.sm + 1,
        }}
      >
        {/* Two flex weights rather than a percentage width: the fraction is
            already a 0..1 number, and this way the bar has no string to parse
            and no rounding of its own. */}
        <View style={{ flex: fraction, backgroundColor: palette.green }} />
        <View style={{ flex: 1 - fraction }} />
      </View>
    </View>
  );
}
