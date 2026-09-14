import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { fontFamily, palette, radius, spacing } from '@agbc/shared/theme';

import { useFormattingLocale } from '@/i18n';
import { useTheme } from '@/theme';

import { nextProgress } from './nextProgress';
import type { RhythmState } from './queries';

/**
 * The mockup's `.nextm` card with its `.pbar`: what the next milestone is, how
 * far away it is, and a bar that is the same fraction the Home strip's ring
 * draws (W2.8 frames, and the W4.16 section's "the Next card, every shape").
 *
 * `.nextm{margin:12px 16px 0;radius:16;padding:15px 16px}` ·
 * `.nt{13.5px/700, space-between, baseline}` · `.ng{12px muted 700}` ·
 * `.pbar{height:5;radius:100;background:alt}` · `.pbar i{background:green}`
 *
 * ONE SOURCE for the words and the fraction: `nextProgress`, which the strip
 * uses too. Two components computing "how far along" is how they end up
 * disagreeing, and this one is drawn directly under the other.
 *
 * Named, not counted, and the distance is the server's: "4 of 5 in November"
 * while a month of Sundays is not held, whole calendar weeks toward a season,
 * half a year and each year after it. The ladder has no top, so there is always
 * something ahead; the card is absent only when the server named nothing.
 */
export function NextMilestone({ rhythm }: { rhythm: RhythmState }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const locale = useFormattingLocale();

  const progress = nextProgress(rhythm, locale, t);
  if (progress === null) return null;
  const { title, distance, fraction } = progress;

  return (
    <View
      accessible
      accessibilityLabel={`${title}. ${distance}`}
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
      {/* THE ROW WRAPS rather than squeezing (device, 2026-09-14). The frame's
          `.nt` is one line, and at ordinary sizes it still is: the title grows
          and the distance sits at the right. But React Native does not shrink a
          flex child unless told, so at the phone's largest text on a 360dp
          screen "2 of 4 in September" kept its full width and broke the title
          mid-word ("A mo / nth of / Sunda / ys"). With `flexWrap` the distance
          takes the next line whenever the two cannot share one, and the title
          wraps at word boundaries within the card's width. */}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          columnGap: spacing.sm,
          rowGap: 2,
        }}
      >
        <Text
          style={{
            flexGrow: 1,
            flexShrink: 1,
            fontFamily: fontFamily.body.bold,
            fontSize: 13.5,
            color: colors.text,
          }}
        >
          {title}
        </Text>
        <Text
          style={{
            flexShrink: 1,
            fontFamily: fontFamily.body.bold,
            fontSize: 12,
            color: colors.muted,
          }}
        >
          {distance}
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
