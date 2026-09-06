import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { spacing } from '@agbc/shared/theme';

import { EmptyState } from '@/components/ui';
import { track } from '@/lib/analytics';

import { sermonArtworkUrl } from './artwork';
import { SKIP_SEC } from './audio';
import { AudioTransport } from './AudioTransport';
import { useNowPlaying } from './nowPlaying';
import type { SermonSummary } from './queries';
import { SermonArtwork } from './SermonArtwork';
import { SermonMeta } from './SermonMeta';

// Audio mode (the two W3.1 frames): artwork, the same three meta lines the video
// state draws, then the scrub and transport that belong to audio alone.
//
// Since W4.9 slice 3 this is a VIEW of the app's one player, not its owner:
// mounting it loads the message into `NowPlayingProvider` (which keeps playing
// after this unmounts, with `NowPlayingBar` as the way back), and everything it
// draws comes from that provider. Loading the same message again is a no-op
// there, so opening the player from the bar never restarts anything.

export interface AudioModeProps {
  sermon: SermonSummary;
  signedUrl: string;
  eyebrow: string;
  meta: string;
  startAtSec: number;
  artHeight: number;
  /** A finger is on the seek bar; the screen stops scrolling while it is. */
  onScrubbing?: (active: boolean) => void;
}

export function AudioMode({
  sermon,
  signedUrl,
  eyebrow,
  meta,
  startAtSec,
  artHeight,
  onScrubbing,
}: AudioModeProps) {
  const { t } = useTranslation();
  const nowPlaying = useNowPlaying();
  // Resolved once and handed to both consumers, so the lock screen and the screen
  // cannot disagree about which picture this message has (W3.1 slice 5). Its own
  // artwork wins over the YouTube thumbnail; null means neither, and expo-audio
  // simply omits the art rather than drawing a hole.
  const artwork = sermonArtworkUrl(sermon);
  const audioPath = sermon.audio_path;

  useEffect(() => {
    if (audioPath === null) return;
    nowPlaying.load(
      {
        sermonId: sermon.id,
        title: sermon.title,
        artist: sermon.speaker,
        artworkUrl: artwork,
        audioPath,
        signedUrl,
      },
      { startAtSec },
    );
    // `load` is stable, and the facts after the first load flow through
    // `refreshMetadata` below rather than through a reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sermon.id, audioPath, signedUrl]);

  // The message's facts changed under a listener (a title corrected on the
  // dashboard, a picture added): the lock screen follows, in place.
  const { refreshMetadata } = nowPlaying;
  useEffect(() => {
    refreshMetadata({
      title: sermon.title,
      artist: sermon.speaker,
      artworkUrl: artwork,
    });
  }, [refreshMetadata, sermon.title, sermon.speaker, artwork]);

  const mine = nowPlaying.item?.sermonId === sermon.id;
  const status = nowPlaying.status;
  const playing = mine && status.playing;
  const busy = !mine || !status.isLoaded || status.isBuffering;

  // The same two events the video path raises, told apart by `mode` (the
  // tracking plan has carried 'audio' since W2.10).
  //
  // Raised on the first PLAY, not on mount (2026-08-15): audio no longer starts
  // by itself, so mounting this only means the member chose the mode, and
  // counting that as a play would credit the funnel with messages nobody heard.
  // A latch, like the video path's, because the player reports `playing` again
  // after every pause and every buffer.
  const reported = useRef(false);
  useEffect(() => {
    if (!playing || reported.current) return;
    reported.current = true;
    track(startAtSec > 0 ? 'sermon_resumed' : 'sermon_played', {
      mode: 'audio',
    });
  }, [playing, startAtSec]);

  if (mine && nowPlaying.failed) {
    return (
      <View>
        <EmptyState
          title={t('watch:audioErrorTitle')}
          body={t('watch:audioErrorBody')}
          actionLabel={t('errors:tryAgain')}
          onAction={nowPlaying.retry}
        />
      </View>
    );
  }

  return (
    <View>
      <SermonArtwork
        artworkUrl={artwork}
        // Three states, not two, since audio stopped autoplaying: the pill said
        // "Listening" over a message sitting silently at 0:00, which is the kind
        // of small lie that teaches people to distrust the rest of the screen.
        label={
          busy
            ? t('watch:audioLoading')
            : playing
              ? t('watch:listening')
              : t('watch:paused')
        }
        height={artHeight}
      />
      <SermonMeta eyebrow={eyebrow} title={sermon.title} meta={meta} />
      <View style={{ marginTop: spacing.lg }}>
        <AudioTransport
          playing={playing}
          currentSec={mine ? status.currentTime : 0}
          durationSec={mine ? status.duration : 0}
          skipSec={SKIP_SEC}
          onToggle={nowPlaying.toggle}
          onSkip={nowPlaying.skip}
          onSeek={nowPlaying.seekTo}
          onScrubbing={onScrubbing}
          labels={{
            play: t('watch:play'),
            pause: t('watch:pause'),
            back: t('watch:skipBack', { count: SKIP_SEC }),
            forward: t('watch:skipForward', { count: SKIP_SEC }),
            skip: t('watch:skipSeconds', { count: SKIP_SEC }),
            progress: t('watch:progress'),
          }}
        />
      </View>
    </View>
  );
}
