import { Image } from 'expo-image';
import { usePathname, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  fontFamily,
  media,
  palette,
  radius,
  spacing,
} from '@agbc/shared/theme';

import { AudioIcon, CloseIcon, PauseIcon, PlayIcon } from '@/components/ui';
import { useTheme } from '@/theme';

import { scrubFraction } from './audio';
import { useNowPlaying } from './nowPlaying';

// Mockup `NOW-PLAYING-BAR` (W4.9 slice 3, frames approved 2026-09-06): 56px, the
// card surface and hairline of the tab bar it sits on, a 2px gold progress line
// on its top edge, a 40px artwork tile, title over speaker on one line each, the
// gold play/pause disc, and a muted dismiss cross. Tapping the bar opens the
// player. It is absent whenever nothing is loaded, and on the player itself.
//
// Three hosts draw it, one per layout: the tab bar host on a phone's tab
// screens, the root layout on a phone's stack screens (with the home indicator's
// inset under it), and the tablet shell across the content column. Each host
// asks `where` so the bar knows which inset to carry.

const HEIGHT = 56;
const ART = 40;
const CONTROL = 40;

export function NowPlayingBar({
  where,
}: {
  /** Above a tab bar the inset is the tab bar's; at the bottom edge it is ours. */
  where: 'above-tabs' | 'bottom-edge';
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const nowPlaying = useNowPlaying();
  const { item, status } = nowPlaying;

  if (item === null) return null;
  // The player is its own bar.
  if (pathname === `/sermon/${item.sermonId}`) return null;

  const fraction = scrubFraction(status.currentTime, status.duration);
  const bottomInset = where === 'bottom-edge' ? insets.bottom : 0;

  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderTopWidth: 1,
        borderTopColor: colors.cardline,
        paddingBottom: bottomInset,
      }}
    >
      {/* The progress line sits ON the hairline, the frame's `.npprog`. Two
          flex children rather than a percentage width, for the reason written
          on the transport's fill. */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: -1,
          left: 0,
          right: 0,
          height: 2,
          flexDirection: 'row',
        }}
      >
        <View style={{ flex: fraction, backgroundColor: palette.gold }} />
        <View style={{ flex: 1 - fraction }} />
      </View>
      <View
        style={{
          height: HEIGHT,
          flexDirection: 'row',
          alignItems: 'center',
          paddingLeft: spacing.md,
          paddingRight: spacing.sm,
          gap: spacing.md,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            // A synced message often carries its speaker inside the title
            // and nothing in `speaker`: the label then names the title alone
            // rather than reading a dangling comma.
            item.artist === ''
              ? t('watch:nowPlayingOpenTitle', { title: item.title })
              : t('watch:nowPlayingOpen', {
                  title: item.title,
                  artist: item.artist,
                })
          }
          onPress={() => {
            router.push(`/sermon/${item.sermonId}`);
          }}
          style={({ pressed }) => ({
            flex: 1,
            minWidth: 0,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <View
            style={{
              width: ART,
              height: ART,
              borderRadius: 10, // the frame's `.npart`
              overflow: 'hidden',
              backgroundColor: media.artFrom,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {item.artworkUrl !== null ? (
              <Image
                source={{ uri: item.artworkUrl }}
                style={{ width: ART, height: ART }}
                contentFit="cover"
                accessibilityIgnoresInvertColors
              />
            ) : (
              <AudioIcon size={18} color={palette.gold} />
            )}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              numberOfLines={1}
              // Control text: it caps at 1.3x and stays one line, so the bar
              // never grows (docs/spec/05).
              maxFontSizeMultiplier={1.3}
              style={{
                fontFamily: fontFamily.body.bold,
                fontSize: 13.5,
                color: colors.text,
              }}
            >
              {item.title}
            </Text>
            {item.artist === '' ? null : (
              <Text
                numberOfLines={1}
                maxFontSizeMultiplier={1.3}
                style={{
                  fontFamily: fontFamily.body.regular,
                  fontSize: 11.5,
                  color: colors.muted,
                  marginTop: 1,
                }}
              >
                {item.artist}
              </Text>
            )}
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            status.playing ? t('watch:pause') : t('watch:play')
          }
          onPress={nowPlaying.toggle}
          hitSlop={4}
          style={({ pressed }) => ({
            width: CONTROL,
            height: CONTROL,
            borderRadius: radius.full,
            backgroundColor: palette.gold,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.85 : 1,
          })}
        >
          {status.playing ? (
            <PauseIcon
              size={18}
              color={palette.navy}
              fill={palette.navy}
              stroke="none"
            />
          ) : (
            <PlayIcon
              size={18}
              color={palette.navy}
              fill={palette.navy}
              stroke="none"
            />
          )}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('watch:stopListening')}
          onPress={nowPlaying.stop}
          hitSlop={4}
          style={({ pressed }) => ({
            width: CONTROL,
            height: CONTROL,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <CloseIcon size={18} color={colors.muted} />
        </Pressable>
      </View>
    </View>
  );
}
