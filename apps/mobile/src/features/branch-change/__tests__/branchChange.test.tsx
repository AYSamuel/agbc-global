import { fireEvent, render } from '@testing-library/react-native';

import { ToastProvider } from '@/components/ui';
import i18n from '@/i18n';
import { ThemeScope } from '@/theme';

import { mapAskError } from '../askErrors';
import { cooldownUntil } from '../cooldown';
import type { BranchChangeState } from '../queries';

import ProfileScreen from '../../../../app/settings/profile';

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access --
   documented jest.mock factory shapes */
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access */

// The screen's import graph reaches the real Supabase client, which refuses to build
// without env (the same stub the family screen tests use). Nothing here talks to it: the
// data hooks are all mocked below.
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => undefined } },
      }),
    },
    from: () => ({}),
  },
}));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
}));

const GLASGOW = 'branch-glasgow';
const BERLIN = 'branch-berlin';

interface ProfileResult {
  data?: { displayName: string; branchId: string; joinedAt: string };
  isPending: boolean;
}
const mockProfile = jest.fn<ProfileResult, []>();
jest.mock('@/features/profile/queries', () => ({
  useMyProfile: () => mockProfile(),
}));

interface RequestsResult {
  data?: BranchChangeState;
  isPending: boolean;
}
const mockRequests = jest.fn<RequestsResult, []>();
// Mocked wholesale: the real module builds a Supabase client at import time, and this
// file is about the screen and the pure settle calculation, neither of which needs one.
jest.mock('../queries', () => ({
  useMyBranchRequests: () => mockRequests(),
}));

const mockCancel = jest.fn();
jest.mock('../useAskToJoin', () => ({
  useCancelRequest: () => ({ mutate: mockCancel, isPending: false }),
}));

// Profile reads the branch list for the refused branch's published contact address.
jest.mock('@/features/onboarding/useBranches', () => ({
  useBranchesQuery: () => ({
    data: [
      {
        id: 'branch-berlin',
        name: 'AGBC Lighthouse Berlin',
        email: 'agbc.lighthouse@gmail.com',
      },
    ],
    isError: false,
  }),
}));

jest.mock('@/features/family/useBranchNames', () => ({
  useBranchNames: () => ({
    'branch-glasgow': 'AGBC Glasgow',
    'branch-berlin': 'AGBC Lighthouse Berlin',
  }),
}));

/**
 * Awaited, and that is not a style choice: with React 19 this RNTL renders concurrently
 * and `render` hands back a promise. Calling it without awaiting leaves the queries
 * unresolved and `screen` empty, which reads as "render function has not been called"
 * rather than as anything to do with the screen (2026-08-01).
 */
async function renderProfile() {
  return await render(
    <ThemeScope name="light">
      <ToastProvider>
        <ProfileScreen />
      </ToastProvider>
    </ThemeScope>,
  );
}

const SETTLED: BranchChangeState = {
  pending: null,
  lastApproved: null,
  lastRejected: null,
};

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

beforeEach(() => {
  jest.clearAllMocks();
  mockProfile.mockReturnValue({
    data: {
      displayName: 'Ayo Samuel',
      branchId: GLASGOW,
      joinedAt: '2024-03-04T10:00:00.000Z',
    },
    isPending: false,
  });
  mockRequests.mockReturnValue({ data: SETTLED, isPending: false });
});

describe('Profile, settled', () => {
  test('shows who they are and which branch is theirs', async () => {
    const view = await renderProfile();

    expect(view.getByText('Ayo Samuel')).toBeTruthy();
    expect(view.getByText('AGBC Glasgow · Member since 2024')).toBeTruthy();
    expect(view.getByText('AGBC Glasgow')).toBeTruthy();
  });

  test('the home branch row is the way to the picker', async () => {
    const view = await renderProfile();

    await fireEvent.press(view.getByText('Home branch'));

    expect(mockPush).toHaveBeenCalledWith('/settings/branch');
  });
});

