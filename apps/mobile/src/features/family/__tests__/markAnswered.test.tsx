import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { useMarkAnswered } from '../markAnswered';

// MARK-ANSWERED's analytics moment (W2.10): `prayer_marked_answered` waits for
// the SERVER, because this mutation is the deliberate exception to the write
// queue (see markAnswered.ts) and celebrating an update the database is about
// to refuse would be the same lie on the wire that the screen refuses to tell.
// The undo shares the mutation and is not a mark. The wire itself is proven in
// lib/analytics/__tests__; this file pins when the mutation reaches it.

const mockTrack = jest.fn();
jest.mock('@/lib/analytics', () => ({
  track: (...args: unknown[]) => {
    mockTrack(...args);
  },
}));

const mockUpdate = jest.fn<Promise<{ error: unknown }>, [unknown]>(() =>
  Promise.resolve({ error: null }),
);
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      update: (row: unknown) => ({ eq: () => mockUpdate(row) }),
    }),
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      {children}
    </QueryClientProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdate.mockResolvedValue({ error: null });
});

test('a confirmed mark fires prayer_marked_answered once', async () => {
  const { result } = await renderHook(() => useMarkAnswered(), { wrapper });
  await act(async () => {
    await result.current.mutateAsync({ prayerId: 'p1', answered: true });
  });
  expect(mockTrack).toHaveBeenCalledTimes(1);
  expect(mockTrack).toHaveBeenCalledWith('prayer_marked_answered');
});

test('the undo goes through the same mutation and fires nothing', async () => {
  const { result } = await renderHook(() => useMarkAnswered(), { wrapper });
  await act(async () => {
    await result.current.mutateAsync({ prayerId: 'p1', answered: false });
  });
  expect(mockTrack).not.toHaveBeenCalled();
});

test('a refused mark fires nothing: the event follows the write, not the tap', async () => {
  mockUpdate.mockResolvedValue({ error: { code: '23514' } });
  const { result } = await renderHook(() => useMarkAnswered(), { wrapper });
  await act(async () => {
    await expect(
      result.current.mutateAsync({ prayerId: 'p1', answered: true }),
    ).rejects.toBeTruthy();
  });
  expect(mockTrack).not.toHaveBeenCalled();
});
