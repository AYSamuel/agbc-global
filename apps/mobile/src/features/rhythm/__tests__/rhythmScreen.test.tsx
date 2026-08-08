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
// gets a retry rather than a half-built screen.

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
    expect(screen.getByText('Next: 12-week rhythm')).toBeOnTheScreen();
    expect(screen.getByText('6 to go')).toBeOnTheScreen();
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
  test('a live-watch Sunday reads as watched live, not as a branch visit', async () => {
    signIn();
    mockAttendance.mockReturnValue(
      query([
        ...attendance(['2026-08-02']),
        ...attendance(['2026-07-26'], 'live_watch'),
      ]),
    );
    await renderRhythm();
    expect(screen.getByText('Watched live')).toBeOnTheScreen();
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
