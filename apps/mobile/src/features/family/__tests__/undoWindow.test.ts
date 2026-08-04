import { QueryClient } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';

import { useWriteQueueStore } from '@/lib/writeQueue';
import { useAuthStore } from '@/state/auth';

import { resetLocalIntercession } from '../prayerCache';
import { prayerFeedKey, type PrayerFeedItem } from '../queries';
import { UNDO_WINDOW_MS, useIntercessionPress } from '../useIntercession';

// The five seconds after a step, which exist because a mis-tap otherwise
// misreports someone as having prayed and shows the request's author a number
// that is not true about their family (device testing, 2026-07-28).
//
// The window is a WINDOW and not a toggle: it closes on its own, and after that
// the database still refuses to un-pray anything. Undo works by clearing the
// commitment, which members were always allowed to do, so nothing about the
// one-way rule was relaxed to make this possible.

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

const P = 'c3333333-3333-4333-8333-333333333333';
const FEED = prayerFeedKey('everywhere', null);

const ROW: PrayerFeedItem = {
  id: P,
  branch_id: 'b1',
  body: 'Please pray for my mother',
  language: 'en',
  is_anonymous: false,
  answered_at: null,
  praying_count: 24,
  prayed_count: 9,
  created_at: '2026-07-28T10:00:00Z',
  author_id: 'a1',
  author_name: 'Sarah O.',
  author_avatar_url: null,
  answer_testimony_id: null,
  my_intercession_state: null,
  is_mine: false,
};

function queued(): string | undefined {
  return useWriteQueueStore.getState().queue[`intercession:${P}`]?.state;
}

beforeEach(() => {
  jest.useFakeTimers();
  mockClient.clear();
  mockClient.setQueryData(FEED, [ROW]);
  resetLocalIntercession();
  useWriteQueueStore.setState({ queue: {}, handlers: null, onEvicted: null });
  useAuthStore.setState({ status: 'member' });
});

afterEach(() => {
  jest.useRealTimers();
});

test('a step opens the way back, and it closes on its own', async () => {
  const { result } = await renderHook(() =>
    useIntercessionPress(ROW, jest.fn()),
  );
  expect(result.current.onUndo).toBeUndefined();

  await act(() => {
    result.current.onPress?.();
  });
  expect(result.current.onUndo).toBeDefined();

  await act(() => {
    jest.advanceTimersByTime(UNDO_WINDOW_MS);
  });
  expect(result.current.onUndo).toBeUndefined();
});

test('undoing a commitment queues "none", and the two collapse to nothing', async () => {
  // The queue keeps only the last wish per entity, so a tap and an undo before it
  // drains send NOTHING at all: the server never hears about either.
  const { result } = await renderHook(() =>
    useIntercessionPress(ROW, jest.fn()),
  );
  await act(() => {
    result.current.onPress?.();
  });
  expect(queued()).toBe('committed');

  await act(() => {
    result.current.onUndo?.();
  });
  expect(queued()).toBe('none');
  expect(Object.keys(useWriteQueueStore.getState().queue)).toHaveLength(1);
});

test('undoing a fulfilment clears the commitment entirely', async () => {
  // Not a step back to committed (Ayo, 2026-07-28): someone who mis-tapped wants
  // to be back at "I will pray", not parked in the middle of a two-step they did
  // not mean to start. It is also why no database change was needed, since
  // deleting your own intercession was always permitted.
  const committed = { ...ROW, my_intercession_state: 'committed' as const };
  mockClient.setQueryData(FEED, [committed]);
  const { result } = await renderHook(() =>
    useIntercessionPress(committed, jest.fn()),
  );

  await act(() => {
    result.current.onPress?.();
  });
  expect(queued()).toBe('prayed');

  await act(() => {
    result.current.onUndo?.();
  });
  expect(queued()).toBe('none');
});

test('once the window has closed there is no way back', async () => {
  const { result } = await renderHook(() =>
    useIntercessionPress(ROW, jest.fn()),
  );
  await act(() => {
    result.current.onPress?.();
  });
  await act(() => {
    jest.advanceTimersByTime(UNDO_WINDOW_MS + 1);
  });

  expect(result.current.onUndo).toBeUndefined();
  // And the commitment stands: the last thing the queue was told still holds.
  expect(queued()).toBe('committed');
});

test('a guest gets the gate, not a window', async () => {
  useAuthStore.setState({ status: 'guest' });
  const gate = jest.fn();
  const { result } = await renderHook(() => useIntercessionPress(ROW, gate));

  await act(() => {
    result.current.onPress?.();
  });
  expect(gate).toHaveBeenCalledTimes(1);
  expect(queued()).toBeUndefined();
  expect(result.current.onUndo).toBeUndefined();
});

test('a fulfilled commitment offers no further step', async () => {
  const prayed = { ...ROW, my_intercession_state: 'prayed' as const };
  const { result } = await renderHook(() =>
    useIntercessionPress(prayed, jest.fn()),
  );
  expect(result.current.onPress).toBeUndefined();
});
