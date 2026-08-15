import { act, renderHook } from '@testing-library/react-native';

import { queryClient } from '@/lib/queryPersist';

import {
  appendTimestamp,
  noteQueryKey,
  openingCopy,
  pruneDrafts,
  useNoteDraftStore,
  useNoteEditor,
  type SermonNote,
} from '../notes';

// The autosave machine (docs/spec/08, W3.1 slice 4). The order under test is
// the offline promise itself: draft first (persisted), wire second, and a
// failed wire is a status plus a retry, never a lost word.
//
// RNTL v14 renders asynchronously, so renderHook and act are awaited throughout
// (the glory suite's note).

const mockUpsert = jest.fn<Promise<{ error: unknown }>, [unknown, unknown]>();
const mockGetSession = jest.fn<Promise<unknown>, []>();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => undefined } },
      }),
    },
    from: () => ({
      upsert: (row: unknown, options: unknown) => mockUpsert(row, options),
    }),
  },
}));

const SERVER: SermonNote = { body: 'server copy', updatedAt: 1_000 };

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  queryClient.clear();
  useNoteDraftStore.setState({ drafts: {} });
  mockGetSession.mockResolvedValue({
    data: { session: { user: { id: 'u1' } } },
  });
  mockUpsert.mockResolvedValue({ error: null });
});

afterEach(() => {
  jest.useRealTimers();
});

/** Let pending microtasks (the mocked network) settle under fake timers. */
async function settle(ms = 0) {
  await act(async () => {
    if (ms > 0) jest.advanceTimersByTime(ms);
    await Promise.resolve();
  });
}

describe('the pure pieces', () => {
  test('appendTimestamp writes the next heading as a hand does', () => {
    expect(appendTimestamp('', '26:41')).toBe('26:41\n');
    expect(appendTimestamp('Grace is a gift.', '26:41')).toBe(
      'Grace is a gift.\n\n26:41\n',
    );
    // Trailing blank lines collapse rather than stack.
    expect(appendTimestamp('Lean in.\n\n', '26:41')).toBe(
      'Lean in.\n\n26:41\n',
    );
  });

  test('openingCopy takes the newer of draft and server (the resume rule)', () => {
    expect(openingCopy(undefined, SERVER)).toEqual({
      body: 'server copy',
      dirty: false,
    });
    expect(
      openingCopy({ body: 'flight draft', updatedAt: 2_000 }, SERVER),
    ).toEqual({ body: 'flight draft', dirty: true });
    // An OLDER draft lost: the server was written later, on another device.
    expect(openingCopy({ body: 'stale', updatedAt: 500 }, SERVER)).toEqual({
      body: 'server copy',
      dirty: false,
    });
    expect(openingCopy(undefined, null)).toEqual({ body: '', dirty: false });
  });

  test('pruneDrafts keeps the newest', () => {
    const pruned = pruneDrafts(
      {
        a: { body: 'a', updatedAt: 1 },
        b: { body: 'b', updatedAt: 3 },
        c: { body: 'c', updatedAt: 2 },
      },
      2,
    );
    expect(Object.keys(pruned).sort()).toEqual(['b', 'c']);
  });
});

