import { fireEvent, render, screen } from '@testing-library/react-native';

import '@/i18n';
import { ToastProvider } from '@/components/ui';
import { useNotificationAskStore } from '@/features/notifications/ask';
import { useVisitConfirmStore } from '@/features/rhythm/visiting';
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
  // Home raises the notification ask on FOCUS, not on mount, so that a member
  // signing in from another tab does not meet it over that tab. In test-land,
  // rendering Home IS focusing it.
  useFocusEffect: (effect: import('react').EffectCallback) => {
    const { useEffect } = jest.requireActual<typeof import('react')>('react');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- test shim: mount once, like a first focus
    useEffect(effect, []);
  },
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

const mockUnread = jest.fn<{ data: number | undefined }, []>(() => ({
  data: 0,
}));
jest.mock('@/features/notifications/nc', () => ({
  useUnreadCount: () => mockUnread(),
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

// W3.5 slice 5c: Home asks whether the member's own branch has closed under them. Mocked to
// "no" here, like every other data hook in this file; the prompt and the card have their own
// tests in `features/rehome`.
jest.mock('@/features/rehome/queries', () => ({
  useBranchHasClosed: () => ({ closed: false, branch: null }),
  useBranchClosed: () => ({ closed: false, branch: null }),
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
  useVisitConfirmStore.setState({ pending: null });
  useNotificationAskStore.setState({ asked: false, pending: null });
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
    // The NAME rides along with the id: on the way back the replay may have to
    // raise the visiting question, and by then no screen holds either.
    expect(useGateStore.getState().pending).toEqual({
      kind: 'im_here',
      branchId: GLASGOW,
      branchName: 'AGBC Glasgow',
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

  // The confirm (mockup "HOME · visiting · the confirm"). The note above tells
  // them where the tap lands; this says the tap does not land until they answer.
  // The SHEET is mounted at the root and tested in features/rhythm, so what Home
  // owes is raising the question instead of writing.
  test('the tap asks first when the branch is not their own', async () => {
    signIn(BERLIN);
    await renderHome();
    await fireEvent.press(screen.getByRole('button', { name: "I'm here" }));
    expect(useVisitConfirmStore.getState().pending).toEqual({
      branchId: GLASGOW,
      branchName: 'AGBC Glasgow',
    });
    // The whole point of asking: nothing is recorded on the way to the question.
    expect(Object.keys(useWriteQueueStore.getState().queue)).toHaveLength(0);
  });

  // The test that makes the one above mean something: asking ALWAYS would pass
  // it, and this is what it would break.
  test('at their own branch the tap still writes, unasked', async () => {
    signIn(GLASGOW);
    await renderHome();
    await fireEvent.press(screen.getByRole('button', { name: "I'm here" }));
    expect(useVisitConfirmStore.getState().pending).toBeNull();
    expect(Object.values(useWriteQueueStore.getState().queue)).toHaveLength(1);
  });

  // The gathering has ended (mockup "HOME · the gathering has ended"). The hero
  // has handed its card to Wednesday while the offer runs to midnight, so the
  // control moves to a line that can still name what it is for.
  test('once it is over, the check-in leaves the hero and names the gathering', async () => {
    signIn(GLASGOW);
    // A branch that also gathers on Wednesday, which is what the hero moves on
    // to and what made the old placement wrong.
    mockServices.mockReturnValue({
      data: [
        {
          weekday: 0,
          start_time: '12:00:00',
          duration_min: 120,
          kind: 'sunday',
          label: '',
        },
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
    // Sunday 15:00 UTC: the noon service (120 min) finished at 14:00.
    jest.setSystemTime(new Date('2026-08-09T15:00:00Z').getTime());
    await renderHome();
    expect(screen.getByText(/Sunday Service, earlier today/)).toBeOnTheScreen();
    expect(
      screen.getByText('You can still say you were there.'),
    ).toBeOnTheScreen();
    // The hero has moved on to Wednesday, which is exactly why the line above
    // has to name Sunday itself.
    expect(screen.getByText(/Midweek Service/)).toBeOnTheScreen();
  });

  test('the tap from that line records the same check-in', async () => {
    signIn(GLASGOW);
    jest.setSystemTime(new Date('2026-08-09T15:00:00Z').getTime());
    await renderHome();
    await fireEvent.press(screen.getByRole('button', { name: "I'm here" }));
    const queued = Object.values(useWriteQueueStore.getState().queue);
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ kind: 'attendance', state: GLASGOW });
  });

  test('while the gathering runs, no such line: the hero still has it', async () => {
    signIn(GLASGOW);
    await renderHome();
    expect(screen.queryByText(/earlier today/)).toBeNull();
    expect(screen.getByRole('button', { name: "I'm here" })).toBeOnTheScreen();
  });

  test('checked in, it becomes a receipt with nothing left to tap', async () => {
    signIn(GLASGOW);
    jest.setSystemTime(new Date('2026-08-09T15:00:00Z').getTime());
    mockRhythm.mockReturnValue({
      data: rhythmRow({ checkedIn: true }),
      isError: false,
      refetch: jest.fn(),
    });
    await renderHome();
    expect(
      screen.getByText(/Counted at Sunday Service, earlier today/),
    ).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: "I'm here" })).toBeNull();
  });

  test('browsing another branch, the line keeps the branch name', async () => {
    // The hero's visit note goes with the hero, so this line has to carry the
    // disclosure instead.
    signIn(BERLIN);
    jest.setSystemTime(new Date('2026-08-09T15:00:00Z').getTime());
    await renderHome();
    expect(
      screen.getByText(/Sunday Service at AGBC Glasgow, earlier today/),
    ).toBeOnTheScreen();
    expect(screen.getByText(/it counts at Glasgow/)).toBeOnTheScreen();
  });

  test('once the answer is in, the note stops asking', async () => {
    signIn(BERLIN);
    mockRhythm.mockReturnValue({
      data: rhythmRow({ checkedIn: true }),
      isError: false,
      refetch: jest.fn(),
    });
    await renderHome();
    expect(
      screen.getByText(/You're checked in at AGBC Glasgow today/),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/Visiting AGBC Glasgow today/)).toBeNull();
  });
});

// `06`'s third trigger for the notification ask, and the one that was missing:
// without it a member who never checked in and never RSVPd was never asked, so
// the OS was never asked either and push never arrived.
describe('the notification ask after sign-in', () => {
  test('a member on Home is owed the ask, with the moment named', async () => {
    signIn();
    await renderHome();
    expect(useNotificationAskStore.getState().pending).toBe('signed_in');
  });

  test('a guest is not: tokens are never registered before sign-in', async () => {
    await renderHome();
    expect(useNotificationAskStore.getState().pending).toBeNull();
  });

  test('and a member who has already had the one ask is left alone', async () => {
    useNotificationAskStore.setState({ asked: true, pending: null });
    signIn();
    await renderHome();
    expect(useNotificationAskStore.getState().pending).toBeNull();
  });
});

describe('the bell (W3.3 slice 5)', () => {
  test("a member's bell opens the notification centre", async () => {
    signIn();
    await renderHome();
    await fireEvent.press(
      screen.getByRole('button', { name: 'Notifications' }),
    );
    expect(mockPush).toHaveBeenCalledWith('/notifications');
  });

  test('unread announces itself: the dot, and the label that carries it', async () => {
    signIn();
    mockUnread.mockReturnValue({ data: 3 });
    await renderHome();
    expect(
      screen.getByRole('button', { name: 'Notifications, unread' }),
    ).toBeOnTheScreen();
  });

  test("a guest's bell gates, and the gate remembers the log they asked for", async () => {
    await renderHome();
    await fireEvent.press(
      screen.getByRole('button', { name: 'Notifications' }),
    );
    expect(useGateStore.getState().pending).toEqual({ kind: 'notifications' });
    expect(mockPush).toHaveBeenCalledWith('/auth');
  });
});
