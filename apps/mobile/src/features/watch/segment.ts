import { create } from 'zustand';

import type { SermonSummary } from './queries';

/**
 * WATCH's Video / Audio segment (W4.9 slice 4, frames `Watch · guest · Video
 * segment`, `WATCH · Audio` and `WATCH · Audio · nothing recorded yet`).
 *
 * Until this, an audio-only message had no home on the tab: it was the hero
 * while it was newest and then nothing, because the rails are the channel's
 * tabs and a message that was never on YouTube belongs to neither. The segment
 * is the home. Its rule is a filter on the query Watch already holds, so there
 * is no new read and no new backend: `isAudioOnly` is the whole of it, and the
 * Video half is everything else.
 *
 * The chosen segment lives for the SESSION in this store, not in the URL and
 * not on disk (decided in the plan): moving between tabs keeps it, a relaunch
 * starts on Video, and Home's "Watch" button lands on Video as it always has
 * (it resets the store on the way). Deep links from notifications go to a
 * sermon, never to the tab, so they are unaffected.
 */
export type WatchSegment = 'video' | 'audio';

/** A message recorded by the church and never on YouTube: `08`'s audio-only row. */
export function isAudioOnly(
  sermon: Pick<SermonSummary, 'youtube_id' | 'audio_path'>,
): boolean {
  return sermon.youtube_id === null && sermon.audio_path !== null;
}

/**
 * The tab's three shelves from one feed, newest first as the feed is. `videos`
 * and `liveReplays` are the channel tabs, minus the audio-only rows that used
 * to leak into `videos` through their default `kind`; `audio` is the Audio
 * segment. A row with neither a video nor audio (the sync marked its video
 * unavailable and no MP3 was ever uploaded) is not in the feed at all: the
 * query already asks for `status = 'available'`.
 */
export function splitBySegment(sermons: readonly SermonSummary[]): {
  videos: SermonSummary[];
  liveReplays: SermonSummary[];
  audio: SermonSummary[];
} {
  const videos: SermonSummary[] = [];
  const liveReplays: SermonSummary[] = [];
  const audio: SermonSummary[] = [];
  for (const sermon of sermons) {
    if (isAudioOnly(sermon)) audio.push(sermon);
    else if (sermon.kind === 'live_replay') liveReplays.push(sermon);
    else videos.push(sermon);
  }
  return { videos, liveReplays, audio };
}

interface WatchSegmentState {
  segment: WatchSegment;
  setSegment: (segment: WatchSegment) => void;
}

export const useWatchSegmentStore = create<WatchSegmentState>()((set) => ({
  segment: 'video',
  setSegment: (segment) => {
    set({ segment });
  },
}));

/** Home's "Watch" buttons land on Video as they always have, whatever was chosen. */
export function landOnVideo(): void {
  useWatchSegmentStore.getState().setSegment('video');
}
