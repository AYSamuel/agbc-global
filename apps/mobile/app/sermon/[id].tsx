import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AppState,
  Pressable,
  Share,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import YoutubePlayer, {
  type YoutubeIframeRef,
} from 'react-native-youtube-iframe';

import {
  fontFamily,
  icon,
  radius,
  spacing,
  tonal,
  typeScale,
} from '@agbc/shared/theme';

import {
  AppHeader,
  Button,
  EmptyState,
  GateSheet,
  HeadphonesIcon,
  InfoIcon,
  NoteBanner,
  NotesIcon,
  Screen,
  ShareIcon,
  Skeleton,
  SpeedIcon,
  useToast,
} from '@/components/ui';
import { AudioMode } from '@/features/watch/AudioMode';
import {
  formatSpeedValue,
  nextSpeed,
  preferredPosition,
} from '@/features/watch/audio';
import { useSermonAudioUrlQuery } from '@/features/watch/audioSource';
import {
  durationMinutes,
  formatPublishedDate,
  joinMeta,
} from '@/features/watch/format';
import {
  resumeTarget,
  shouldSave,
  usePlaybackStore,
} from '@/features/watch/playback';
import { SermonMeta } from '@/features/watch/SermonMeta';
import {
  saveServerPosition,
  useServerPositionQuery,
} from '@/features/watch/serverPosition';
import { useFormattingLocale } from '@/i18n';
import { useSermonQuery, type SermonSummary } from '@/features/watch/queries';
import { track } from '@/lib/analytics';
import { useAuthStore } from '@/state/auth';
import { useGateStore } from '@/state/gate';
import { useTheme } from '@/theme';

function youtubeUrl(youtubeId: string): string {
  return `https://www.youtube.com/watch?v=${youtubeId}`;
}

// The embed plus its resume wiring (decision 2026-07-20, docs/spec/08).
// Its own component so the start position is computed exactly once, when the
// video mounts and the duration is known.
function SermonVideo({
  sermon,
  youtubeId,
  width,
  height,
  startAtSec,
  isMember,
  onError,
}: {
  sermon: SermonSummary;
  youtubeId: string;
  width: number;
  height: number;
  startAtSec: number;
  isMember: boolean;
  onError: () => void;
}) {
  const playerRef = useRef<YoutubeIframeRef>(null);
  const savePosition = usePlaybackStore((s) => s.save);
  const clearPosition = usePlaybackStore((s) => s.clear);
  // Read once on mount, so a save mid-session can never re-seek the player
  // mid-playback. The DECISION now lives on the screen, which is the only place
  // that can see both stored positions (W3.1).
  const [startAt] = useState(() => startAtSec);
  // A latch, because the iframe reports 'playing' again after every pause and
  // buffer: only the first transition of this mount is the member starting the
  // sermon. `startAt` (already the resume decision) says which event it is.
  const playReportedRef = useRef(false);

  const capturePosition = useCallback(async () => {
    try {
      const current = await playerRef.current?.getCurrentTime();
      if (typeof current === 'number' && shouldSave(current)) {
        savePosition(sermon.id, current);
        // The position is per member and message, not per mode (W3.1): watch
        // half on the tablet, finish it in the car on audio. One row, both.
        if (isMember) void saveServerPosition(sermon.id, current);
      }
    } catch {
      // The webview can be torn down mid-call: losing one sample is fine.
    }
  }, [isMember, sermon.id, savePosition]);

  // Save when the app backgrounds (the phone-call case), on a ~10s cadence
  // while open (docs/spec/08: survives the app being killed), and on exit.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') void capturePosition();
    });
    const ticker = setInterval(() => {
      void capturePosition();
    }, 10_000);
    return () => {
      void capturePosition();
      clearInterval(ticker);
      subscription.remove();
    };
  }, [capturePosition]);

  return (
    <YoutubePlayer
      ref={playerRef}
      width={width}
      height={height}
      videoId={youtubeId}
      initialPlayerParams={{ start: startAt }}
      onChangeState={(state: string) => {
        if (state === 'playing' && !playReportedRef.current) {
          playReportedRef.current = true;
          track(startAt > 0 ? 'sermon_resumed' : 'sermon_played', {
            mode: 'video',
          });
        }
        // Sample on every transition (pause, buffer, end) so a position exists
        // even when playback stops without the screen unmounting.
        if (state === 'ended') {
          clearPosition(sermon.id);
        } else {
          void capturePosition();
        }
      }}
      onError={onError}
    />
  );
}

