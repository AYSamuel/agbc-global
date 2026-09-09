import { Image, Pressable, Text, type ImageSourcePropType } from 'react-native';

import { fontFamily, spacing } from '@agbc/shared/theme';

import { useTheme } from '@/theme';

// Mockup `.ytcredit` (2026-08-15). Attribution for the AUDIO state, where the
// message's thumbnail and title are shown bare with no YouTube chrome anywhere
// on the screen.
//
// Why a badge and not the sentence it replaced: YouTube's developer policies ask
// a surface displaying their thumbnails and titles to make clear they are the
// source "by displaying YouTube Brand Features", and their branding guidelines
// require any YouTube mark inside an app to link back to YouTube. A line of text
// did neither. This does both, and it is also the way to the video that audio
// mode otherwise lacked.
//
// THE MARK IS THEIRS, NOT DRAWN (2026-09-09, `18`'s brand-asset line). Until
// this the badge was a red View with a bordered triangle, an approximation of a
// brand feature rather than the brand feature, and its red was #FF0000 where
// the current icon is #FF0033. The PNGs are cut from the "Core YouTube icon"
// pack on brand.youtube (`yt_icon_red_digital.png`, its transparent margin
// removed, resized to 24dp high at 1x/2x/3x with the colours untouched). Three
// of their rules hold here, with the numbers measured off the asset:
//   - minimum height 20dp (this is 24);
//   - the colours are never modified, which is why the mark is an image rather
//     than a themed SVG, and why it is the same in both themes;
//   - clear space on every side of at least the triangle's own size. The
//     triangle is 0.37 x 0.43 of the icon's height, so at 24dp it is ~9 x 10dp,
//     and the gap to the label is 12 (the mockup said 9, corrected on the frame
//     in the same change).

const YOUTUBE_ICON =
  require('../../../assets/images/youtube-icon.png') as ImageSourcePropType;

/** The mark's own proportions (826 x 578 in the source), at 24dp high. */
const ICON_HEIGHT = 24;
const ICON_WIDTH = 34;

export interface YouTubeCreditProps {
  /** "Watch on YouTube", already localized. */
  label: string;
  onPress: () => void;
}

export function YouTubeCredit({ label, onPress }: YouTubeCreditProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={spacing.sm}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        marginTop: spacing.lg,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {/* Decorative: the Pressable already carries the label for screen readers. */}
      <Image
        source={YOUTUBE_ICON}
        accessible={false}
        accessibilityIgnoresInvertColors
        resizeMode="contain"
        style={{ width: ICON_WIDTH, height: ICON_HEIGHT }}
      />
      <Text
        maxFontSizeMultiplier={1.3}
        numberOfLines={1}
        style={{
          fontFamily: fontFamily.body.bold,
          fontSize: 13,
          color: colors.text,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
