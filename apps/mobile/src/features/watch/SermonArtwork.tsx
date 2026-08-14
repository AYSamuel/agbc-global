import { Image } from 'expo-image';
import { Text, View } from 'react-native';

import { fontFamily, media, onInk, palette, radius } from '@agbc/shared/theme';

import { AudioIcon, GradientFill } from '@/components/ui';

// Mockup `.pl-art` (W3.1 frames): what stands where the YouTube embed was once
// audio-only is on.
//
// Two cases, and the difference is the point. A message that IS on YouTube shows
// its own thumbnail under a light scrim, so the screen still looks like the thing
// you tapped; the scrim is there because that picture is a video frame and no
// video is playing. A message that was never on YouTube has no thumbnail at all
// (the dashboard inserts those rows with `thumbnail_url` empty), so it falls back
// to the branded gradient the player already uses, which is also what the lock
// screen gets.

export interface SermonArtworkProps {
  thumbnailUrl: string | null;
  /** Localized `.tag` copy. Also the region's accessible name. */
  label: string;
  height: number;
}

export function SermonArtwork({
  thumbnailUrl,
  label,
  height,
}: SermonArtworkProps) {
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={{
        height,
        borderRadius: radius.cardTight,
        overflow: 'hidden',
        backgroundColor: palette.ink,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      {/* `.pl-art.none`'s 160deg navy pair when there is no image, and the base
          under `.pl-art`'s thumbnail when there is one. */}
      <GradientFill
        direction="diagonal"
        from={media.artFrom}
        to={media.artTo}
      />
      {thumbnailUrl ? (
        <>
          <Image
            source={{ uri: thumbnailUrl }}
            style={{ position: 'absolute', width: '100%', height: '100%' }}
            contentFit="cover"
            transition={150}
            onError={(event) => {
              // Decorative: the gradient underneath is the fallback, and it is
              // the SAME one an audio-only message gets, so a dead thumbnail
              // degrades into a state the design already covers.
              console.warn('sermon artwork failed:', thumbnailUrl, event.error);
            }}
          />
          {/* `.pl-art .scrim`. Tuned on the device against a real photo: 58%
              rendered as the same navy as the no-thumbnail fallback, and 30%
              did not read as dimmed at all behind a bright thumbnail. */}
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: media.artScrim,
            }}
          />
        </>
      ) : null}
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: radius.full,
          backgroundColor: palette.gold,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <AudioIcon size={28} color={palette.navy} strokeWidth={2} />
      </View>
      <Text
        // The region carries the label; the pill would repeat it to a reader.
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          position: 'absolute',
          left: 14,
          bottom: 14,
          overflow: 'hidden',
          borderRadius: radius.full,
          paddingVertical: 6,
          paddingHorizontal: 12,
          backgroundColor: media.tagBg,
          color: onInk.text,
          fontFamily: fontFamily.body.bold,
          fontSize: 10.5,
          letterSpacing: 1.7,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </Text>
    </View>
  );
}
