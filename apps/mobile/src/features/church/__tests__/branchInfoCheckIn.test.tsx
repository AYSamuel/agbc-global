import { fireEvent, render, screen } from '@testing-library/react-native';

import '@/i18n';
import { ToastProvider } from '@/components/ui';
import { useVisitConfirmStore } from '@/features/rhythm/visiting';
import { useWriteQueueStore } from '@/lib/writeQueue';
import { useAuthStore } from '@/state/auth';
import { useGateStore } from '@/state/gate';
import { ThemeScope } from '@/theme';

import BranchInfo from '../../../../app/branch/[id]';

// BRANCH-INFO's check-in (docs/spec/04, 10). The screen matters here because it
// is the one place a member can reach ANY branch's "I'm here" without the
// browsing chip being involved at all: they opened this branch's page from the
// list or the map. So it asks the same visiting question Home asks, and its
// refusal is a plain one, because closing the sheet leaves them exactly where
// they meant to be.

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access --
   documented jest.mock factory shapes */
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access */

const GLASGOW = '00000000-0000-4000-8000-000000000001';
const BERLIN = '00000000-0000-4000-8000-000000000002';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: '00000000-0000-4000-8000-000000000002' }),
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

jest.mock('@/features/church/queries', () => ({
  useBranchDetailQuery: () => ({
    data: {
      id: '00000000-0000-4000-8000-000000000002',
      slug: 'berlin',
      name: 'AGBC Lighthouse Berlin',
      city: 'Berlin',
      country: 'Germany',
      is_hq: false,
      timezone: 'Europe/Berlin',
      languages: 'English, German',
      email: 'berlin@example.test',
      lat: 52.55,
      lng: 13.36,
      service_times: { sunday: 'Sundays 11:00' },
      address: { line1: 'Oudenarder Str. 16', line2: '13347 Berlin' },
      lead: null,
      leaders: [],
      welcome: 'You are welcome here.',
    },
    isError: false,
  }),
}));

// Spread the real module: `localDateKey` lives here too, and the check-in's own
// queue lookup calls it.
jest.mock('@/features/home/queries', () => {
  const actual = jest.requireActual<typeof import('@/features/home/queries')>(
    '@/features/home/queries',
  );
  return {
    ...actual,
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
  };
});

// Spread again, for the same reason: `rhythmQueryKey` lives here and the tap's
// optimistic cache patch calls it.
jest.mock('@/features/rhythm/queries', () => {
  const actual = jest.requireActual<typeof import('@/features/rhythm/queries')>(
    '@/features/rhythm/queries',
  );
  return {
    ...actual,
    useRhythmQuery: () => ({ data: { checkedIn: false }, isError: false }),
  };
});

// Sunday 09 August 2026, 10:30 UTC: half an hour into Berlin's 11:00 service on
// its own clock, so the check-in is open (features/home/nextService).
const DURING_SERVICE = new Date('2026-08-09T09:30:00Z').getTime();

function signIn(branchId: string) {
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

function renderScreen() {
  return render(
    <ThemeScope name="light">
      <ToastProvider>
        <BranchInfo />
      </ToastProvider>
    </ThemeScope>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers().setSystemTime(DURING_SERVICE);
  useAuthStore.setState({ status: 'guest', email: null, profile: null });
  useVisitConfirmStore.setState({ pending: null });
  useGateStore.setState({ pending: null, dismissedKinds: [] });
  useWriteQueueStore.setState({ queue: {}, handlers: null, draining: false });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('BRANCH-INFO\'s "I\'m here"', () => {
  test('a member reading their own branch checks in with one tap', async () => {
    signIn(BERLIN);
    await renderScreen();
    await fireEvent.press(screen.getByRole('button', { name: "I'm here" }));
    const queued = Object.values(useWriteQueueStore.getState().queue);
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ kind: 'attendance', state: BERLIN });
  });

  // The SHEET is mounted at the root (features/rhythm/VisitConfirm) and tested
  // there; what this screen owes is raising the question, with the name, instead
  // of writing.
  test("another branch's page asks before it writes", async () => {
    signIn(GLASGOW);
    await renderScreen();
    await fireEvent.press(screen.getByRole('button', { name: "I'm here" }));
    expect(useVisitConfirmStore.getState().pending).toEqual({
      branchId: BERLIN,
      branchName: 'AGBC Lighthouse Berlin',
    });
    expect(Object.keys(useWriteQueueStore.getState().queue)).toHaveLength(0);
  });

  test('the gate from here carries the branch and its name', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByRole('button', { name: "I'm here" }));
    const signInButtons = screen.getAllByRole('button', { name: 'Sign in' });
    await fireEvent.press(signInButtons[signInButtons.length - 1]);
    expect(useGateStore.getState().pending).toEqual({
      kind: 'im_here',
      branchId: BERLIN,
      branchName: 'AGBC Lighthouse Berlin',
    });
  });
});
