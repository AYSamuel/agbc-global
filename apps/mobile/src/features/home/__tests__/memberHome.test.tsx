import { fireEvent, render, screen } from '@testing-library/react-native';

import '@/i18n';
import { ToastProvider } from '@/components/ui';
import { useWriteQueueStore } from '@/lib/writeQueue';
import { useAuthStore } from '@/state/auth';
import { useBranchStore } from '@/state/branch';
import { useGateStore } from '@/state/gate';
import { indexOfText, textsInOrder } from '@/test/renderOrder';
import { ThemeScope } from '@/theme';

import Home from '../../../../app/(tabs)/home';

// Member Home (docs/spec/07 + 10, mockups W2.8 "HOME · checked in" and "the
// rhythm strip"). What is asserted here is the part that knows who is reading:
// the name, the strip, and "I'm here" with its gate, its idempotence and its
// visiting semantics.

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access --
   documented jest.mock factory shapes */
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access */

const mockPush = jest.fn<undefined, [unknown]>();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

jest.mock('expo-localization', () => ({
  getLocales: jest.fn(() => [{ languageCode: 'en' }]),
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => undefined } },
      }),
    },
  },
}));

const mockServices = jest.fn<
  { data: unknown; isError: boolean; refetch: () => void },
  []
>();
jest.mock('../queries', () => {
  const actual = jest.requireActual<typeof import('../queries')>('../queries');
  return {
    ...actual,
    useDailyVerseQuery: () => ({
      data: null,
      isError: false,
      refetch: jest.fn(),
    }),
    useBranchServicesQuery: () => mockServices(),
  };
});

const mockRhythm = jest.fn<
  { data: unknown; isError: boolean; refetch: () => void },
  []
>();
jest.mock('@/features/rhythm/queries', () => {
  const actual = jest.requireActual<typeof import('@/features/rhythm/queries')>(
    '@/features/rhythm/queries',
  );
  return { ...actual, useRhythmQuery: () => mockRhythm() };
});

jest.mock('@/features/watch/queries', () => ({
  useSermonsQuery: () => ({ data: [], isError: false, refetch: jest.fn() }),
}));

jest.mock('@/features/family/queries', () => ({
  useLatestTestimonyQuery: () => ({ data: null, isError: false }),
  latestTestimonyQueryOptions: () => ({
    queryKey: ['family', 'latest-testimony'],
    queryFn: () => Promise.resolve(null),
  }),
}));

jest.mock('@/features/onboarding/useBranches', () => ({
  useBranchesQuery: () => ({ data: undefined, isError: true }),
}));

jest.mock('@/features/branch-change/queries', () => ({
  useMyBranchRequests: () => ({
    data: { pending: null, lastApproved: null, lastRejected: null },
    isPending: false,
  }),
}));

const GLASGOW = '00000000-0000-4000-8000-000000000001';
const BERLIN = '00000000-0000-4000-8000-000000000002';

// Sunday 09 August 2026, 13:00 UTC: an hour into Glasgow's noon service, so
// "I'm here" is open (features/home/nextService checkInOpen).
const DURING_SERVICE = new Date('2026-08-09T13:00:00Z').getTime();

function rhythmRow(over: Record<string, unknown> = {}) {
  return {
    today: '2026-08-09',
    checkedIn: false,
    phase: 'active',
    currentWeeks: 5,
    longestWeeks: 11,
    lastServiceDate: '2026-08-02',
    ...over,
  };
}

function signIn(branchId = GLASGOW) {
  useAuthStore.setState({
    status: 'member',
    email: 'grace@example.test',
    profile: {
      displayName: 'Grace Bello',
      branchId,
      language: 'en',
      role: 'member',
    },
  });
}