type TileState = 'idle' | 'on' | 'off';

// Mockup `.pl-tiles` / `.pl-tile` with the two states W3.1 added: `on` for a mode
// the member turned on (the same tinted gold `.glory.on` uses for a commitment
// already made), `off` for a control that exists but has nothing to act on yet.
// `off` still takes a tap: a dimmed tile that does nothing when pressed teaches
// nothing, so each one answers with the reason it is dim.
function PlayerTile({
  label,
  value,
  hint,
  state,
  glyph,
  onPress,
}: {
  label: string;
  value?: string;
  /** Why a dimmed tile is dimmed. Spoken on focus, so a screen-reader user
   * learns the condition BEFORE activating rather than from the toast after. */
  hint?: string;
  state: TileState;
  glyph: (color: string) => React.ReactNode;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={value === undefined ? label : `${label}, ${value}`}
      accessibilityHint={hint}
      // Deliberately NOT `disabled`. 08 asks the unavailable toggle to carry a
      // tooltip, and a control that announces itself disabled while it still
      // answers a tap is telling assistive tech something untrue. Dimmed, with
      // the reason on focus and on press.
      accessibilityState={{ selected: state === 'on' }}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        alignItems: 'center',
        // The row stretches all three tiles to the tallest, and Speed is three
        // lines deep (icon, label, value) where the other two are two, so
        // without this their contents sit at the top of a taller box and read
        // as unseated.
        justifyContent: 'center',
        gap: 7,
        backgroundColor: state === 'on' ? tonal.gold.bg : colors.alt,
        borderWidth: 1,
        borderColor: state === 'on' ? tonal.gold.border : colors.cardline,
        borderRadius: radius.button,
        paddingVertical: 14,
        paddingHorizontal: spacing.xs,
        opacity: state === 'off' ? 0.45 : pressed ? 0.85 : 1,
      })}
    >
      {glyph(colors.text)}
      <Text
        maxFontSizeMultiplier={1.3}
        style={{
          fontFamily: fontFamily.body.bold,
          fontSize: 11.5,
          color: colors.text,
          textAlign: 'center',
        }}
      >
        {label}
      </Text>
      {/* The value line is rendered by EVERY tile, blank where there is nothing
          to say. Only Speed carries a value, and a row of three stretches to
          its tallest member either way, so without the reserved line the other
          two centred their contents against a different number of lines and the
          icons sat at two different heights across one row. A blank line costs
          no space that the row was not already spending. */}
      <Text
        accessibilityElementsHidden={value === undefined}
        importantForAccessibility={value === undefined ? 'no' : 'auto'}
        maxFontSizeMultiplier={1.3}
        numberOfLines={1}
        style={{
          fontFamily: fontFamily.body.bold,
          fontSize: 11,
          color: colors.eye,
        }}
      >
        {value ?? ' '}
      </Text>
    </Pressable>
  );
}

