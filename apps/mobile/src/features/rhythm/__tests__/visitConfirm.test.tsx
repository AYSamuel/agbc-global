import { fireEvent, render, screen } from '@testing-library/react-native';

import '@/i18n';
import { ToastProvider } from '@/components/ui';
import { useWriteQueueStore } from '@/lib/writeQueue';
import { useAuthStore } from '@/state/auth';
import { useBranchStore } from '@/state/branch';
import { ThemeScope } from '@/theme';

import { VisitConfirm } from '../VisitConfirm';
import { useVisitConfirmStore } from '../visiting';

// The visiting confirm (mockup "HOME · visiting · the confirm"). Three taps can
// raise this question and none of them writes; this sheet is where the write
// lives, so this is where the answers are asserted.

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access --
   documented jest.mock factory shapes */
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access */

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => undefined } },
      }),
    },
  },
}));

// isError falls the list back to the bundled snapshot, which carries the same
// ids as the seed (features/onboarding/branchList).
const mockBranches = jest.fn<{ data: undefined; isError: boolean }, []>(() => ({
  data: undefined,
  isError: true,
}));
jest.mock('@/features/onboarding/useBranches', () => ({
  useBranchesQuery: () => mockBranches(),
}));

const GLASGOW = '00000000-0000-4000-8000-000000000001';
const BERLIN = '00000000-0000-4000-8000-000000000002';

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

function asking(branchId = GLASGOW, branchName = 'AGBC Glasgow') {
  useVisitConfirmStore.setState({ pending: { branchId, branchName } });
}

function renderSheet() {
  return render(
    <ThemeScope name="light">
      <ToastProvider>
        <VisitConfirm />
      </ToastProvider>
    </ThemeScope>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ status: 'guest', email: null, profile: null });
  useVisitConfirmStore.setState({ pending: null });
  useBranchStore.setState({
    branch: {
      id: GLASGOW,
      slug: 'glasgow',
      name: 'AGBC Glasgow',
      timezone: 'Europe/London',
    },
  });
  useWriteQueueStore.setState({ queue: {}, handlers: null, draining: false });
});

describe('the visiting confirm', () => {
  test('nothing is on screen while nothing is being asked', async () => {
    signIn(BERLIN);
    await renderSheet();
    expect(screen.queryByText(/^Are you at/)).toBeNull();
  });

  test('it names the branch the check-in would go to', async () => {
    signIn(BERLIN);
    asking();
    await renderSheet();
    expect(screen.getByText('Are you at AGBC Glasgow?')).toBeOnTheScreen();
    // The sentence that makes the question worth asking: one a day, and it stays
    // where it is put.
    expect(screen.getByText(/You have one a day/)).toBeOnTheScreen();
  });

  test('yes records the check-in at that branch, and closes the question', async () => {
    signIn(BERLIN);
    asking();
    await renderSheet();
    await fireEvent.press(
      screen.getByRole('button', { name: "Yes, I'm here" }),
    );
    const queued = Object.values(useWriteQueueStore.getState().queue);
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({ kind: 'attendance', state: GLASGOW });
    expect(useVisitConfirmStore.getState().pending).toBeNull();
  });

  test('the refusal writes nothing and hands back their own branch', async () => {
    signIn(BERLIN);
    asking();
    await renderSheet();
    await fireEvent.press(
      screen.getByRole('button', { name: "No, I'm at Berlin" }),
    );
    expect(Object.keys(useWriteQueueStore.getState().queue)).toHaveLength(0);
    // The chip becomes their own branch: Home is a front page again, rather than
    // somebody else's with their service behind a switcher.
    expect(useBranchStore.getState().branch?.id).toBe(BERLIN);
    expect(useVisitConfirmStore.getState().pending).toBeNull();
  });

  test('a home branch nobody can name still gets a plain way to say no', async () => {
    // Not reachable with the bundled list, and the sheet must still offer both
    // answers if it ever is: a question with only a "yes" is not a question.
    signIn('00000000-0000-4000-8000-00000000ffff');
    asking();
    await renderSheet();
    expect(
      screen.getByRole('button', { name: "No, I'm not there" }),
    ).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', { name: "No, I'm not there" }),
    );
    expect(Object.keys(useWriteQueueStore.getState().queue)).toHaveLength(0);
    expect(useVisitConfirmStore.getState().pending).toBeNull();
  });
});
