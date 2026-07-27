import { QueryClient } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';

import { useWriteQueueStore } from '@/lib/writeQueue';
import { useAuthStore } from '@/state/auth';

import { testimonyFeedKey, type TestimonyFeedItem } from '../queries';
import { useGloryPress } from '../useGlory';

// A tap has to do two things and only two: change the card now, and queue the
// write for delivery. Everything else that used to happen here (optimistic state
// in the queue, arithmetic across two stores) is gone, because it is what made
// the border flicker on device.
//
// RNTL v14 renders asynchronously, so renderHook and act are awaited throughout.

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return --
   documented jest.mock factory shape */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return */

const mockClient = new QueryClient();

jest.mock('@/lib/queryPersist', () => ({
  get queryClient() {
    return mockClient;
  },
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => undefined } },
      }),
    },
  },
}));

const T = 'a1111111-1111-4111-8111-111111111111';
const FEED = testimonyFeedKey('everywhere', null);

const ROW: TestimonyFeedItem = {
  id: T,
  branch_id: 'b1',
  body: 'God provided',
  language: 'en',
  category_key: null,
  image_path: null,
  glory_count: 14,
  created_at: '2026-07-27T10:00:00Z',
  author_id: 'a1',
  author_name: 'Grace A.',
  author_avatar_url: null,
  from_prayer_id: null,
  origin_prayer_id: null,
  reacted_by_me: false,
};

function row(): TestimonyFeedItem {
  const rows = mockClient.getQueryData<TestimonyFeedItem[]>(FEED);
  if (!rows?.[0]) throw new Error('the feed fixture is missing');
  return rows[0];
}

beforeEach(() => {
  mockClient.clear();
  mockClient.setQueryData(FEED, [ROW]);
  useWriteQueueStore.setState({
    queue: {},
    handlers: null,
    onEvicted: null,
    draining: false,
    failures: 0,
  });
  useAuthStore.setState({ status: 'member' });
});

describe('a member tapping Glory', () => {
  test('changes the card immediately and queues the write', async () => {
    const { result } = await renderHook(() =>
      useGloryPress(T, ROW.glory_count, ROW.reacted_by_me, jest.fn()),
    );
    await act(() => {
      result.current.onPress();
    });

    expect(row()).toMatchObject({ glory_count: 15, reacted_by_me: true });
    expect(useWriteQueueStore.getState().queue[`glory:${T}`]).toMatchObject({
      state: 'on',
    });
  });

  test('taking it back moves both the other way', async () => {
    mockClient.setQueryData(FEED, [
      { ...ROW, glory_count: 15, reacted_by_me: true },
    ]);
    const { result } = await renderHook(() =>
      useGloryPress(T, 15, true, jest.fn()),
    );
    await act(() => {
      result.current.onPress();
    });

    expect(row()).toMatchObject({ glory_count: 14, reacted_by_me: false });
    expect(useWriteQueueStore.getState().queue[`glory:${T}`]).toMatchObject({
      state: 'off',
    });
  });

  test('tap, untap, tap leaves one queued write and one added Glory', async () => {
    // The queue collapses to the last wish (docs/spec/01 §8) while the card
    // follows every tap, so the two never disagree about where things ended up.
    let reacted = false;
    let count = 14;
    const { result, rerender } = await renderHook(
      ({ c, r }: { c: number; r: boolean }) =>
        useGloryPress(T, c, r, jest.fn()),
      { initialProps: { c: count, r: reacted } },
    );

    for (let tap = 0; tap < 3; tap += 1) {
      await act(() => {
        result.current.onPress();
      });
      reacted = row().reacted_by_me;
      count = row().glory_count;
      await rerender({ c: count, r: reacted });
    }

    expect(row()).toMatchObject({ glory_count: 15, reacted_by_me: true });
    expect(Object.keys(useWriteQueueStore.getState().queue)).toHaveLength(1);
    expect(useWriteQueueStore.getState().queue[`glory:${T}`]).toMatchObject({
      state: 'on',
    });
  });
});

describe('a guest tapping Glory', () => {
  test('is gated: nothing is queued and no card changes in their name', async () => {
    useAuthStore.setState({ status: 'guest' });
    const gate = jest.fn();
    const { result } = await renderHook(() =>
      useGloryPress(T, 14, false, gate),
    );
    await act(() => {
      result.current.onPress();
    });

    expect(gate).toHaveBeenCalledTimes(1);
    expect(useWriteQueueStore.getState().queue).toEqual({});
    expect(row()).toMatchObject({ glory_count: 14, reacted_by_me: false });
  });
});

// The burst is feedback for an ACT. Deriving it from `reacted` changing looked
// equivalent and was not: it also fired when the server's answer arrived,
// celebrating a reaction already celebrated (found on device, 2026-07-27).
describe('when the burst fires', () => {
  test('once per tap that turns Glory on', async () => {
    const { result } = await renderHook(() =>
      useGloryPress(T, 14, false, jest.fn()),
    );
    expect(result.current.bursts).toBe(0);
    await act(() => {
      result.current.onPress();
    });
    expect(result.current.bursts).toBe(1);
  });

  test('never when taking one back', async () => {
    const { result } = await renderHook(() =>
      useGloryPress(T, 15, true, jest.fn()),
    );
    await act(() => {
      result.current.onPress();
    });
    expect(result.current.bursts).toBe(0);
  });

  test('not when a refreshed row arrives saying the same thing', async () => {
    const { result, rerender } = await renderHook(
      ({ r }: { r: boolean }) => useGloryPress(T, 14, r, jest.fn()),
      { initialProps: { r: false } },
    );
    await act(() => {
      result.current.onPress();
    });
    expect(result.current.bursts).toBe(1);

    await rerender({ r: true });
    expect(result.current.bursts).toBe(1);
  });

  test('a guest tap celebrates nothing, because nothing happened', async () => {
    useAuthStore.setState({ status: 'guest' });
    const { result } = await renderHook(() =>
      useGloryPress(T, 14, false, jest.fn()),
    );
    await act(() => {
      result.current.onPress();
    });
    expect(result.current.bursts).toBe(0);
  });
});
