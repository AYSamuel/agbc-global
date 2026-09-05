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
import YoutubePlayer, {
  type YoutubeIframeRef,
} from 'react-native-youtube-iframe';

import {
  fontFamily,
  icon,
  palette,
  radius,
  spacing,
  tonal,
  typeScale,
} from '@agbc/shared/theme';

import {
  AppHeader,
  BookmarkIcon,
  Button,
  CircleIconButton,
  EmptyState,
  GateSheet,
  HeadphonesIcon,
  InfoIcon,
  NoteBanner,
  NotesIcon,
  Screen,
  SegmentedControl,
  ShareIcon,
  Skeleton,
  SpeedIcon,
  VideoIcon,
  useToast,
} from '@/components/ui';
import { PlayerAction, PlayerActions } from '@/features/watch/PlayerAction';
import { YouTubeCredit } from '@/features/watch/YouTubeCredit';
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
import { useLandscapeAllowed } from '@/features/watch/useLandscapeAllowed';
import {
  saveServerPosition,
  useServerPositionQuery,
} from '@/features/watch/serverPosition';
import {
  queueSave,
  useSavedQuery,
  useSavedState,
} from '@/features/watch/saved';
import { useFormattingLocale } from '@/i18n';
import { useSermonQuery, type SermonSummary } from '@/features/watch/queries';
import { track } from '@/lib/analytics';
import { useAuthStore } from '@/state/auth';
import { useGateStore } from '@/state/gate';
import { useTheme } from '@/theme';
import { useOpenExternal } from '@/lib/openExternal';

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

