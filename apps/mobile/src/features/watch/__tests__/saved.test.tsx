import { renderHook } from '@testing-library/react-native';

import { queryClient } from '@/lib/queryPersist';
import { useWriteQueueStore } from '@/lib/writeQueue';

import type { SermonSummary } from '../queries';
import {
  applySavedToCache,
  queueSave,
  savedListQueryKey,
  savedQueryKey,
  useSavedState,
  type SavedListItem,
} from '../saved';

// The optimistic half of Save (docs/spec/08, W3.1 slice 4): the tap patches the
// bookmark and the list in one place, the wish rides the queue, and the screen
// reads pending-over-server. The handler's half lives in
// state/__tests__/writeQueueHandlers.test.ts.

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => undefined } },
      }),
    },
  },
}));

function sermon(
  id: string,
  overrides: Partial<SermonSummary> = {},
): SermonSummary {
  return {
    id,
    title: `Message ${id}`,
    speaker: 'Pastor Test',
    youtube_id: `yt-${id}`,
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

function listItem(id: string): SavedListItem {
  return { savedAt: '2026-08-01T10:00:00Z', sermon: sermon(id) };
}

beforeEach(() => {
  queryClient.clear();
  useWriteQueueStore.setState({
    queue: {},
    hydrated: true,
    handlers: null,
    draining: false,
    failures: 0,
  });
});

describe('queueSave', () => {
  test('show it, then queue it: the bookmark cache and the wish agree', () => {
    queueSave('s1', true);
    expect(queryClient.getQueryData(savedQueryKey('s1'))).toBe(true);
    expect(useWriteQueueStore.getState().queue['saved:s1']).toMatchObject({
      kind: 'saved',
      state: 'on',
    });

    queueSave('s1', false);
    expect(queryClient.getQueryData(savedQueryKey('s1'))).toBe(false);
    // The end-state model: the second tap REPLACES the wish, so an offline
    // save-then-unsave replays as one write.
    expect(useWriteQueueStore.getState().queue['saved:s1']).toMatchObject({
      state: 'off',
    });
  });

  test('an unsave removes the row from a cached MY-LIST immediately', () => {
    queryClient.setQueryData(savedListQueryKey, [
      listItem('s1'),
      listItem('s2'),
    ]);
    queueSave('s1', false);
    const list = queryClient.getQueryData<SavedListItem[]>(savedListQueryKey);
    expect(list?.map((item) => item.sermon.id)).toEqual(['s2']);
  });

  test('a save prepends to a cached MY-LIST when any cache knows the message', () => {
    // The player's own detail read is the cache that always exists at the
    // moment of a save.
    queryClient.setQueryData(['sermons', 's3'], sermon('s3'));
    queryClient.setQueryData(savedListQueryKey, [listItem('s1')]);
    queueSave('s3', true);
    const list = queryClient.getQueryData<SavedListItem[]>(savedListQueryKey);
    expect(list?.map((item) => item.sermon.id)).toEqual(['s3', 's1']);
  });

  test('a save of a message no cache has seen leaves the list to the refetch', () => {
    queryClient.setQueryData(savedListQueryKey, [listItem('s1')]);
    queueSave('unknown', true);
    const list = queryClient.getQueryData<SavedListItem[]>(savedListQueryKey);
    // The bookmark itself is still right; the list learns on its next fetch.
    expect(list?.map((item) => item.sermon.id)).toEqual(['s1']);
    expect(queryClient.getQueryData(savedQueryKey('unknown'))).toBe(true);
  });

  test('applying the same state twice cannot double a row', () => {
    queryClient.setQueryData(['sermons', 's3'], sermon('s3'));
    queryClient.setQueryData(savedListQueryKey, []);
    applySavedToCache('s3', true);
    applySavedToCache('s3', true);
    const list = queryClient.getQueryData<SavedListItem[]>(savedListQueryKey);
    expect(list).toHaveLength(1);
  });
});

// RNTL v14 renders asynchronously, so renderHook is awaited (the glory suite's
// note; a bare call hands back a result that has not rendered yet).
describe('useSavedState', () => {
  test('a queued wish outranks the server answer', async () => {
    queueSave('s1', false);
    const { result } = await renderHook(() => useSavedState('s1', true));
    expect(result.current).toBe(false);
  });

  test('with nothing queued, the server answers', async () => {
    const { result } = await renderHook(() => useSavedState('s1', true));
    expect(result.current).toBe(true);
  });
});
