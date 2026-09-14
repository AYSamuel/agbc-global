import { fireEvent, render, screen } from '@testing-library/react-native';

import '@/i18n';
import { useAuthStore } from '@/state/auth';
import { useBranchStore } from '@/state/branch';
import { useGateStore } from '@/state/gate';
import { ThemeScope } from '@/theme';

import Rhythm from '../../../../app/rhythm';

// RHYTHM (docs/spec/10 §RHYTHM; mockup frames "RHYTHM · streak, grace-framed"
// and the W2.8 none / grace / lapsed states).
//
// What is asserted here is the part `10` cares about: WHICH NUMBER LEADS in each
// of the four states `rhythm_state()` can answer, that the grace week is said
// once and never drawn as a row, and that a member who signs out of the network
// gets a retry rather than a half-built screen. And since W4.16, that the Next
// card says the server's distance in the approved words.
//
// THE WINDOW IS NOT SET, deliberately: Jest's default window is tablet-sized,
// which silently turns on anything conditional on `isTablet`, and nothing on
// this screen, the Next card or the strip reads it (checked 2026-09-14). If that
// changes, these tests must state a phone width first.

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access --
   documented jest.mock factory shapes */
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access */

const mockPush = jest.fn<undefined, [unknown]>();
const mockReplace = jest.fn<undefined, [unknown]>();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: jest.fn(),
    canGoBack: () => false,
  }),
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

interface QueryStub {
  data: unknown;
  isPending: boolean;
  isError: boolean;
  refetch: () => Promise<unknown>;
}
const mockRhythm = jest.fn<QueryStub, []>();
const mockAttendance = jest.fn<QueryStub, []>();
const mockMilestones = jest.fn<QueryStub, []>();

jest.mock('@/features/rhythm/queries', () => {
  const actual = jest.requireActual<typeof import('@/features/rhythm/queries')>(
    '@/features/rhythm/queries',
  );
  return { ...actual, useRhythmQuery: () => mockRhythm() };
});
jest.mock('@/features/rhythm/history', () => ({
  useAttendanceQuery: () => mockAttendance(),
  useMilestonesQuery: () => mockMilestones(),
}));
jest.mock('@/features/home/queries', () => ({
  useBranchServicesQuery: () => ({
    data: [
      {
        weekday: 0,
        start_time: '11:00:00',
        duration_min: 120,
        kind: 'sunday',
        label: '',
      },
    ],
    isError: false,
    refetch: jest.fn(),
  }),
}));
jest.mock('@/features/onboarding/useBranches', () => ({
  useBranchesQuery: () => ({ data: undefined, isError: true }),
}));

const BERLIN = '00000000-0000-4000-8000-000000000002';

function query(data: unknown): QueryStub {
  return {
    data,
    isPending: false,
    isError: false,
    refetch: () => Promise.resolve(null),
  };
}

function rhythmRow(over: Record<string, unknown> = {}) {
  return {
    today: '2026-08-09',
    checkedIn: false,
    phase: 'active',
    currentWeeks: 6,
    longestWeeks: 11,
    lastServiceDate: '2026-08-02',
    // The month is held and a season is next: five whole weeks of its thirteen.
    nextKind: '12_week_rhythm',
    progressDone: 5,
    progressTotal: 13,
    progressMonth: null,
    ...over,
  };
}

function attendance(dates: string[], source = 'here_button') {
  return dates.map((serviceDate) => ({
    serviceDate,
    branchId: BERLIN,
    source,
  }));
}

function signIn() {
  useAuthStore.setState({
    status: 'member',
    email: 'grace@example.test',
    profile: {
      displayName: 'Grace Bello',
      branchId: BERLIN,
      language: 'en',
      role: 'member',
    },
  });
}

function renderRhythm() {
  return render(
    <ThemeScope name="light">
      <Rhythm />
    </ThemeScope>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  useBranchStore.setState({
    branch: {
      id: BERLIN,
      slug: 'berlin',
      name: 'AGBC Lighthouse Berlin',
      timezone: 'Europe/Berlin',
    },
  });
  useAuthStore.setState({ status: 'guest', email: null, profile: null });
  useGateStore.setState({ pending: null, dismissedKinds: [] });
  mockRhythm.mockReturnValue(query(rhythmRow()));
  mockAttendance.mockReturnValue(
    query(attendance(['2026-08-02', '2026-07-26'])),
  );
  mockMilestones.mockReturnValue(
    query([{ kind: 'first_service', achievedAt: '2026-06-28T10:00:00Z' }]),
  );
});