// SERMON player (docs/spec/08). Video via the pinned iframe with "Open on
// YouTube" as the tested fallback, audio via the private bucket's signed URL
// (W3.1 slice 3), and the resume that follows a member between the two. Guest
// playback is free; notes gate. Rot state per 08.
export default function Sermon() {
  // `05`: the player supports landscape on all devices, while the app itself
  // stays portrait. The lock is lifted for this screen only and put back on the
  // way out (see the hook; it no-ops on a dev client built before the native
  // module was linked).
  useLandscapeAllowed();

  const router = useRouter();
  const { t } = useTranslation();
  const openLink = useOpenExternal();
  const locale = useFormattingLocale();
  const { colors } = useTheme();
  const toast = useToast();
  const { width } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const query = useSermonQuery(id);
  const [playerError, setPlayerError] = useState(false);
  const [playerKey, setPlayerKey] = useState(0);
  // Which gate is up: Save and Notes gate separately because each names its own
  // action (docs/spec/03: "Sign in to save this message" vs "... to take notes").
  const [gate, setGate] = useState<'save' | 'notes' | null>(null);
  const [audioRequested, setAudioRequested] = useState(false);

  const sermon = query.data ?? null;
  const isMember = useAuthStore((s) => s.status === 'member');
  // The bookmark's state: the queued wish when there is one, the server's
  // answer otherwise (features/watch/saved.ts). Guests never fetch: the
  // bookmark is an invitation for them, not a fact.
  const savedQuery = useSavedQuery(id, isMember);
  const saved = useSavedState(id, savedQuery.data ?? false) && isMember;
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
        // The frame's `.pl-top .lbl`, not `.chead`: the message's own title is the
        // heading on this screen (W3.1 slice 4, after the frame diff caught it).
        titleStyle="eyebrow"
        backLabel={t('back')}
        onBack={() => {
          router.back();
        }}
        trailing={
          sermon ? (
            // The frame's `.ibs`: Save then Share, 8px apart. The bookmark is
            // the same glyph MY-LIST's rows carry, filled when saved
            // (`.ib.on`: gold on the 20% gold wash).
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <CircleIconButton
                accessibilityLabel={saved ? t('watch:saved') : t('watch:save')}
                backgroundColor={saved ? tonal.gold.bg : colors.alt}
                icon={
                  <BookmarkIcon
                    size={icon.lg}
                    color={saved ? palette.gold : colors.text}
                    fill={saved ? palette.gold : 'none'}
                  />
                }
                onPress={() => {
                  if (!isMember) {
                    track('gate_shown', { action_type: 'save_sermon' });
                    setGate('save');
                    return;
                  }
                  queueSave(id, !saved);
                }}
              />
              <CircleIconButton
                accessibilityLabel={t('watch:share')}
                backgroundColor={colors.alt}
                icon={<ShareIcon size={icon.lg} color={colors.text} />}
                onPress={() => {
                  share(sermon);
                }}
              />
            </View>
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

            {/* Mockup `.pl-seg` + `.pl-acts` (direction A, chosen with Ayo on
                2026-08-14). The row of three tiles that stood here dressed a
                MODE, a VALUE and a DESTINATION identically, and its dimmed
                member read as broken rather than unavailable. Mode is now a
                segmented control that says what it is; the other two are quiet
                actions under it. */}
            <View style={{ marginTop: spacing.x2l }}>
              <SegmentedControl
                accessibilityLabel={t('watch:playbackMode')}
                value={audioMode ? 'audio' : 'video'}
                segments={[
                  {
                    key: 'video',
                    label: t('watch:video'),
                    icon: (color) => <VideoIcon size={icon.md} color={color} />,
                    // A message that was never on YouTube, or one whose video
                    // the sync has lost: the half that exists is the audio.
                    unavailable: noVideo,
                    hint: noVideo ? t('watch:audioIsTheMessage') : undefined,
                  },
                  {
                    key: 'audio',
                    label: t('watch:audio'),
                    icon: (color) => (
                      <HeadphonesIcon size={icon.md} color={color} />
                    ),
                    unavailable: audioPath === null,
                    hint:
                      audioPath === null ? t('watch:audioMissing') : undefined,
                  },
                ]}
                onChange={(key) => {
                  setAudioRequested(key === 'audio');
                }}
                onUnavailable={(key) => {
                  toast.show(
                    key === 'video'
                      ? t('watch:audioIsTheMessage')
                      : t('watch:audioMissing'),
                  );
                }}
              />
              <PlayerActions>
                {/* Speed is ABSENT with the embed up, not dimmed: there is no
                    rate to change while YouTube owns playback, and the segment
                    immediately above is the answer to "why". */}
                {audioMode ? (
                  <PlayerAction
                    label={t('watch:speed')}
                    value={t('watch:speedValue', {
                      value: formatSpeedValue(speed, locale),
                    })}
                    glyph={(color) => (
                      <SpeedIcon size={icon.md} color={color} />
                    )}
                    onPress={() => {
                      setSpeed(nextSpeed(speed));
                    }}
                  />
                ) : null}
                <PlayerAction
                  label={t('watch:notes')}
                  glyph={(color) => <NotesIcon size={icon.md} color={color} />}
                  // A member goes straight to the page; a guest meets the gate,
                  // and the gate-return opens the same page after sign-in.
                  // Navigating is also what pauses the message (the slice 3
                  // blur rule), which is why SERMON-NOTES can name one second.
                  onPress={() => {
                    if (isMember) {
                      router.push({
                        pathname: '/sermon/notes/[id]',
                        params: { id },
                      });
                      return;
                    }
                    track('gate_shown', { action_type: 'sermon_notes' });
                    setGate('notes');
                  }}
                />
              </PlayerActions>
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
              // A text link, not the outline button it used to be (W3.1 slice
              // 4): on a screen whose subject is the video, a full-width button
              // was the heaviest thing on it while being the way OUT of the app.
              <Pressable
                accessibilityRole="link"
                onPress={() => {
                  openLink(youtubeUrl(sermon.youtube_id ?? ''));
                }}
                style={({ pressed }) => ({
                  marginTop: spacing.lg,
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <Text
                  style={{
                    fontFamily: fontFamily.body.bold,
                    fontSize: 13.5,
                    color: colors.blue,
                    textAlign: 'center',
                  }}
                >
                  {t('watch:openOnYoutube')}
                </Text>
              </Pressable>
            ) : null}

            {/* YouTube attribution (ToS box, docs/spec/08). AUDIO mode only,
                decided with Ayo 2026-08-14: there the thumbnail and title are
                shown bare, with no YouTube chrome anywhere on the screen, so
                this line is the only thing crediting them. The video state
                needs no line because the embed carries YouTube's own logo and
                its "Watch on YouTube" control, which is the attribution. A
                message that was never on YouTube borrows nothing either way. */}
            {audioMode && sermon.youtube_id !== null ? (
              <View style={{ marginBottom: spacing.md }}>
                <YouTubeCredit
                  label={t('watch:watchOnYoutube')}
                  onPress={() => {
                    openLink(youtubeUrl(sermon.youtube_id ?? ''));
                  }}
                />
              </View>
            ) : (
              <View style={{ height: spacing.md }} />
            )}
          </>
        )}
      </View>

      {/* Two sheets rather than one with swapped copy, so the words never
          flicker mid-dismissal: each stays mounted with its own text and only
          `visible` moves. */}
      <GateSheet
        visible={gate === 'notes'}
        title={t('watch:notesGateTitle')}
        body={t('watch:notesGateBody')}
        signInLabel={t('common:signIn')}
        dismissLabel={t('common:notNow')}
        dismissAnnouncement={t('watch:gateDismissed')}
        onSignIn={() => {
          // Gate-return (W2.2): the executor opens SERMON-NOTES after sign-in.
          useGateStore
            .getState()
            .beginGateSignIn({ kind: 'sermon_notes', sermonId: id });
          setGate(null);
          router.push('/auth');
        }}
        onDismiss={() => {
          useGateStore.getState().dismissGate('sermon_notes');
          setGate(null);
        }}
      />
      <GateSheet
        visible={gate === 'save'}
        title={t('watch:saveGateTitle')}
        body={t('watch:saveGateBody')}
        signInLabel={t('common:signIn')}
        dismissLabel={t('common:notNow')}
        dismissAnnouncement={t('watch:gateDismissed')}
        onSignIn={() => {
          // Gate-return: the executor queues the save, so the member lands
          // back on this screen with the bookmark already filled.
          useGateStore
            .getState()
            .beginGateSignIn({ kind: 'save_sermon', sermonId: id });
          setGate(null);
          router.push('/auth');
        }}
        onDismiss={() => {
          useGateStore.getState().dismissGate('save_sermon');
          setGate(null);
        }}
      />
    </Screen>
  );
}
