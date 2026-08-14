import { Pressable, Text, View } from 'react-native';

import { fontFamily, radius, spacing } from '@agbc/shared/theme';

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
// Before store submission, swap the drawn badge for the official asset from
// YouTube's branding kit: a mark we drew ourselves is an approximation of a
// brand feature rather than the brand feature (on `18`'s checklist).

/** YouTube red. A brand colour, deliberately NOT a token: it belongs to them,
 * and putting it in our palette would invite reuse as if it were ours. */
const YOUTUBE_RED = '#ff0000';

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
        gap: 9,
        marginTop: spacing.lg,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View
        style={{
          width: 34,
          height: 24,
          borderRadius: radius.control - 5,
          backgroundColor: YOUTUBE_RED,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* The play triangle, borders rather than an SVG: the same shape the
            mockup's `.badge::after` draws, and the same trick `SermonRow`'s
            play chip already uses. */}
        <View
          style={{
            marginLeft: 2,
            borderLeftWidth: 9,
            borderTopWidth: 5.5,
            borderBottomWidth: 5.5,
            borderLeftColor: '#ffffff',
            borderTopColor: 'transparent',
            borderBottomColor: 'transparent',
          }}
        />
      </View>
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
