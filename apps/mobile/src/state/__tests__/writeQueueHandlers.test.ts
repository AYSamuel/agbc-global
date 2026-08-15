import { writeHandlers } from '../writeQueueHandlers';

// What a queued Glory actually does when it reaches the server, and how each
// kind of refusal is classified. The classification is the load-bearing part: a
// wrong "refused" silently discards what a member asked for, and a wrong "retry"
// leaves a doomed write in the queue forever.

const mockUpsert = jest.fn<Promise<{ error: unknown }>, [unknown, unknown]>();
const mockDelete = jest.fn<Promise<{ error: unknown }>, string[]>();
const mockGetSession = jest.fn<Promise<unknown>, []>();
const mockUpdate = jest.fn<Promise<{ error: unknown }>, [unknown, string[]]>();
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
      // A thenable chain rather than "resolve at the second eq": the glory and
      // intercession deletes scope by two columns, while the saved delete
      // scopes by ONE (RLS already owns the profile side since 20260815120000),
      // so the await itself is what fires the recorded call.
      delete: () => {
        const eqs: string[] = [];
        const chain = {
          eq: (column: string, value: string) => {
            eqs.push(`${column}=${value}`);
            return chain;
          },
          then: (
            resolve: (value: { error: unknown }) => unknown,
            reject: (reason: unknown) => unknown,
          ) => mockDelete(...eqs).then(resolve, reject),
        };
        return chain;
      },
      // update().eq().eq().eq(): resolves once every filter is applied, so the
      // test can assert the whole scope and not just the last column.
      update: (patch: unknown) => {
        const eqs: string[] = [];
        const chain = {
          eq: (column: string, value: string) => {
            eqs.push(`${column}=${value}`);
            return eqs.length < 3 ? chain : mockUpdate(patch, eqs);
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
  mockUpdate.mockResolvedValue({ error: null });
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
    mockUpdate.mockResolvedValue({ error: null });
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

const COMMIT = {
  kind: 'intercession',
  entityId: 'p1',
  state: 'committed',
  queuedAt: 1,
} as const;
const FULFIL = {
  kind: 'intercession',
  entityId: 'p1',
  state: 'prayed',
  queuedAt: 1,
} as const;

describe('the intercession handler', () => {
  test('"I will pray" is a conflict-tolerant enrolment', async () => {
    // A repeated replay must not enrol the member twice, which would double the
    // praying count the author sees.
    await expect(writeHandlers.intercession(COMMIT)).resolves.toBe('done');
    expect(mockUpsert).toHaveBeenCalledWith(
      { prayer_id: 'p1', profile_id: 'u1' },
      { onConflict: 'prayer_id,profile_id', ignoreDuplicates: true },
    );
  });

  test('the undo deletes the commitment outright, from either step', async () => {
    // Which is why the database needed no change: deleting your own intercession
    // was always permitted, while un-praying never was.
    const UNDO = {
      kind: 'intercession',
      entityId: 'p1',
      state: 'none',
      queuedAt: 1,
    } as const;
    await expect(writeHandlers.intercession(UNDO)).resolves.toBe('done');
    expect(mockDelete).toHaveBeenCalledWith('prayer_id=p1', 'profile_id=u1');
  });

  test('"I prayed" ensures the commitment exists, then fulfils it', async () => {
    // Two statements on purpose. The queue keeps only the last wish per request,
    // so this one can be all that survives of "undo, commit again, fulfil again",
    // by which point the server may have no row at all. The insert guard forces
    // every new intercession to `committed`, so reaching `prayed` from nothing
    // genuinely takes both steps.
    await expect(writeHandlers.intercession(FULFIL)).resolves.toBe('done');
    expect(mockUpsert).toHaveBeenCalledWith(
      { prayer_id: 'p1', profile_id: 'u1' },
      { onConflict: 'prayer_id,profile_id', ignoreDuplicates: true },
    );
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ state: 'prayed' }),
      // Scoped to a row still committed, so a replay after the first success
      // matches nothing and is a success rather than an error.
      ['prayer_id=p1', 'profile_id=u1', 'state=committed'],
    );
  });

  test('and if the enrolment fails, it does not pretend to fulfil', async () => {
    mockUpsert.mockResolvedValue({
      error: { message: 'Network request failed' },
    });
    await expect(writeHandlers.intercession(FULFIL)).resolves.toBe('retry');
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test('a landed commitment changes nothing on screen', async () => {
    // The card was patched when the member tapped, exactly as for Glory.
    await writeHandlers.intercession(COMMIT);
    expect(mockInvalidate).not.toHaveBeenCalled();
  });

  test('a refusal refetches, because only the server knows what replaced it', async () => {
    // The prayer was answered, deleted or removed while the tap was in flight,
    // so the commitment the member reached for no longer exists.
    mockUpsert.mockResolvedValue({ error: { code: '23514' } });
    await expect(writeHandlers.intercession(COMMIT)).resolves.toBe('refused');
    expect(mockInvalidate).toHaveBeenCalled();
  });

  test('no session is a race with sign-out, not a refusal', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    await expect(writeHandlers.intercession(COMMIT)).resolves.toBe('retry');
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});

const SAVE = {
  kind: 'saved',
  entityId: 's1',
  state: 'on',
  queuedAt: 1,
} as const;
const UNSAVE = {
  kind: 'saved',
  entityId: 's1',
  state: 'off',
  queuedAt: 1,
} as const;

describe('the saved handler (W3.1 slice 4)', () => {
  test('an "on" wish is a conflict-tolerant insert that never names the member', async () => {
    // The absence of profile_id IS the migration's posture (20260815120000):
    // the column defaults to auth.uid() and the INSERT grant refuses a client
    // that names it, so sending it would turn every save into a refusal.
    await expect(writeHandlers.saved(SAVE)).resolves.toBe('done');
    expect(mockUpsert).toHaveBeenCalledWith(
      { sermon_id: 's1' },
      { onConflict: 'profile_id,sermon_id', ignoreDuplicates: true },
    );
  });

  test('an "off" wish deletes by sermon alone: RLS owns the profile side', async () => {
    await expect(writeHandlers.saved(UNSAVE)).resolves.toBe('done');
    expect(mockDelete).toHaveBeenCalledWith('sermon_id=s1');
  });

  test('a landed write changes nothing on screen', async () => {
    // The bookmark and the list were patched at the tap (features/watch/saved).
    await writeHandlers.saved(SAVE);
    expect(mockInvalidate).not.toHaveBeenCalled();
  });

  test('a refusal refetches both saved surfaces, quietly', async () => {
    // The sermon row was deleted outright (23503): only the server can say
    // what the list holds now.
    mockUpsert.mockResolvedValue({ error: { code: '23503' } });
    await expect(writeHandlers.saved(SAVE)).resolves.toBe('refused');
    expect(mockInvalidate).toHaveBeenCalled();
  });

  test('a transport failure keeps the wish and touches nothing', async () => {
    mockUpsert.mockResolvedValue({
      error: { message: 'Network request failed' },
    });
    await expect(writeHandlers.saved(SAVE)).resolves.toBe('retry');
    expect(mockInvalidate).not.toHaveBeenCalled();
  });

  test('no session is a race with sign-out, not a refusal', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    await expect(writeHandlers.saved(SAVE)).resolves.toBe('retry');
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});
