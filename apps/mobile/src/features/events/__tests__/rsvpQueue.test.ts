import { replayGateAction } from '@/features/auth/replay';
import { queueRsvp } from '@/features/events/rsvp';
import { useNotificationAskStore } from '@/features/notifications/ask';

// What saying an RSVP does BESIDES answering (docs/spec/06, 11).
//
// `queueRsvp` is deliberately the one place an RSVP is decided, because two
// callers reach it: the button on the event screen, and the gate-return
// executor replaying an RSVP a guest tapped before signing in. Anything that
// belongs to "the member said they are coming" therefore belongs in here rather
// than in the screen, or the commonest first RSVP in the app silently skips it.

jest.mock('@/lib/writeQueue', () => ({
  pushWrite: jest.fn(),
  usePendingWrite: jest.fn(),
}));

jest.mock('@/lib/queryPersist', () => ({
  queryClient: { setQueryData: jest.fn(), invalidateQueries: jest.fn() },
}));

// Only the read path uses it, and none of these tests read. The auth listener
// still has to exist, because reaching the replay executor pulls in the store
// that registers it.
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
  useNotificationAskStore.setState({ asked: false, pending: null });
});

describe('the value moment an RSVP raises', () => {
  test('going raises it, so the ask is due', () => {
    queueRsvp('event-1', 'going');
    expect(useNotificationAskStore.getState().pending).toBe('rsvp');
  });

  test('interested raises it too: they are still planning to come', () => {
    queueRsvp('event-1', 'interested');
    expect(useNotificationAskStore.getState().pending).toBe('rsvp');
  });

  test('cancelling never does', () => {
    // Somebody withdrawing their name is the last person to ask for permission
    // to send them things.
    queueRsvp('event-1', 'cancelled');
    expect(useNotificationAskStore.getState().pending).toBeNull();
  });

  test('the gate-return path raises it, because it goes through here', async () => {
    // The regression this file exists for: the value moment used to live in the
    // event screen's own handler, so a guest who tapped "I'm going", signed in,
    // and landed back with their RSVP already done was never asked (found on
    // device, 2026-08-09). That is the FIRST RSVP for most members.
    await replayGateAction({ kind: 'rsvp', eventId: 'event-1' });

    expect(useNotificationAskStore.getState().pending).toBe('rsvp');
  });

  test('and a member already asked once is not raised again', () => {
    useNotificationAskStore.setState({ asked: true });
    queueRsvp('event-1', 'going');
    expect(useNotificationAskStore.getState().pending).toBeNull();
  });
});