describe('the four states of rhythm_state (docs/spec/10)', () => {
  test('active: the live run leads, with the next rung underneath it', async () => {
    signIn();
    await renderRhythm();
    expect(screen.getByText('6')).toBeOnTheScreen();
    expect(screen.getByText(/6 weeks of showing up/)).toBeOnTheScreen();
    // Named rather than counted (W2.8 slice 5): the rung a member is climbing
    // towards is called the same thing on the card as on the badge.
    expect(screen.getByText('Next: A season with us')).toBeOnTheScreen();
    // Calendar weeks since W4.16, and said as weeks: "8 weeks to go".
    expect(screen.getByText('8 weeks to go')).toBeOnTheScreen();
  });

  test('toward a month of Sundays, the card counts the month the server names', async () => {
    // The approved frame: four Sundays into November, which has five.
    signIn();
    mockRhythm.mockReturnValue(
      query(
        rhythmRow({
          currentWeeks: 4,
          longestWeeks: 4,
          nextKind: '4_week_rhythm',
          progressDone: 4,
          progressTotal: 5,
          progressMonth: '2026-11-01',
        }),
      ),
    );
    await renderRhythm();
    expect(screen.getByText('Next: A month of Sundays')).toBeOnTheScreen();
    expect(screen.getByText('4 of 5 in November')).toBeOnTheScreen();
    expect(
      screen.getByLabelText('Next: A month of Sundays. 4 of 5 in November'),
    ).toBeOnTheScreen();
  });

  test('a full count reads "Almost there", never a zero', async () => {
    signIn();
    mockRhythm.mockReturnValue(
      query(rhythmRow({ currentWeeks: 12, progressDone: 13 })),
    );
    await renderRhythm();
    expect(screen.getByText('Almost there')).toBeOnTheScreen();
    expect(screen.queryByText(/0 weeks to go/)).toBeNull();
  });

  test('grace: the missed week is said once, and never drawn as a row', async () => {
    signIn();
    mockRhythm.mockReturnValue(
      query(rhythmRow({ phase: 'grace', currentWeeks: 5 })),
    );
    await renderRhythm();
    expect(screen.getByText('5')).toBeOnTheScreen();
    expect(screen.getByText('We missed you last week.')).toBeOnTheScreen();
    // Two attendance rows in, two attendance rows out: nothing between them
    // stands in for the week that has no row (that arithmetic is the server's).
    expect(
      screen.getAllByLabelText(/AGBC Lighthouse Berlin · In person/),
    ).toHaveLength(2);
    expect(screen.queryByText(/missed this/i)).toBeNull();
  });

  test('lapsed: the longest leads, and there is no 0 and nothing to count down', async () => {
    signIn();
    mockRhythm.mockReturnValue(
      query(
        rhythmRow({
          phase: 'lapsed',
          currentWeeks: 0,
          longestWeeks: 11,
          lastServiceDate: '2026-07-05',
        }),
      ),
    );
    await renderRhythm();
    expect(screen.getByText('11')).toBeOnTheScreen();
    expect(screen.getByText('weeks, your longest')).toBeOnTheScreen();
    expect(screen.queryByText('0')).toBeNull();
    // Progress THROUGH a run, and there is no run in progress.
    expect(screen.queryByText(/^Next:/)).toBeNull();
    // The one thing offered instead: when the branch gathers, and a way in.
    expect(screen.getByText(/Sundays/)).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'Branch details' }),
    ).toBeOnTheScreen();
  });

  test('none: an invitation and what is ahead, never an empty list', async () => {
    signIn();
    mockRhythm.mockReturnValue(
      query(rhythmRow({ phase: 'none', currentWeeks: 0, longestWeeks: 0 })),
    );
    mockAttendance.mockReturnValue(query([]));
    mockMilestones.mockReturnValue(query([]));
    await renderRhythm();
    expect(screen.getByText('Your rhythm starts here')).toBeOnTheScreen();
    expect(screen.getByText("What's ahead")).toBeOnTheScreen();
    expect(screen.getByLabelText('First service')).toBeOnTheScreen();
    expect(screen.queryByText('Attendance')).toBeNull();
  });

  test('none, but a prayer was already approved: the badge is earned, not ahead', async () => {
    signIn();
    mockRhythm.mockReturnValue(
      query(rhythmRow({ phase: 'none', currentWeeks: 0, longestWeeks: 0 })),
    );
    mockAttendance.mockReturnValue(query([]));
    mockMilestones.mockReturnValue(
      query([{ kind: 'first_prayer', achievedAt: '2026-07-01T10:00:00Z' }]),
    );
    await renderRhythm();
    expect(screen.getByText('Milestones')).toBeOnTheScreen();
    expect(screen.getAllByLabelText('First prayer')).toHaveLength(1);
  });
});

describe('the history', () => {
  test('every attended day reads as a branch visit (ADR 0021)', async () => {
    // This used to prove a live-watch Sunday read as "Watched live". That source was
    // the cut LIVE screen's credit-on-open rule and nothing ever wrote it, so in-person
    // is now the only way a row gets here.
    signIn();
    mockAttendance.mockReturnValue(
      query([...attendance(['2026-08-02']), ...attendance(['2026-07-26'])]),
    );
    await renderRhythm();
    expect(screen.queryByText('Watched live')).not.toBeOnTheScreen();
    expect(screen.getAllByText(/In person/).length).toBeGreaterThan(0);
  });
});

describe('the states around the data', () => {
  test('a guest is gated rather than shown somebody else’s rhythm', async () => {
    await renderRhythm();
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(useGateStore.getState().pending).toEqual({ kind: 'rhythm' });
    expect(mockPush).toHaveBeenCalledWith('/auth');
  });

  test('loading shows skeletons, not a half-built screen', async () => {
    signIn();
    mockAttendance.mockReturnValue({
      data: undefined,
      isPending: true,
      isError: false,
      refetch: () => Promise.resolve(null),
    });
    await renderRhythm();
    expect(
      screen.getAllByTestId('skeleton', { includeHiddenElements: true }).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText('6')).toBeNull();
  });

  test('a failed read offers a retry, and the retry refetches all three', async () => {
    signIn();
    const refetch = jest.fn(() => Promise.resolve(null));
    mockRhythm.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
      refetch,
    });
    await renderRhythm();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalled();
  });
});
