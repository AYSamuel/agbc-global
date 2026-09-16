import { DELETE_BUDGET_MS, requestDeletion } from '../requestDeletion';

/**
 * The one boundary this feature owns: the `delete_my_account` call (W4.18 slice 1).
 * What a failure MEANS is `deleteOutcome.test.ts`; this file only proves the wiring:
 * the choice reaches the server as made, the call brings its own budget rather than
 * the client's ten seconds, and every path answers with an outcome instead of throwing.
 */

type RpcResult = { error: { code?: string; message: string } | null };

const mockAbortSignal = jest.fn<Promise<RpcResult>, [AbortSignal]>(() =>
  Promise.resolve({ error: null }),
);
const mockRpc = jest.fn<
  { abortSignal: typeof mockAbortSignal },
  [string, Record<string, unknown>]
>(() => ({ abortSignal: mockAbortSignal }));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (name: string, args: Record<string, unknown>) => mockRpc(name, args),
  },
}));

beforeEach(() => {
  // `budget()` arms a real timer; fake ones keep the suite hermetic.
  jest.useFakeTimers();
  jest.clearAllMocks();
});

afterEach(() => {
  jest.useRealTimers();
});

test('the choice reaches the server as made, on a budgeted signal', async () => {
  await expect(requestDeletion(true, 'first')).resolves.toBe('erased');

  expect(mockRpc).toHaveBeenCalledWith('delete_my_account', {
    p_keep_posts: true,
  });
  const [signal] = mockAbortSignal.mock.calls[0];
  expect(signal).toBeInstanceOf(AbortSignal);
  expect(signal.aborted).toBe(false);

  // The signal is the request's own budget, not the client's default.
  jest.advanceTimersByTime(DELETE_BUDGET_MS - 1);
  expect(signal.aborted).toBe(false);
  jest.advanceTimersByTime(1);
  expect(signal.aborted).toBe(true);
});

test('a refusal the server made is reported as such', async () => {
  mockAbortSignal.mockResolvedValueOnce({
    error: {
      code: 'P0001',
      message: 'the last admin cannot delete their account',
    },
  });
  await expect(requestDeletion(false, 'first')).resolves.toBe('refused');
});

test('the proof of an earlier erasure is reported as erased', async () => {
  mockAbortSignal.mockResolvedValueOnce({
    error: { code: 'P0002', message: 'no live account to erase' },
  });
  await expect(requestDeletion(false, 'confirm')).resolves.toBe('erased');
});

test('a request that throws answers unconfirmed rather than throwing', async () => {
  mockAbortSignal.mockRejectedValueOnce(
    new TypeError('Network request failed'),
  );
  await expect(requestDeletion(false, 'first')).resolves.toBe('unconfirmed');
});
