import type { SermonSummary } from '../queries';
import {
  isAudioOnly,
  landOnVideo,
  splitBySegment,
  useWatchSegmentStore,
} from '../segment';

// WATCH's Video / Audio segment (W4.9 slice 4): the filter is the whole rule,
// so it is proven here on its own before the screens that draw it.

function sermon(overrides: Partial<SermonSummary> = {}): SermonSummary {
  return {
    id: 'aaa',
    title: 'Grace That Carries You',
    speaker: 'Rev Olayinka Ademiluka',
    youtube_id: 'yt-1',
    audio_path: null,
    artwork_path: null,
    duration_sec: 2280,
    thumbnail_url: '',
    series: null,
    published_at: '2026-07-18T10:00:00Z',
    kind: 'video',
    status: 'available',
    ...overrides,
  };
}

beforeEach(() => {
  useWatchSegmentStore.setState({ segment: 'video' });
});

describe('isAudioOnly', () => {
  test('a message recorded by the church and never on YouTube', () => {
    expect(isAudioOnly({ youtube_id: null, audio_path: 'a.mp3' })).toBe(true);
  });

  test('a synced video with an MP3 beside it is still a video', () => {
    expect(isAudioOnly({ youtube_id: 'yt', audio_path: 'a.mp3' })).toBe(false);
  });

  test('a row with neither is not audio', () => {
    expect(isAudioOnly({ youtube_id: null, audio_path: null })).toBe(false);
  });
});

describe('splitBySegment', () => {
  test('audio-only rows leave the Video half, whatever kind the sync gave them', () => {
    // Audio-only rows carry the default `video` kind because they were never
    // synced; before the segment they leaked into the Video rail through it.
    const feed = [
      sermon({ id: 'a1', youtube_id: null, audio_path: 'one.mp3' }),
      sermon({ id: 'v1' }),
      sermon({ id: 'l1', kind: 'live_replay' }),
      sermon({ id: 'a2', youtube_id: null, audio_path: 'two.mp3' }),
    ];
    const split = splitBySegment(feed);
    expect(split.videos.map((s) => s.id)).toEqual(['v1']);
    expect(split.liveReplays.map((s) => s.id)).toEqual(['l1']);
    // Newest first, as the feed is: the order is kept, never re-sorted.
    expect(split.audio.map((s) => s.id)).toEqual(['a1', 'a2']);
  });

  test('an empty feed splits into three empty shelves', () => {
    expect(splitBySegment([])).toEqual({
      videos: [],
      liveReplays: [],
      audio: [],
    });
  });
});

describe('the session store', () => {
  test('starts on Video and keeps what was chosen', () => {
    expect(useWatchSegmentStore.getState().segment).toBe('video');
    useWatchSegmentStore.getState().setSegment('audio');
    expect(useWatchSegmentStore.getState().segment).toBe('audio');
  });

  test("Home's Watch button lands on Video whatever was chosen", () => {
    useWatchSegmentStore.getState().setSegment('audio');
    landOnVideo();
    expect(useWatchSegmentStore.getState().segment).toBe('video');
  });
});
