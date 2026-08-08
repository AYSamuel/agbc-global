// The auth store's transitions (docs/spec/03): server truth via profiles,
// snapshot-backed member routing, and the refresh-failure guest transition.

import { PERSIST_META } from '@/lib/queryMeta';
import { queryClient } from '@/lib/queryPersist';

import { useAuthStore } from '../auth';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const mockGetSession = jest.fn<Promise<unknown>, []>();
const mockMaybeSingle = jest.fn<Promise<unknown>, []>();
const mockSignOut = jest.fn(() => Promise.resolve({ error: null }));

// The listener registry lives INSIDE the factory: the store subscribes at
// module load, which runs before this file's own statements, so a test-file
// variable would be re-initialized to null right after the subscription.
jest.mock('@/lib/supabase', () => {
  const listeners: ((event: string, session: unknown) => void)[] = [];
  return {
    // The real callback is `(event, session)`, and the identity in that second
    // argument is what the listener watches: an account switch arrives as
    // SIGNED_IN, not as SIGNED_OUT.
    __fireAuthEvent: (event: string, userId?: string) => {
      const session = userId === undefined ? null : { user: { id: userId } };
      listeners.forEach((listener) => {
        listener(event, session);
      });
    },
    supabase: {
      auth: {
        getSession: () => mockGetSession(),
        signOut: () => mockSignOut(),
        onAuthStateChange: (callback: (event: string) => void) => {
          listeners.push(callback);
          return { data: { subscription: { unsubscribe: () => undefined } } };
        },
      },
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: () => mockMaybeSingle() }),
        }),
      }),
    },
  };
});

const { __fireAuthEvent: fireAuthEvent } = jest.requireMock<{
  __fireAuthEvent: (event: string, userId?: string) => void;
}>('@/lib/supabase');

const SESSION = {
  data: {
    session: { user: { id: 'user-1', email: 'a@test.local' } },
  },
};
const NO_SESSION = { data: { session: null } };
const ONBOARDED_ROW = {
  data: {
    display_name: 'Ayo',
    branch_id: 'branch-1',
    language: 'en',
    role: 'member',
    onboarded_at: '2026-07-26T00:00:00Z',
  },
  error: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({
    status: 'loading',
    email: null,
    profile: null,
    signedOutBanner: false,
  });
});

describe('syncFromSession', () => {
  it('lands on guest without a session', async () => {
    mockGetSession.mockResolvedValue(NO_SESSION);
    await useAuthStore.getState().syncFromSession();
    expect(useAuthStore.getState().status).toBe('guest');
  });

  it('lands on member when the profile is onboarded', async () => {
    mockGetSession.mockResolvedValue(SESSION);
    mockMaybeSingle.mockResolvedValue(ONBOARDED_ROW);
    await useAuthStore.getState().syncFromSession();
    const state = useAuthStore.getState();
    expect(state.status).toBe('member');
    expect(state.profile?.displayName).toBe('Ayo');
  });

  it('routes a session without a profile row to onboarding (killed mid-AUTH-3)', async () => {
    mockGetSession.mockResolvedValue(SESSION);
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    await useAuthStore.getState().syncFromSession();
    expect(useAuthStore.getState().status).toBe('onboarding');
  });

  it('falls back to onboarding when the profile read fails with no snapshot', async () => {
    mockGetSession.mockResolvedValue(SESSION);
    mockMaybeSingle.mockResolvedValue({
      data: null,
      error: { message: 'offline' },
    });
    await useAuthStore.getState().syncFromSession();
    expect(useAuthStore.getState().status).toBe('onboarding');
  });

  it('routes instantly on a persisted snapshot without waiting for the network', async () => {
    useAuthStore.setState({
      profile: {
        displayName: 'Ayo',
        branchId: 'branch-1',
        language: 'en',
        role: 'member',
      },
    });
    mockGetSession.mockResolvedValue(SESSION);
    mockMaybeSingle.mockReturnValue(new Promise(() => undefined)); // never resolves
    await useAuthStore.getState().syncFromSession();
    expect(useAuthStore.getState().status).toBe('member');
  });
});

