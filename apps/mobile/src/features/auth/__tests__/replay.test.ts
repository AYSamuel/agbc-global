import { useWriteQueueStore } from '@/lib/writeQueue';

import { replayGateAction } from '../replay';

const mockQueueRsvp = jest.fn<undefined, [string, string]>();
jest.mock('@/features/events/rsvp', () => ({
  queueRsvp: (eventId: string, status: string) => {
    mockQueueRsvp(eventId, status);
  },
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: {
    push: (href: string) => {
      mockPush(href);
    },
  },
}));

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return --
   documented jest.mock factory shape */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return */

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => undefined } },
      }),
    },
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  useWriteQueueStore.setState({
    queue: {},
    handlers: null,
    draining: false,
    failures: 0,
  });
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

// W2.9. The gate sits behind "I'm going", so that is what signing in completes;
// a member who wanted "interested" changes it on the screen they land back on.
describe('replayGateAction: rsvp', () => {
  it('records the answer the gate was standing in front of', async () => {
    await expect(
      replayGateAction({ kind: 'rsvp', eventId: 'e1' }),
    ).resolves.toBe('done');
    expect(mockQueueRsvp).toHaveBeenCalledWith('e1', 'going');
    // Nothing navigates: AUTH-4 has already returned them to the event.
    expect(mockPush).not.toHaveBeenCalled();
  });
});

// W2.8. Same shape as glory: the replay owes the member that the wish is
// RECORDED, and the queue owns delivering it.
describe('replayGateAction: im_here', () => {
  it('records the check-in as a queued wish, at the branch the action named', async () => {
    await expect(
      replayGateAction({ kind: 'im_here', branchId: 'b1' }),
    ).resolves.toBe('done');
    const queued = Object.values(useWriteQueueStore.getState().queue);
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ kind: 'attendance', state: 'b1' });
  });

  it('records the branch from the action, never the browsing chip', async () => {
    // A member can switch the chip during sign-in; the tap they made was at the
    // branch they were standing in, and that is what must be recorded.
    await replayGateAction({ kind: 'im_here', branchId: 'b2' });
    const queued = Object.values(useWriteQueueStore.getState().queue);
    expect(queued[0]?.state).toBe('b2');
  });
});

// W2.4 moved this from a direct write to an enqueue, so the gate-return path and
// an ordinary tap are one path. What the replay owes the member is that the wish
// is RECORDED; the queue owns getting it to the server and retrying.
describe('replayGateAction: glory', () => {
  it('records the reaction as a queued wish', async () => {
    await expect(
      replayGateAction({ kind: 'glory', testimonyId: 't1' }),
    ).resolves.toBe('done');
    expect(useWriteQueueStore.getState().queue['glory:t1']).toMatchObject({
      kind: 'glory',
      entityId: 't1',
      state: 'on',
    });
  });

  it('is a reaction, never a toggle: a replay only ever turns Glory ON', async () => {
    // The gated action was "say Glory to this". Signing in and finding it turned
    // OFF because the member had reacted on another device would be a betrayal
    // of the tap that started the sign-in.
    await replayGateAction({ kind: 'glory', testimonyId: 't1' });
    await replayGateAction({ kind: 'glory', testimonyId: 't1' });
    expect(useWriteQueueStore.getState().queue['glory:t1']?.state).toBe('on');
  });
});
