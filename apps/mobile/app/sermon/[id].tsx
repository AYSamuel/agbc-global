import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Pressable,
  Share,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import YoutubePlayer from 'react-native-youtube-iframe';

import { fontFamily, radius, spacing, typeScale } from '@agbc/shared/theme';

import {
  AppHeader,
  Button,
  EmptyState,
  Screen,
  ShareIcon,
  Skeleton,
  useToast,
} from '@/components/ui';
import {
  durationMinutes,
  formatPublishedDate,
  joinMeta,
} from '@/features/watch/format';
import { useSermonQuery, type SermonSummary } from '@/features/watch/queries';
import { useTheme } from '@/theme';

function youtubeUrl(youtubeId: string): string {
  return `https://www.youtube.com/watch?v=${youtubeId}`;
}

// SERMON player (docs/spec/08, W1.3 scope): YouTube playback via the pinned
// iframe with "Open on YouTube" as the tested fallback; guest playback only
// (notes gate to /auth until W2.2); audio-only/download tiles are placeholders
// until the audio slice (W3.1). Transport controls live in the embed for video;
// the custom transport row arrives with audio. Rot state per 08.
export default function Sermon() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const toast = useToast();
  const { width } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useSermonQuery(id);
  const [playerError, setPlayerError] = useState(false);
  const [playerKey, setPlayerKey] = useState(0);

  const sermon = query.data ?? null;
  // Screen gutter (20) each side, capped like the mockup player column.
  const videoWidth = Math.min(width - spacing.gutter * 2, 640);
  const videoHeight = Math.round((videoWidth * 9) / 16);

  const share = (s: SermonSummary) => {
    void Share.share({
      message: s.youtube_id
        ? `${s.title}\n${youtubeUrl(s.youtube_id)}`
        : s.title,
    });
  };

  return (
    <Screen padded={false} widthClass="capped">
      <AppHeader
        title={t('watch:nowPlaying')}
        backLabel={t('back')}
        onBack={() => {
          router.back();
        }}
        trailing={
          sermon ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('watch:share')}
              onPress={() => {
                share(sermon);
              }}
              style={({ pressed }) => ({
                width: 40,
                height: 40,
                borderRadius: radius.full,
                backgroundColor: colors.alt,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <ShareIcon size={18} color={colors.text} />
            </Pressable>
          ) : undefined
        }
      />

      <View style={{ paddingHorizontal: spacing.gutter }}>
        {query.data === undefined && !query.isError ? (
          <View style={{ gap: spacing.lg }}>
            <Skeleton height={videoHeight} />
            <Skeleton height={22} width="70%" />
            <Skeleton height={13} width="40%" />
          </View>
        ) : query.isError ? (
          <EmptyState
            title={t('errors:somethingWrong')}
            body={t('errors:couldntLoad')}
            actionLabel={t('errors:tryAgain')}
            onAction={() => {
              void query.refetch();
            }}
          />
        ) : sermon === null ? (
          <EmptyState
            title={t('watch:rotTitle')}
            body={t('watch:rotBody')}
            actionLabel={t('watch:backToWatch')}
            onAction={() => {
              router.back();
            }}
          />
        ) : sermon.status === 'unavailable' ? (
          // Sermon rot (08): never a dead end; notes/audio survive for members.
          <EmptyState
            title={t('watch:rotTitle')}
            body={
              sermon.audio_url ? t('watch:rotBodyAudio') : t('watch:rotBody')
            }
            actionLabel={t('watch:backToWatch')}
            onAction={() => {
              router.back();
            }}
          />
        ) : (
          <>
            <View
              style={{
                borderRadius: radius.cardTight,
                overflow: 'hidden',
                backgroundColor: colors.band,
                alignSelf: 'center',
                width: videoWidth,
                height: videoHeight,
              }}
            >
              {sermon.youtube_id === null ? (
                <View
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: spacing.xl,
                  }}
                >
                  <Text
                    style={[
                      typeScale.body,
                      { color: colors.bandtext, textAlign: 'center' },
                    ]}
                  >
                    {t('watch:audioOnlyPending')}
                  </Text>
                </View>
              ) : playerError ? (
                <View
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: spacing.md,
                    padding: spacing.xl,
                  }}
                >
                  <Text
                    style={[
                      typeScale.body,
                      { color: colors.bandtext, textAlign: 'center' },
                    ]}
                  >
                    {t('watch:playerError')}
                  </Text>
                  <Button
                    label={t('errors:tryAgain')}
                    variant="accent"
                    onPress={() => {
                      setPlayerError(false);
                      setPlayerKey((k) => k + 1);
                    }}
                  />
                </View>
              ) : (
                <YoutubePlayer
                  key={playerKey}
                  width={videoWidth}
                  height={videoHeight}
                  videoId={sermon.youtube_id}
                  onError={() => {
                    setPlayerError(true);
                  }}
                />
              )}
            </View>

            <Text
              style={[
                typeScale.label,
                {
                  fontSize: 11,
                  letterSpacing: 2,
                  color: colors.eye,
                  marginTop: spacing.lg,
                },
              ]}
            >
              {sermon.series ??
                formatPublishedDate(sermon.published_at, i18n.language)}
            </Text>
            <Text
              style={{
                fontFamily: fontFamily.display.extraBold,
                fontSize: 24,
                letterSpacing: -0.48,
                color: colors.text,
                marginTop: spacing.sm,
              }}
            >
              {sermon.title}
            </Text>
            <Text
              style={{
                fontFamily: fontFamily.body.regular,
                fontSize: 13.5,
                color: colors.muted,
                marginTop: 3,
              }}
            >
              {joinMeta([
                sermon.speaker || null,
                durationMinutes(sermon.duration_sec) === null
                  ? null
                  : t('watch:minutes', {
                      count: durationMinutes(sermon.duration_sec) ?? 0,
                    }),
              ])}
            </Text>

            {/* Mockup .pl-tiles: audio-only + download arrive with W3.1; notes
                gate to the auth placeholder until W2.2. */}
            <View
              style={{
                flexDirection: 'row',
                gap: spacing.sm + 2,
                marginTop: spacing.x2l,
              }}
            >
              {(
                [
                  {
                    key: 'audio',
                    label: t('watch:audioOnly'),
                    enabled: sermon.audio_url !== null,
                    onPress: () => {
                      toast.show(t('watch:comingWithAudio'));
                    },
                  },
                  {
                    key: 'download',
                    label: t('watch:download'),
                    enabled: false,
                    onPress: () => {
                      toast.show(t('watch:comingWithAudio'));
                    },
                  },
                  {
                    key: 'notes',
                    label: t('watch:notes'),
                    enabled: true,
                    onPress: () => {
                      router.push('/auth');
                    },
                  },
                ] as const
              ).map((tile) => (
                <Pressable
                  key={tile.key}
                  accessibilityRole="button"
                  accessibilityLabel={tile.label}
                  accessibilityState={{ disabled: !tile.enabled }}
                  disabled={!tile.enabled}
                  onPress={tile.onPress}
                  style={({ pressed }) => ({
                    flex: 1,
                    alignItems: 'center',
                    gap: 7,
                    backgroundColor: colors.alt,
                    borderWidth: 1,
                    borderColor: colors.cardline,
                    borderRadius: radius.button,
                    paddingVertical: 14,
                    paddingHorizontal: spacing.xs,
                    opacity: tile.enabled ? (pressed ? 0.85 : 1) : 0.45,
                  })}
                >
                  <Text
                    style={{
                      fontFamily: fontFamily.body.bold,
                      fontSize: 11.5,
                      color: colors.text,
                    }}
                  >
                    {tile.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            {sermon.youtube_id !== null ? (
              <View style={{ marginTop: spacing.lg }}>
                <Button
                  label={t('watch:openOnYoutube')}
                  variant="outline"
                  fullWidth
                  onPress={() => {
                    void WebBrowser.openBrowserAsync(
                      youtubeUrl(sermon.youtube_id ?? ''),
                    );
                  }}
                />
              </View>
            ) : null}

            {/* Visible YouTube attribution (ToS box, docs/spec/08). */}
            <Text
              style={{
                fontFamily: fontFamily.body.regular,
                fontSize: 12,
                color: colors.muted,
                textAlign: 'center',
                marginTop: spacing.lg,
                marginBottom: spacing.md,
              }}
            >
              {t('watch:viaYoutube')}
            </Text>
          </>
        )}
      </View>
    </Screen>
  );
}