describe('completeSignIn (AUTH-2 exit)', () => {
  it('returns member for a returning profile', async () => {
    mockGetSession.mockResolvedValue(SESSION);
    mockMaybeSingle.mockResolvedValue(ONBOARDED_ROW);
    await expect(useAuthStore.getState().completeSignIn()).resolves.toBe(
      'member',
    );
  });

  it('returns onboarding for a first sign-in', async () => {
    mockGetSession.mockResolvedValue(SESSION);
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(useAuthStore.getState().completeSignIn()).resolves.toBe(
      'onboarding',
    );
  });
});

describe('the refresh-failure transition (docs/spec/03)', () => {
  it('a SIGNED_OUT event without user intent shows the banner', () => {
    useAuthStore.setState({ status: 'member', email: 'a@test.local' });
    fireAuthEvent('SIGNED_OUT');
    const state = useAuthStore.getState();
    expect(state.status).toBe('guest');
    expect(state.signedOutBanner).toBe(true);
  });

  it('a user-initiated sign-out shows no banner', async () => {
    useAuthStore.setState({ status: 'member', email: 'a@test.local' });
    const signOutDone = useAuthStore.getState().signOut();
    fireAuthEvent('SIGNED_OUT');
    await signOutDone;
    const state = useAuthStore.getState();
    expect(state.status).toBe('guest');
    expect(state.signedOutBanner).toBe(false);
  });

  it('a SIGNED_OUT while already guest is a no-op', () => {
    useAuthStore.setState({ status: 'guest' });
    fireAuthEvent('SIGNED_OUT');
    expect(useAuthStore.getState().signedOutBanner).toBe(false);
  });

  it("takes the member's cached reads with them (W2.8)", () => {
    // The cache is keyed by what was asked, never by who asked, so the next
    // person to sign in on this phone would meet the last one's data: their
    // rhythm on the strip, their reaction state on a feed card. Found with two
    // seeded members on a device.
    queryClient.setQueryData(['rhythm', 'branch-1'], { currentWeeks: 6 });
    useAuthStore.setState({ status: 'member', email: 'a@test.local' });

    fireAuthEvent('SIGNED_OUT');

    expect(queryClient.getQueryData(['rhythm', 'branch-1'])).toBeUndefined();
  });

  it('but leaves the guest-browsable ones (docs/spec/03, 16)', () => {
    // Signing out must not also cost you the offline verse and service card.
    // Public reads are the ones that opted into persistence.
    queryClient.setQueryDefaults(['daily-verse'], { meta: PERSIST_META });
    queryClient.setQueryData(['daily-verse', '2026-08-08', 'en'], {
      reference: 'Psalm 23:1',
    });
    useAuthStore.setState({ status: 'member', email: 'a@test.local' });

    fireAuthEvent('SIGNED_OUT');

    expect(
      queryClient.getQueryData(['daily-verse', '2026-08-08', 'en']),
    ).toEqual({ reference: 'Psalm 23:1' });
  });
});

describe('an account switch that never signs out (W2.8 slice 3)', () => {
  it("drops the previous member's cached reads on a sign-in as somebody else", () => {
    // The one the SIGNED_OUT handler above cannot catch. A session's access
    // token stays valid for its full hour after the refresh token is gone, so
    // the app can answer one member's rhythm at launch, have a second member
    // sign in, and keep serving the first one's row until it goes stale. Seen
    // on the phone: Anke opened RHYTHM and read Marieke's streak.
    fireAuthEvent('INITIAL_SESSION', 'member-a');
    queryClient.setQueryData(['rhythm', 'branch-1'], { currentWeeks: 2 });

    fireAuthEvent('SIGNED_IN', 'member-b');

    expect(queryClient.getQueryData(['rhythm', 'branch-1'])).toBeUndefined();
  });

  it('and keeps them when the SAME member simply refreshes a token', () => {
    // Every hour, for everyone. Clearing here would blank the member's own
    // screens on a schedule.
    fireAuthEvent('SIGNED_IN', 'member-c');
    queryClient.setQueryData(['rhythm', 'branch-1'], { currentWeeks: 4 });

    fireAuthEvent('TOKEN_REFRESHED', 'member-c');

    expect(queryClient.getQueryData(['rhythm', 'branch-1'])).toEqual({
      currentWeeks: 4,
    });
  });
});
