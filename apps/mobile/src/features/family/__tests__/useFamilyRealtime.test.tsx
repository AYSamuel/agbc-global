import { renderHook } from '@testing-library/react-native';

import { useFamilyRealtime } from '../useFamilyRealtime';

// The realtime + polling contract (docs/spec/02). What matters here is behavioral,
// not visual: the right mockChannels are joined on focus, a 60s poll is armed as the
// degradation floor, and everything tears down on blur. The block-drop and
// invalidate-on-broadcast logic is exercised by driving the captured handler.

let mockFocused = true;
jest.mock('expo-router', () => ({ useIsFocused: () => mockFocused }));

const mockInvalidate = jest.fn();
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: mockInvalidate }),
}));

interface FakeChannel {
  topic: string;
  handler: ((msg: { payload: unknown }) => void) | null;
  on: (
    type: string,
    filter: unknown,
    cb: (msg: { payload: unknown }) => void,
  ) => FakeChannel;
  subscribe: () => FakeChannel;
}
const mockChannels: FakeChannel[] = [];
const mockRemoveChannel = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: {
    channel: (topic: string) => {
      const ch: FakeChannel = {
        topic,
        handler: null,
        on(_type, _filter, cb) {
          this.handler = cb;
          return this;
        },
        subscribe() {
          return this;
        },
      };
      mockChannels.push(ch);
      return ch;
    },
    // Arrow wrapper, not a direct reference: the factory runs during import, when
    // the `const mockRemoveChannel` is still in its temporal dead zone, so a direct
    // reference would capture undefined. Deferring the lookup to call time fixes it.
    removeChannel: (channel: unknown) => {
      mockRemoveChannel(channel);
    },
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockChannels.length = 0;
  mockFocused = true;
});

afterEach(() => {
  jest.useRealTimers();
});

test('on focus, joins family:all and the branch channel', async () => {
  await renderHook(() => {
    useFamilyRealtime('b-gla');
  });
  expect(mockChannels.map((c) => c.topic).sort()).toEqual([
    'family:all',
    'family:branch:b-gla',
  ]);
});

test('a guest with no branch joins only family:all', async () => {
  await renderHook(() => {
    useFamilyRealtime(null);
  });
  expect(mockChannels.map((c) => c.topic)).toEqual(['family:all']);
});

test('when blurred, joins nothing and holds no socket', async () => {
  mockFocused = false;
  await renderHook(() => {
    useFamilyRealtime('b-gla');
  });
  expect(mockChannels).toHaveLength(0);
});

test('a broadcast invalidates the family queries', async () => {
  await renderHook(() => {
    useFamilyRealtime('b-gla');
  });
  mockChannels[0]?.handler?.({
    payload: { table: 'prayers', action: 'inserted' },
  });
  expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ['family'] });
});

test('an event from a blocked author is dropped, not invalidated', async () => {
  await renderHook(() => {
    useFamilyRealtime('b-gla', ['blocked-1']);
  });
  mockChannels[0]?.handler?.({
    payload: {
      table: 'testimonies',
      action: 'inserted',
      author_id: 'blocked-1',
    },
  });
  expect(mockInvalidate).not.toHaveBeenCalled();
});

test('an anonymous event (no author_id) is never dropped', async () => {
  await renderHook(() => {
    useFamilyRealtime('b-gla', ['blocked-1']);
  });
  // Anonymous payloads carry no author_id, so there is nothing to match and
  // nothing to leak: the card must still update.
  mockChannels[0]?.handler?.({
    payload: { table: 'prayers', action: 'inserted', author_id: null },
  });
  expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ['family'] });
});

test('the 60s poll fires as the degradation floor even with no broadcast', async () => {
  await renderHook(() => {
    useFamilyRealtime('b-gla');
  });
  expect(mockInvalidate).not.toHaveBeenCalled();
  jest.advanceTimersByTime(60_000);
  expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ['family'] });
});

test('blur tears the mockChannels and the timer down', async () => {
  const { rerender } = await renderHook(() => {
    useFamilyRealtime('b-gla');
  });
  expect(mockChannels).toHaveLength(2);
  mockFocused = false;
  await rerender({});
  expect(mockRemoveChannel).toHaveBeenCalledTimes(2);
  // And the poll no longer fires once torn down.
  mockInvalidate.mockClear();
  jest.advanceTimersByTime(120_000);
  expect(mockInvalidate).not.toHaveBeenCalled();
});
