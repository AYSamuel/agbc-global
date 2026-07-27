import { writeHandlers } from '../writeQueueHandlers';

// What a queued Glory actually does when it reaches the server, and how each
// kind of refusal is classified. The classification is the load-bearing part: a
// wrong "refused" silently discards what a member asked for, and a wrong "retry"
// leaves a doomed write in the queue forever.

const mockUpsert = jest.fn<Promise<{ error: unknown }>, [unknown, unknown]>();
const mockDelete = jest.fn<Promise<{ error: unknown }>, [string, string]>();
const mockGetSession = jest.fn<Promise<unknown>, []>();
const mockInvalidate = jest.fn<Promise<void>, [{ queryKey: unknown[] }]>();
const mockApply = jest.fn<undefined, [string, boolean]>();

jest.mock('@/features/family/gloryCache', () => ({
  applyGloryToCaches: (id: string, reacted: boolean) => {
    mockApply(id, reacted);
  },
}));

jest.mock('@/lib/queryPersist', () => ({
  queryClient: {
    invalidateQueries: (args: { queryKey: unknown[] }) => mockInvalidate(args),
  },
}));

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
      delete: () => {
        const eqs: string[] = [];
        const chain = {
          eq: (column: string, value: string) => {
            eqs.push(`${column}=${value}`);
            return eqs.length < 2 ? chain : mockDelete(eqs[0], eqs[1]);
          },
        };
        return chain;
      },
    }),
  },
}));

const ON = { kind: 'glory', entityId: 't1', state: 'on', queuedAt: 1 } as const;
const OFF = {
  kind: 'glory',
  entityId: 't1',
  state: 'off',
  queuedAt: 1,
} as const;

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue({
    data: { session: { user: { id: 'u1' } } },
  });
  mockUpsert.mockResolvedValue({ error: null });
  mockDelete.mockResolvedValue({ error: null });
  mockInvalidate.mockResolvedValue(undefined);
});

describe('the glory handler', () => {
  test('an "on" wish is a conflict-tolerant insert', async () => {
    // ignoreDuplicates matters to the COUNT, not just to tidiness: the counter
    // trigger fires per inserted row, and docs/spec/02 is written around a
    // skipped conflicting insert firing nothing.
    await expect(writeHandlers.glory(ON)).resolves.toBe('done');
    expect(mockUpsert).toHaveBeenCalledWith(
      { testimony_id: 't1', profile_id: 'u1' },
      { onConflict: 'testimony_id,profile_id', ignoreDuplicates: true },
    );
  });

  test('an "off" wish deletes this member\'s row, not the testimony\'s', async () => {
    await expect(writeHandlers.glory(OFF)).resolves.toBe('done');
    expect(mockDelete).toHaveBeenCalledWith('testimony_id=t1', 'profile_id=u1');
  });

  test('a landed write changes nothing on screen', async () => {
    // The card was already patched when the member tapped
    // (features/family/useGlory). Touching it again here is what produced the
    // border flicker: the queue and the cache notify React at different times,
    // so a second change meant a second render to get wrong.
    await writeHandlers.glory(ON);
    expect(mockApply).not.toHaveBeenCalled();
    expect(mockInvalidate).not.toHaveBeenCalled();
  });

  test('a refusal puts the card back', async () => {
    // The server will keep saying no (the testimony was removed), so the
    // optimistic change must not stand as a promise the app cannot keep.
    mockUpsert.mockResolvedValue({ error: { code: '23514' } });
    await expect(writeHandlers.glory(ON)).resolves.toBe('refused');
    expect(mockApply).toHaveBeenCalledWith('t1', false);
  });

  test('a refused un-react is put back the other way', async () => {
    mockDelete.mockResolvedValue({ error: { code: '23514' } });
    await expect(writeHandlers.glory(OFF)).resolves.toBe('refused');
    expect(mockApply).toHaveBeenCalledWith('t1', true);
  });

  test('a transport failure leaves the card alone, because nothing was decided', async () => {
    mockUpsert.mockResolvedValue({
      error: { message: 'Network request failed' },
    });
    await expect(writeHandlers.glory(ON)).resolves.toBe('retry');
    expect(mockApply).not.toHaveBeenCalled();
  });

  test('deleting a reaction that is already gone is success, not failure', async () => {
    // The wish is "no reaction here", and there is none.
    mockDelete.mockResolvedValue({ error: null });
    await expect(writeHandlers.glory(OFF)).resolves.toBe('done');
  });
});

describe('classifying a refusal', () => {
  test('a guard trigger saying no is final', async () => {
    // 23514: the testimony is no longer published. Retrying forever would be a
    // lie to the member and a load on the server.
    mockUpsert.mockResolvedValue({ error: { code: '23514' } });
    await expect(writeHandlers.glory(ON)).resolves.toBe('refused');
  });

  test('a vanished testimony is final', async () => {
    mockUpsert.mockResolvedValue({ error: { code: '23503' } });
    await expect(writeHandlers.glory(ON)).resolves.toBe('refused');
  });

  test('an RLS refusal is final', async () => {
    mockUpsert.mockResolvedValue({ error: { code: '42501' } });
    await expect(writeHandlers.glory(ON)).resolves.toBe('refused');
  });

  test('a transport error keeps the wish', async () => {
    // No pg code: a bounded fetch that aborted, a dropped connection, no
    // network. Nothing was decided, so nothing is dropped.
    mockUpsert.mockResolvedValue({
      error: { message: 'Network request failed' },
    });
    await expect(writeHandlers.glory(ON)).resolves.toBe('retry');
  });

  test('an unrecognised database error keeps the wish rather than discarding it', async () => {
    mockUpsert.mockResolvedValue({ error: { code: '08006' } });
    await expect(writeHandlers.glory(ON)).resolves.toBe('retry');
  });

  test('no session is a race with sign-out, not a refusal', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    await expect(writeHandlers.glory(ON)).resolves.toBe('retry');
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});

describe('the kinds that have no surface yet', () => {
  test('an intercession waits rather than claiming success', async () => {
    // Nothing queues one until slice 3; if anything did, "retry" keeps the wish
    // alive instead of quietly dropping it.
    await expect(
      writeHandlers.intercession({
        kind: 'intercession',
        entityId: 'p1',
        state: 'committed',
        queuedAt: 1,
      }),
    ).resolves.toBe('retry');
  });
});