describe('useNoteEditor', () => {
  test('opens on the server copy and reports it saved', async () => {
    const { result } = await renderHook(() => useNoteEditor('s1', SERVER));
    await settle();
    expect(result.current.body).toBe('server copy');
    expect(result.current.status).toBe('saved');
  });

  test('opens idle on a message never written about', async () => {
    const { result } = await renderHook(() => useNoteEditor('s1', null));
    await settle();
    expect(result.current.status).toBe('idle');
    expect(result.current.body).toBe('');
  });

  test('the draft lands before the wire: a keystroke survives anything', async () => {
    const { result } = await renderHook(() => useNoteEditor('s1', null));
    await settle();

    await act(async () => {
      result.current.setBody('kept words');
      await Promise.resolve();
    });
    // Persisted immediately, long before the debounce fires.
    expect(useNoteDraftStore.getState().drafts.s1.body).toBe('kept words');
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(result.current.status).toBe('unsaved');
  });

  test('the debounce saves, clears the draft, and reports Saved', async () => {
    const { result } = await renderHook(() => useNoteEditor('s1', null));
    await settle();

    await act(async () => {
      result.current.setBody('a word');
      await Promise.resolve();
    });
    await settle(1_500);

    expect(mockUpsert).toHaveBeenCalledWith(
      { sermon_id: 's1', body: 'a word' },
      { onConflict: 'profile_id,sermon_id' },
    );
    expect(result.current.status).toBe('saved');
    expect(useNoteDraftStore.getState().drafts.s1).toBeUndefined();
    // The query's copy follows, so reopening does not flash the stale body.
    expect(queryClient.getQueryData(noteQueryKey('s1'))).toMatchObject({
      body: 'a word',
    });
  });

  test('offline: status says Not saved yet, the draft stays, and it retries', async () => {
    mockUpsert.mockResolvedValue({
      error: { message: 'Network request failed' },
    });
    const { result } = await renderHook(() => useNoteEditor('s1', null));
    await settle();

    await act(async () => {
      result.current.setBody('written on the underground');
      await Promise.resolve();
    });
    await settle(1_500);

    expect(result.current.status).toBe('unsaved');
    expect(useNoteDraftStore.getState().drafts.s1.body).toBe(
      'written on the underground',
    );

    // The signal returns; the 10s retry delivers without another keystroke.
    mockUpsert.mockResolvedValue({ error: null });
    await settle(10_000);
    expect(result.current.status).toBe('saved');
    expect(useNoteDraftStore.getState().drafts.s1).toBeUndefined();
  });

  test('a newer draft wins the page and immediately owes the server a write', async () => {
    useNoteDraftStore.setState({
      drafts: { s1: { body: 'flight draft', updatedAt: 2_000 } },
    });
    const { result } = await renderHook(() => useNoteEditor('s1', SERVER));
    // A tick, not the debounce: the opening flush is deferred by a 0ms timer so
    // that it never sets state synchronously inside an effect.
    await settle(1);

    expect(result.current.body).toBe('flight draft');
    expect(mockUpsert).toHaveBeenCalledWith(
      { sermon_id: 's1', body: 'flight draft' },
      { onConflict: 'profile_id,sermon_id' },
    );
    await settle();
    expect(result.current.status).toBe('saved');
  });

  test('a draft that merely repeats the server owes nothing and is cleared', async () => {
    useNoteDraftStore.setState({
      drafts: { s1: { body: 'server copy', updatedAt: 2_000 } },
    });
    const { result } = await renderHook(() => useNoteEditor('s1', SERVER));
    await settle();

    expect(result.current.status).toBe('saved');
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(useNoteDraftStore.getState().drafts.s1).toBeUndefined();
  });

  test('typing during a save goes again rather than reporting a stale Saved', async () => {
    let releaseUpsert!: (value: { error: unknown }) => void;
    mockUpsert.mockImplementationOnce(
      () =>
        new Promise<{ error: unknown }>((resolve) => {
          releaseUpsert = resolve;
        }),
    );
    const { result } = await renderHook(() => useNoteEditor('s1', null));
    await settle();

    await act(async () => {
      result.current.setBody('first');
      await Promise.resolve();
    });
    await settle(1_500);
    expect(result.current.status).toBe('saving');

    // The pen keeps moving while the first save is in flight.
    await act(async () => {
      result.current.setBody('first and second');
      await Promise.resolve();
    });
    await act(async () => {
      releaseUpsert({ error: null });
      await Promise.resolve();
    });
    await settle(1_500);

    expect(mockUpsert).toHaveBeenLastCalledWith(
      { sermon_id: 's1', body: 'first and second' },
      { onConflict: 'profile_id,sermon_id' },
    );
    expect(result.current.status).toBe('saved');
  });

  test('signed out mid-session keeps the words as a draft', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    const { result } = await renderHook(() => useNoteEditor('s1', null));
    await settle();

    await act(async () => {
      result.current.setBody('almost lost');
      await Promise.resolve();
    });
    await settle(1_500);

    expect(result.current.status).toBe('unsaved');
    expect(useNoteDraftStore.getState().drafts.s1.body).toBe('almost lost');
  });
});
