import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { spacing } from '@agbc/shared/theme';

import { EmptyState } from '@/components/ui';
import { track } from '@/lib/analytics';

import { SKIP_SEC } from './audio';
import { AudioTransport } from './AudioTransport';
import type { SermonSummary } from './queries';
import { SermonArtwork } from './SermonArtwork';
import { SermonMeta } from './SermonMeta';
import { useSermonAudio } from './useSermonAudio';

// Audio mode (the two W3.1 frames): artwork, the same three meta lines the video
// state draws, then the scrub and transport that belong to audio alone.
//
// A component rather than a branch inside the screen, because the engine is a
// hook and hooks cannot be conditional: mounting THIS is what starts playback,
// and unmounting it is what releases the player.

export interface AudioModeProps {
  sermon: SermonSummary;
  signedUrl: string;
  eyebrow: string;
  meta: string;
  startAtSec: number;
  isMember: boolean;
  artHeight: number;
  onRemint: () => void;
}

export function AudioMode({
  sermon,
  signedUrl,
  eyebrow,
  meta,
  startAtSec,
  isMember,
  artHeight,
  onRemint,
}: AudioModeProps) {
  const { t } = useTranslation();
  const audio = useSermonAudio({
    sermonId: sermon.id,
    signedUrl,
    title: sermon.title,
    artist: sermon.speaker,
    // The lock screen gets exactly what the artwork above shows, and nothing
    // when there is nothing: a message that was never on YouTube has no
    // thumbnail, and expo-audio simply omits the art rather than drawing a hole.
    artworkUrl: sermon.thumbnail_url === '' ? null : sermon.thumbnail_url,
    startAtSec,
    isMember,
    onRemint,
  });

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
    if (!audio.playing || reported.current) return;
    reported.current = true;
    track(startAtSec > 0 ? 'sermon_resumed' : 'sermon_played', {
      mode: 'audio',
    });
  }, [audio.playing, startAtSec]);

  if (audio.failed) {
    return (
      <View>
        <EmptyState
          title={t('watch:audioErrorTitle')}
          body={t('watch:audioErrorBody')}
          actionLabel={t('errors:tryAgain')}
          onAction={audio.retry}
        />
      </View>
    );
  }

  return (
    <View>
      <SermonArtwork
        thumbnailUrl={sermon.thumbnail_url === '' ? null : sermon.thumbnail_url}
        // Three states, not two, since audio stopped autoplaying: the pill said
        // "Listening" over a message sitting silently at 0:00, which is the kind
        // of small lie that teaches people to distrust the rest of the screen.
        label={
          audio.busy
            ? t('watch:audioLoading')
            : audio.playing
              ? t('watch:listening')
              : t('watch:paused')
        }
        height={artHeight}
      />
      <SermonMeta eyebrow={eyebrow} title={sermon.title} meta={meta} />
      <View style={{ marginTop: spacing.lg }}>
        <AudioTransport
          playing={audio.playing}
          currentSec={audio.currentSec}
          durationSec={audio.durationSec}
          skipSec={SKIP_SEC}
          onToggle={audio.toggle}
          onSkip={audio.skip}
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
