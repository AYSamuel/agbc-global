import { replayGateAction } from '../replay';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: {
    push: (href: string) => {
      mockPush(href);
    },
  },
}));

const mockUpsert = jest.fn<Promise<{ error: unknown }>, [unknown, unknown]>();
const mockInvalidate = jest.fn<Promise<void>, []>();

jest.mock('@/lib/queryPersist', () => ({
  queryClient: { invalidateQueries: () => mockInvalidate() },
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () =>
        Promise.resolve({ data: { session: { user: { id: 'user-1' } } } }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => undefined } },
      }),
    },
    from: () => ({
      upsert: (row: unknown, options: unknown) => mockUpsert(row, options),
    }),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockUpsert.mockResolvedValue({ error: null });
  mockInvalidate.mockResolvedValue(undefined);
});

// The gate-return contract (docs/spec/03, 04 rule 9): whatever the guest reached
// for before signing in is what happens after. These assert the ROUTE, because
// for compose the action IS opening the composer.
describe('replayGateAction: compose (W2.3)', () => {
  it('opens the testimony composer', async () => {
    await expect(
      replayGateAction({ kind: 'compose', target: 'testimony' }),
    ).resolves.toBe('done');
    expect(mockPush).toHaveBeenCalledWith('/testimony/compose');
  });

  it('opens the prayer composer', async () => {
    await expect(
      replayGateAction({ kind: 'compose', target: 'prayer' }),
    ).resolves.toBe('done');
    expect(mockPush).toHaveBeenCalledWith('/prayer/compose');
  });

  it('never navigates anywhere the action did not name', async () => {
    await replayGateAction({ kind: 'compose', target: 'prayer' });
    expect(mockPush).toHaveBeenCalledTimes(1);
  });
});

describe('replayGateAction: the kinds that are still waiting for their item', () => {
  it('resolves noop rather than pretending, and navigates nowhere', async () => {
    await expect(
      replayGateAction({ kind: 'rsvp', eventId: 'e1' }),
    ).resolves.toBe('noop');
    await expect(replayGateAction({ kind: 'im_here' })).resolves.toBe('noop');
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe('replayGateAction: glory (W2.2)', () => {
  it('lands the reaction and refreshes the family surfaces', async () => {
    await expect(
      replayGateAction({ kind: 'glory', testimonyId: 't1' }),
    ).resolves.toBe('done');
    expect(mockUpsert).toHaveBeenCalledWith(
      { testimony_id: 't1', profile_id: 'user-1' },
      { onConflict: 'testimony_id,profile_id', ignoreDuplicates: true },
    );
    expect(mockInvalidate).toHaveBeenCalled();
  });

  it('reports failure honestly when the write is refused', async () => {
    mockUpsert.mockResolvedValue({ error: { message: 'nope' } });
    await expect(
      replayGateAction({ kind: 'glory', testimonyId: 't1' }),
    ).resolves.toBe('failed');
  });
});