function renderHome() {
  return render(
    <ThemeScope name="light">
      <ToastProvider>
        <Home />
      </ToastProvider>
    </ThemeScope>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers().setSystemTime(DURING_SERVICE);
  useBranchStore.setState({
    branch: {
      id: GLASGOW,
      slug: 'glasgow',
      name: 'AGBC Glasgow',
      timezone: 'Europe/London',
    },
  });
  useAuthStore.setState({ status: 'guest', email: null, profile: null });
  useGateStore.setState({ pending: null, dismissedKinds: [] });
  useWriteQueueStore.setState({ queue: {}, handlers: null, draining: false });
  mockServices.mockReturnValue({
    data: [
      {
        weekday: 0,
        start_time: '12:00:00',
        duration_min: 120,
        kind: 'sunday',
        label: '',
      },
    ],
    isError: false,
    refetch: jest.fn(),
  });
  mockRhythm.mockReturnValue({
    data: rhythmRow(),
    isError: false,
    refetch: jest.fn(),
  });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('who Home is greeting', () => {
  test('a member is greeted by first name; a guest is not named', async () => {
    signIn();
    await renderHome();
    expect(
      screen.getByText(/Good (morning|afternoon|evening), Grace/),
    ).toBeOnTheScreen();
  });

  test('the guest Join card gives way to the rhythm strip', async () => {
    signIn();
    await renderHome();
    expect(screen.queryByText('Join the family')).toBeNull();
    expect(screen.getByLabelText(/5-week rhythm/)).toBeOnTheScreen();
  });

  // The strip sits directly under the service card so that the payoff of
  // tapping "I'm here" is visible without scrolling: the tap and the streak it
  // feeds are one loop (docs/spec/07, "Why this order"). Until 2026-08-11 it was
  // the LAST block on the screen, below the verse and the family highlight, so
  // this guards the move rather than the mere presence asserted above. The strip
  // carries no role that would sort it against the cards, hence document order
  // out of the rendered tree, which is what the member scrolls through.
  test('the rhythm strip sits under the service card, above the family', async () => {
    signIn();
    await renderHome();
    const texts = textsInOrder(screen.toJSON());
    expect(indexOfText(texts, 'Sunday Service')).toBeLessThan(
      indexOfText(texts, '5-week rhythm'),
    );
    expect(indexOfText(texts, '5-week rhythm')).toBeLessThan(
      indexOfText(texts, 'From the family'),
    );
  });

  test('the strip reads as one phrase, not three fragments (docs/spec/05)', async () => {
    signIn();
    await renderHome();
    expect(
      screen.getByLabelText('5-week rhythm. Next: A season with us'),
    ).toBeOnTheScreen();
  });

  test('the strip is the way into RHYTHM (docs/spec/04)', async () => {
    signIn();
    await renderHome();
    await fireEvent.press(
      screen.getByLabelText('5-week rhythm. Next: A season with us'),
    );
    expect(mockPush).toHaveBeenCalledWith('/rhythm');
  });

  test('a lapsed member is met with their longest, never a zero', async () => {
    signIn();
    mockRhythm.mockReturnValue({
      data: rhythmRow({ phase: 'lapsed', currentWeeks: 0, longestWeeks: 11 }),
      isError: false,
      refetch: jest.fn(),
    });
    await renderHome();
    expect(screen.getByText('Your longest: 11 weeks')).toBeOnTheScreen();
    expect(screen.queryByText(/0-week/)).toBeNull();
  });

  test('a rhythm that has not arrived yet shows a skeleton, not an empty gap', async () => {
    signIn();
    mockRhythm.mockReturnValue({
      data: undefined,
      isError: false,
      refetch: jest.fn(),
    });
    await renderHome();
    expect(
      screen.getAllByTestId('skeleton', { includeHiddenElements: true }).length,
    ).toBeGreaterThan(0);
  });
});

describe('"I\'m here" (docs/spec/10)', () => {
  test('a guest is offered it and gated, never silently refused', async () => {
    await renderHome();
    await fireEvent.press(screen.getByRole('button', { name: "I'm here" }));
    expect(screen.getByText("Sign in to say you're here")).toBeOnTheScreen();
    // Nothing was written on a guest's behalf.
    expect(Object.keys(useWriteQueueStore.getState().queue)).toHaveLength(0);
  });

  test('the gate remembers the branch, so signing in checks in where they stood', async () => {
    await renderHome();
    await fireEvent.press(screen.getByRole('button', { name: "I'm here" }));
    // Two controls read "Sign in" for a guest: the Join card's and the gate
    // sheet's. The sheet renders over Home, so it is the last one.
    const signIn = screen.getAllByRole('button', { name: 'Sign in' });
    await fireEvent.press(signIn[signIn.length - 1]);
    expect(useGateStore.getState().pending).toEqual({
      kind: 'im_here',
      branchId: GLASGOW,
    });
    expect(mockPush).toHaveBeenCalledWith('/auth');
  });

  test("a member's tap queues one write, carrying the branch", async () => {
    signIn();
    await renderHome();
    await fireEvent.press(screen.getByRole('button', { name: "I'm here" }));
    const queued = Object.values(useWriteQueueStore.getState().queue);
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ kind: 'attendance', state: GLASGOW });
  });

  test('a second tap the same day is still one write (docs/spec/10 idempotence)', async () => {
    signIn();
    await renderHome();
    const button = screen.getByRole('button', { name: "I'm here" });
    await fireEvent.press(button);
    await fireEvent.press(button);
    expect(Object.values(useWriteQueueStore.getState().queue)).toHaveLength(1);
  });

  test('already checked in: the action quietens instead of standing there', async () => {
    signIn();
    mockRhythm.mockReturnValue({
      data: rhythmRow({ checkedIn: true }),
      isError: false,
      refetch: jest.fn(),
    });
    await renderHome();
    expect(screen.queryByRole('button', { name: "I'm here" })).toBeNull();
    expect(
      screen.getByLabelText("You're here. Checked in for today."),
    ).toBeOnTheScreen();
  });

  test('no service today: no check-in offered at all', async () => {
    signIn();
    mockServices.mockReturnValue({
      data: [
        {
          weekday: 3,
          start_time: '18:00:00',
          duration_min: 90,
          kind: 'midweek',
          label: '',
        },
      ],
      isError: false,
      refetch: jest.fn(),
    });
    await renderHome();
    expect(screen.queryByRole('button', { name: "I'm here" })).toBeNull();
  });

  test('browsing another branch says where the tap will count', async () => {
    // Home branch Berlin, browsing Glasgow (docs/spec/07: attendance follows the
    // branch you are standing in).
    signIn(BERLIN);
    await renderHome();
    expect(screen.getByText(/Visiting AGBC Glasgow today/)).toBeOnTheScreen();
  });

  test('at their own branch the card says nothing about visiting', async () => {
    signIn(GLASGOW);
    await renderHome();
    expect(screen.queryByText(/Visiting/)).toBeNull();
  });
});