// SERMON player (docs/spec/08). Video via the pinned iframe with "Open on
// YouTube" as the tested fallback, audio via the private bucket's signed URL
// (W3.1 slice 3), and the resume that follows a member between the two. Guest
// playback is free; notes gate. Rot state per 08.
export default function Sermon() {
  const router = useRouter();
  const { t } = useTranslation();
  const locale = useFormattingLocale();
  const { colors } = useTheme();
  const toast = useToast();
  const { width } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useSermonQuery(id);
  const [playerError, setPlayerError] = useState(false);
  const [playerKey, setPlayerKey] = useState(0);
  const [gateVisible, setGateVisible] = useState(false);
  const [audioRequested, setAudioRequested] = useState(false);

  const sermon = query.data ?? null;
  const isMember = useAuthStore((s) => s.status === 'member');
  const localEntry = usePlaybackStore((s) => s.positions[id]);
  const speed = usePlaybackStore((s) => s.speed);
  const setSpeed = usePlaybackStore((s) => s.setSpeed);

  const audioPath = sermon?.audio_path ?? null;
  const audioUrlQuery = useSermonAudioUrlQuery(id, audioPath);
  const serverPositionQuery = useServerPositionQuery(id, isMember);

  // Two ways to arrive with no video to go back to: a message that was never on
  // YouTube (docs/spec/08: a row with only `audio_path`), and one whose video the
  // sync has since marked gone, where 08 asks the player to fall back to the
  // self-hosted audio. Either way audio is not a mode the member chose, so the
  // toggle stops being a toggle and says why.
  const noVideo =
    sermon !== null &&
    (sermon.youtube_id === null || sermon.status === 'unavailable');
  const audioMode = audioPath !== null && (audioRequested || noVideo);

  // Screen gutter (20) each side, capped like the mockup player column.
  const videoWidth = Math.min(width - spacing.gutter * 2, 640);
  const videoHeight = Math.round((videoWidth * 9) / 16);
  // The frame draws the artwork at 16/10, not the embed's 16/9.
  const artHeight = Math.round((videoWidth * 10) / 16);

  // The resume decision, made in the one place that can see both layers. Guests
  // never wait on it; members wait for the row so the seek happens once.
  const positionReady = !isMember || !serverPositionQuery.isPending;
  const startAtSec =
    resumeTarget(
      preferredPosition(localEntry, serverPositionQuery.data ?? undefined),
      sermon?.duration_sec ?? null,
    ) ?? 0;

  const share = (s: SermonSummary) => {
    void Share.share({
      message: s.youtube_id
        ? `${s.title}\n${youtubeUrl(s.youtube_id)}`
        : s.title,
    });
  };

  const eyebrow =
    sermon === null
      ? ''
      : (sermon.series ?? formatPublishedDate(sermon.published_at, locale));
  const meta =
    sermon === null
      ? ''
      : joinMeta([
          sermon.speaker || null,
          durationMinutes(sermon.duration_sec) === null
            ? null
            : t('watch:minutes', {
                count: durationMinutes(sermon.duration_sec) ?? 0,
              }),
        ]);

  // Keyed on `refetch` (bound once by the query observer, stable) and never on
  // the result object, whose identity moves with every fetch-state change. The
  // engine's error effect keys on this callback, and the status it reads stays
  // the OLD player's until the new one reports, so an identity change while the
  // re-mint is in flight would count the one silent retry as spent and put the
  // failure screen over a source that is about to play.
  const { refetch: refetchAudioUrl } = audioUrlQuery;
  const remintAudioUrl = useCallback(() => {
    void refetchAudioUrl();
  }, [refetchAudioUrl]);

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
              <ShareIcon size={icon.lg} color={colors.text} />
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
        ) : sermon.status === 'unavailable' && sermon.audio_path === null ? (
          // Sermon rot (08): never a dead end. With audio still on the shelf the
          // message is playable, so the rot copy only stands when it is not.
          <EmptyState
            title={t('watch:rotTitle')}
            body={t('watch:rotBody')}
            actionLabel={t('watch:backToWatch')}
            onAction={() => {
              router.back();
            }}
          />
        ) : (
          <>
            {sermon.status === 'unavailable' ? (
              // The other half of 08's rot rule: the video is gone but the audio
              // survived, so say what happened and keep playing rather than
              // showing a dead end over a message that still works.
              <View style={{ marginBottom: spacing.lg }}>
                <NoteBanner
                  tone="gold"
                  icon={(accent) => <InfoIcon size={icon.lg} color={accent} />}
                  lead={t('watch:rotTitle')}
                  body={t('watch:rotBodyAudio')}
                />
              </View>
            ) : null}
            {audioMode ? (
              audioUrlQuery.isError ? (
                <EmptyState
                  title={t('watch:audioErrorTitle')}
                  body={t('watch:audioErrorBody')}
                  actionLabel={t('errors:tryAgain')}
                  onAction={remintAudioUrl}
                />
              ) : audioUrlQuery.data === undefined || !positionReady ? (
                <View style={{ gap: spacing.lg }}>
                  <Skeleton height={artHeight} />
                  <Skeleton height={22} width="70%" />
                  <Skeleton height={13} width="40%" />
                </View>
              ) : (
                <AudioMode
                  sermon={sermon}
                  signedUrl={audioUrlQuery.data}
                  eyebrow={eyebrow}
                  meta={meta}
                  startAtSec={startAtSec}
                  isMember={isMember}
                  artHeight={artHeight}
                  onRemint={remintAudioUrl}
                />
              )
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
                    // Neither a video nor an audio: broken data rather than a
                    // state anyone designed, and still not a dead end.
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
                  ) : !positionReady ? (
                    // The embed seeks once, at mount, so it does not mount until
                    // the resume decision is in.
                    <Skeleton height={videoHeight} />
                  ) : (
                    <SermonVideo
                      key={playerKey}
                      sermon={sermon}
                      youtubeId={sermon.youtube_id}
                      width={videoWidth}
                      height={videoHeight}
                      startAtSec={startAtSec}
                      isMember={isMember}
                      onError={() => {
                        setPlayerError(true);
                      }}
                    />
                  )}
                </View>
                <SermonMeta
                  eyebrow={eyebrow}
                  title={sermon.title}
                  meta={meta}
                />
              </>
            )}

            {/* Mockup .pl-tiles. Speed took Download's slot at W3.1: 08 never
                specified a download, and speed had no home in any frame. */}
            <View
              style={{
                flexDirection: 'row',
                gap: spacing.sm + 2,
                marginTop: spacing.x2l,
              }}
            >
              <PlayerTile
                label={t('watch:audioOnly')}
                hint={
                  audioPath === null
                    ? t('watch:audioMissing')
                    : noVideo
                      ? t('watch:audioIsTheMessage')
                      : undefined
                }
                state={audioPath === null ? 'off' : audioMode ? 'on' : 'idle'}
                glyph={(color) => (
                  <HeadphonesIcon size={icon.xl} color={color} />
                )}
                onPress={() => {
                  if (audioPath === null) {
                    toast.show(t('watch:audioMissing'));
                    return;
                  }
                  if (noVideo) {
                    toast.show(t('watch:audioIsTheMessage'));
                    return;
                  }
                  setAudioRequested((on) => !on);
                }}
              />
              <PlayerTile
                label={t('watch:speed')}
                value={t('watch:speedValue', {
                  value: formatSpeedValue(speed, locale),
                })}
                hint={audioMode ? undefined : t('watch:speedNeedsAudio')}
                state={audioMode ? 'idle' : 'off'}
                glyph={(color) => <SpeedIcon size={icon.xl} color={color} />}
                onPress={() => {
                  if (!audioMode) {
                    toast.show(t('watch:speedNeedsAudio'));
                    return;
                  }
                  setSpeed(nextSpeed(speed));
                }}
              />
              <PlayerTile
                label={t('watch:notes')}
                state="idle"
                glyph={(color) => <NotesIcon size={icon.xl} color={color} />}
                // Notes are a member feature: open the gate (W2.2 wires
                // gate-return so the note composer opens after sign-in).
                onPress={() => {
                  track('gate_shown', { action_type: 'sermon_notes' });
                  setGateVisible(true);
                }}
              />
            </View>

            {audioMode ? (
              <Text
                style={{
                  fontFamily: fontFamily.body.regular,
                  fontSize: 12,
                  color: colors.muted,
                  textAlign: 'center',
                  marginTop: spacing.lg,
                }}
              >
                {t('watch:backgroundNote')}
              </Text>
            ) : sermon.youtube_id !== null ? (
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

            {/* Visible YouTube attribution (ToS box, docs/spec/08), and only
                where something on screen actually came from YouTube: a message
                that was never on it borrows nothing to attribute. */}
            {sermon.youtube_id !== null ? (
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
                {audioMode
                  ? t('watch:artworkViaYoutube')
                  : t('watch:viaYoutube')}
              </Text>
            ) : (
              <View style={{ height: spacing.md }} />
            )}
          </>
        )}
      </View>

      <GateSheet
        visible={gateVisible}
        title={t('watch:notesGateTitle')}
        body={t('watch:notesGateBody')}
        signInLabel={t('common:signIn')}
        dismissLabel={t('common:notNow')}
        dismissAnnouncement={t('watch:gateDismissed')}
        onSignIn={() => {
          // Gate-return (W2.2): the notes executor itself lands at W3.1 slice 4.
          useGateStore
            .getState()
            .beginGateSignIn({ kind: 'sermon_notes', sermonId: id });
          setGateVisible(false);
          router.push('/auth');
        }}
        onDismiss={() => {
          useGateStore.getState().dismissGate('sermon_notes');
          setGateVisible(false);
        }}
      />
    </Screen>
  );
}
