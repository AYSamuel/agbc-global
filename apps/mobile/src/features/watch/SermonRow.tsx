import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { fontFamily, palette, radius, spacing } from '@agbc/shared/theme';

import { GradientFill } from '@/components/ui';
import { useTheme } from '@/theme';

import { durationMinutes, joinMeta } from './format';
import type { SermonSummary } from './queries';

// Mockup .rrow: 120x72 thumbnail (>= the 120x70 YouTube ToS floor, docs/spec/08)
// with a play chip, title at 14.5/700, muted meta line. 'featured' is the
// larger treatment Home's latest-message block uses (2026-07-20).
//
// W3.1 slice 4 adds MY-LIST's two variants of the same row: `trailing` (the
// `.rsave` remove control sits beside the row, not behind a menu) and `gone`
// (`.rrow.gone`, 08's rot handling: a saved message the channel lost renders
// dimmed with "No longer available" for its meta). The dimming sits on the two
// parts rather than the row, exactly as the frame's CSS comment says: a child
// cannot climb back out of a parent's opacity, and the one control still worth
// pressing must not be the faintest thing there.
const SIZES = {
  default: { width: 120, height: 72, title: 14.5, lineHeight: 18, meta: 12 },
  featured: { width: 150, height: 90, title: 16, lineHeight: 21, meta: 12.5 },
} as const;

const GONE_OPACITY = 0.55;

export function SermonRow({
  sermon,
  onPress,
  size = 'default',
  gone = false,
  trailing,
}: {
  sermon: SermonSummary;
  onPress: () => void;
  size?: keyof typeof SIZES;
  /** `.rrow.gone`: nothing left to play (unavailable AND no audio). */
  gone?: boolean;
  /** Sits beside the row, outside its pressable (MY-LIST's remove control). */
  trailing?: ReactNode;
}) {
  const dims = SIZES[size];
  const { colors } = useTheme();
  const { t } = useTranslation();
  const minutes = durationMinutes(sermon.duration_sec);
  const meta = gone
    ? t('watch:noLongerAvailable')
    : joinMeta([
        sermon.speaker || null,
        minutes === null ? null : t('watch:minutes', { count: minutes }),
      ]);

  const row = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={joinMeta([sermon.title, meta])}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: trailing === undefined ? undefined : 1,
        minWidth: 0,
        flexDirection: 'row',
        gap: spacing.md,
        alignItems: 'center',
        paddingVertical: 10,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View
        style={{
          width: dims.width,
          height: dims.height,
          borderRadius: radius.control,
          overflow: 'hidden',
          flex: 0,
          alignItems: 'center',
          justifyContent: 'center',
          // The frame grays the thumb (grayscale + .55); RN has no portable
          // grayscale filter, so the dimming carries it alone and the artwork
          // of the vanished video is not drawn at all.
          opacity: gone ? GONE_OPACITY : 1,
        }}
      >
        <GradientFill from={palette.navy} to={palette.blue} />
        {!gone && sermon.thumbnail_url ? (
          <Image
            source={{ uri: sermon.thumbnail_url }}
            style={{ position: 'absolute', width: '100%', height: '100%' }}
            contentFit="cover"
            transition={150}
          />
        ) : null}
        {/* No play chip on a gone row: there is nothing left to play. */}
        {!gone ? (
          <View
            style={{
              width: 28,
              height: 28,
              borderRadius: radius.full,
              backgroundColor: 'rgba(255,255,255,0.9)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* Mockup .play: a CSS triangle; borders draw it identically in RN. */}
            <View
              style={{
                marginLeft: 2,
                borderLeftWidth: 8,
                borderTopWidth: 5,
                borderBottomWidth: 5,
                borderLeftColor: palette.navy,
                borderTopColor: 'transparent',
                borderBottomColor: 'transparent',
              }}
            />
          </View>
        ) : null}
      </View>
      <View
        style={{
          flex: 1,
          gap: spacing.xs,
          opacity: gone ? GONE_OPACITY : 1,
        }}
      >
        <Text
          numberOfLines={2}
          style={{
            fontFamily: fontFamily.body.bold,
            fontSize: dims.title,
            lineHeight: dims.lineHeight,
            color: colors.text,
          }}
        >
          {sermon.title}
        </Text>
        {meta ? (
          <Text
            style={{
              // `.gonem` is the meta line at weight 700; the ordinary meta is
              // regular.
              fontFamily: gone ? fontFamily.body.bold : fontFamily.body.regular,
              fontSize: dims.meta,
              color: colors.muted,
            }}
          >
            {meta}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );

  if (trailing === undefined) return row;
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
    >
      {row}
      {trailing}
    </View>
  );
}