describe('Profile, awaiting', () => {
  beforeEach(() => {
    mockRequests.mockReturnValue({
      data: {
        ...SETTLED,
        pending: {
          id: 'request-1',
          toBranchId: BERLIN,
          fromBranchId: GLASGOW,
          status: 'pending',
          createdAt: '2026-08-01T09:00:00.000Z',
          decidedAt: null,
        },
      },
      isPending: false,
    });
  });

  test('names the branch deciding, and says the home branch has not moved', async () => {
    const view = await renderProfile();

    expect(view.getByText('Awaiting')).toBeTruthy();
    expect(view.getByText('Asked to join')).toBeTruthy();
    expect(view.getByText('AGBC Lighthouse Berlin')).toBeTruthy();
    // The row still reads Glasgow: `profiles.branch_id` is untouched until a leader
    // approves, and the screen must not imply otherwise.
    expect(view.getByText('AGBC Glasgow')).toBeTruthy();
    expect(
      view.getByText(
        'AGBC Glasgow stays your home branch until they confirm, so your reminders and events do not change yet.',
      ),
    ).toBeTruthy();
  });

  test('the row stops being a way in while a request is open', async () => {
    const view = await renderProfile();

    await fireEvent.press(view.getByText('Home branch'));

    // Asking again is refused by the one-open-request index, so the picker would be a
    // dead end. Nothing navigates.
    expect(mockPush).not.toHaveBeenCalled();
  });

  test('cancelling asks the server to withdraw the request', async () => {
    const view = await renderProfile();

    await fireEvent.press(view.getByText('Cancel request'));

    expect(mockCancel).toHaveBeenCalledWith('request-1', expect.anything());
  });
});

describe('the 90-day settle', () => {
  test('is measured from the last COMPLETED move, not the last decision', () => {
    const twentyDaysAgo = new Date(
      Date.now() - 20 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const until = cooldownUntil({
      pending: null,
      lastRejected: null,
      lastApproved: {
        id: 'r',
        toBranchId: BERLIN,
        fromBranchId: GLASGOW,
        status: 'approved',
        createdAt: twentyDaysAgo,
        decidedAt: twentyDaysAgo,
      },
    });

    expect(until).not.toBeNull();
    // 90 days from the move, so about 70 days from now.
    const daysAway = Math.round(
      ((until?.getTime() ?? 0) - Date.now()) / (24 * 60 * 60 * 1000),
    );
    expect(daysAway).toBe(70);
  });

  test('a refusal starts no settle at all, so a leader’s mistake is fixable today', () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const until = cooldownUntil({
      pending: null,
      lastApproved: null,
      lastRejected: {
        id: 'r',
        toBranchId: BERLIN,
        fromBranchId: GLASGOW,
        status: 'rejected',
        createdAt: yesterday,
        decidedAt: yesterday,
      },
    });

    expect(until).toBeNull();
  });

  test('an old move has settled and no longer holds anyone back', () => {
    const longAgo = new Date(
      Date.now() - 200 * 24 * 60 * 60 * 1000,
    ).toISOString();

    expect(
      cooldownUntil({
        pending: null,
        lastRejected: null,
        lastApproved: {
          id: 'r',
          toBranchId: BERLIN,
          fromBranchId: GLASGOW,
          status: 'approved',
          createdAt: longAgo,
          decidedAt: longAgo,
        },
      }),
    ).toBeNull();
  });
});

describe('what a refused write is called', () => {
  test.each([
    ['a branch change is available again from 2026-08-12', 'errorTooSoon'],
    ['that is already your home branch', 'errorSameBranch'],
    ['that branch is not accepting members', 'errorBranchClosed'],
  ])('%s', (message, expected) => {
    expect(mapAskError({ message, code: '23514' })).toBe(expected);
  });

  test('the one-open-request index speaks through its code, not a message', () => {
    expect(mapAskError({ code: '23505', message: 'duplicate key value' })).toBe(
      'errorAlreadyAsked',
    );
  });

  test('a request that never left the phone is called offline', () => {
    expect(mapAskError(new TypeError('Network request failed'))).toBe(
      'errorOffline',
    );
  });

  test('anything unrecognised is honest about being unknown', () => {
    expect(mapAskError({ code: 'XX000', message: 'boom' })).toBe(
      'errorGeneric',
    );
  });
});
