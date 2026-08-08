import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { fontFamily, palette, radius, spacing } from '@agbc/shared/theme';

import { useTheme } from '@/theme';

import { badgeFor, milestoneFraction, nextMilestone } from './milestones';

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
 * IT NEVER VANISHES NOW. It used to render nothing past the last rung, which was
 * honest while the ladder had one and is the dead end W2.8 slice 5 removed: the
 * rungs run 4, 12, 26, 52 and then one per year without end, so there is always
 * something ahead and the card always has something true to say.
 */
export function NextMilestone({ weeks }: { weeks: number }) {
  const { t } = useTranslation();
  const { colors } = useTheme();

  const next = nextMilestone(weeks);
  const fraction = milestoneFraction(weeks);
  // Named, not counted: the rungs carry church language now ("A year of
  // Sundays"), and a card reading "Next: 104-week rhythm" beside a badge
  // reading "A year of Sundays" would be the same rung called two things.
  const badge = badgeFor(`${String(next)}_week_rhythm`);
  const name =
    badge === null
      ? t('rhythm:nextMilestone', { count: next })
      : t('rhythm:nextNamed', {
          name: t(badge.labelKey, { count: badge.count }),
        });

  return (
    <View
      accessible
      accessibilityLabel={`${name}. ${t('rhythm:weeksToGo', {
        count: next - weeks,
      })}`}
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
          {name}
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
