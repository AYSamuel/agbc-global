import { Text, View } from 'react-native';

import { fontFamily, onInk, palette, spacing } from '@agbc/shared/theme';

import { useTheme } from '@/theme';

import type { HeroContent } from './heroContent';

/**
 * The mockup's `.streakhero`: an ink card, a 58px gold number, an uppercase
 * unit, the sentence, and a quiet footnote.
 *
 * `margin:6px 16px 0` · `border-radius:20px` · `padding:22px` · centred.
 *
 * The BORDER is not in the frame's CSS and is not decoration: the card is ink in
 * both themes, and in dark the page behind it is the same ink, so without a
 * hairline it stops reading as a surface and becomes floating text. Exactly the
 * bug `StatusPanel` hit on the phone at W2.8 slice 2; same fix, same reason
 * (`05`: in dark, borders carry separation). Always present so the box measures
 * identically in both themes; only its colour changes.
 *
 * NOTHING HERE IS CAPPED AGAINST TEXT SCALE. The number is content, not a
 * control label, so it grows with the reader's setting (`05`), and the card has
 * no fixed height for it to clip against.
 */
export function StreakHero({ content }: { content: HeroContent }) {
  const { name, colors } = useTheme();

  return (
    <View
      // One phrase, not four fragments: "5, week rhythm, five weeks of showing
      // up..." read as separate stops is noise (docs/spec/05, the same grouping
      // rule the Home strip follows).
      accessible
      accessibilityLabel={[
        content.number,
        content.unit,
        content.headline,
        content.footnote,
      ]
        .filter((part): part is string => part !== null && part !== '')
        .join('. ')}
      style={{
        marginHorizontal: spacing.lg,
        marginTop: spacing.xs + 2,
        backgroundColor: palette.ink,
        borderWidth: 1,
        borderColor: name === 'dark' ? colors.cardline : 'transparent',
        borderRadius: 20,
        padding: spacing.x2l - 2,
        alignItems: 'center',
      }}
    >
      <Text
        style={{
          fontFamily: fontFamily.display.extraBold,
          fontSize: 58,
          lineHeight: 58,
          color: palette.gold,
          textAlign: 'center',
        }}
      >
        {content.number}
      </Text>
      <Text
        style={{
          fontFamily: fontFamily.body.extraBold,
          fontSize: 12,
          letterSpacing: 1.7,
          textTransform: 'uppercase',
          color: onInk.sub,
          marginTop: spacing.xs + 2,
          textAlign: 'center',
        }}
      >
        {content.unit}
      </Text>
      <Text
        style={{
          fontFamily: fontFamily.body.regular,
          fontSize: 14.5,
          lineHeight: 22,
          color: onInk.body,
          marginTop: spacing.lg - 2,
          textAlign: 'center',
        }}
      >
        {content.headline}
      </Text>
      {content.footnote === null ? null : (
        <Text
          style={{
            fontFamily: fontFamily.body.regular,
            fontSize: 12,
            color: onInk.sub,
            marginTop: spacing.sm,
            textAlign: 'center',
          }}
        >
          {content.footnote}
        </Text>
      )}
    </View>
  );
}
