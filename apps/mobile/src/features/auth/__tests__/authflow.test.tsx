import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { AuthApiError } from '@supabase/supabase-js';

import '@/i18n';
import { ToastProvider } from '@/components/ui';
import { ThemeScope } from '@/theme';
import { useAuthStore } from '@/state/auth';
import { useBranchStore } from '@/state/branch';
import { useWriteQueueStore } from '@/lib/writeQueue';
import { useGateStore } from '@/state/gate';

import { AuthFlow } from '../AuthFlow';

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access --
   documented jest.mock factory shapes */
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access */

const mockBack = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    replace: mockReplace,
    push: jest.fn(),
    canGoBack: () => true,
  }),
}));

jest.mock('expo-localization', () => ({
  getLocales: jest.fn(() => [{ languageCode: 'en' }]),
}));

const mockSignInWithOtp = jest.fn<Promise<{ error: unknown }>, [unknown]>();
const mockVerifyOtp = jest.fn<Promise<{ error: unknown }>, [unknown]>();
const mockGetSession = jest.fn<Promise<unknown>, []>();
const mockMaybeSingle = jest.fn<Promise<unknown>, []>();
const mockInsert = jest.fn<Promise<{ error: unknown }>, [unknown]>();
const mockUpsert = jest.fn<Promise<{ error: unknown }>, [unknown, unknown]>();
const mockInvoke = jest.fn<Promise<{ data: unknown; error: unknown }>, []>();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithOtp: (args: unknown) => mockSignInWithOtp(args),
      verifyOtp: (args: unknown) => mockVerifyOtp(args),
      getSession: () => mockGetSession(),
      updateUser: () => Promise.resolve({ data: {}, error: null }),
      signOut: () => Promise.resolve({ error: null }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => undefined } },
      }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => mockMaybeSingle() }),
      }),
      insert: (row: unknown) => mockInsert(row),
      upsert: (row: unknown, options: unknown) => mockUpsert(row, options),
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
    functions: { invoke: () => mockInvoke() },
  },
}));

const SESSION = {
  data: { session: { user: { id: 'user-1', email: 'ayo@test.local' } } },
};
const ONBOARDED_ROW = {
  data: {
    display_name: 'Ayo',
    branch_id: 'b-1',
    language: 'en',
    role: 'member',
    onboarded_at: '2026-07-26T00:00:00Z',
  },
  error: null,
};

// RNTL v14 events are async and MUST be awaited: an unawaited event's
// continuation overlaps React 19's act scopes and wedges every later render
// in the file (the tree renders as `< />` from then on).
async function press(element: Parameters<typeof fireEvent.press>[0]) {
  await fireEvent.press(element);
}

async function type(
  element: Parameters<typeof fireEvent.changeText>[0],
  text: string,
) {
  await fireEvent.changeText(element, text);
}

function renderFlow(initialStep: 'email' | 'profile' = 'email') {
  // gcTime 0: the default 5-minute GC timer is an open handle jest waits on.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ThemeScope name="light">
        <ToastProvider>
          <AuthFlow initialStep={initialStep} />
        </ToastProvider>
      </ThemeScope>
    </QueryClientProvider>,
  );
}

async function reachCodeStep() {
  mockSignInWithOtp.mockResolvedValue({ error: null });
  await renderFlow();
  await type(await screen.findByLabelText('Email address'), 'ayo@test.local');
  await press(screen.getByRole('button', { name: 'Send code' }));
  await screen.findByText('Enter your code');
}

beforeEach(() => {
  jest.clearAllMocks();
  useGateStore.setState({ pending: null, dismissedKinds: [] });
  useAuthStore.setState({
    status: 'guest',
    email: null,
    profile: null,
    signedOutBanner: false,
  });
  useBranchStore.setState({
    branch: {
      id: '00000000-0000-4000-8000-000000000002',
      slug: 'berlin',
      name: 'AGBC Lighthouse Berlin',
      timezone: 'Europe/Berlin',
    },
  });
});

describe('AUTH-1 email step', () => {
  it('rejects an invalid email without calling the API', async () => {
    await renderFlow();
    await type(screen.getByLabelText('Email address'), 'not-valid');
    await press(screen.getByRole('button', { name: 'Send code' }));
    await screen.findByText('Enter a valid email address.');
    expect(mockSignInWithOtp).not.toHaveBeenCalled();
  });

  it('sends the code with the UI language and advances to AUTH-2 masked', async () => {
    await reachCodeStep();
    expect(mockSignInWithOtp).toHaveBeenCalledWith({
      email: 'ayo@test.local',
      options: { shouldCreateUser: true, data: { language: 'en' } },
    });
    expect(screen.getByText(/a•••@test\.local/)).toBeTruthy();
  });

  it('surfaces the outage state when the send fails server-side', async () => {
    mockSignInWithOtp.mockResolvedValue({
      error: new AuthApiError('SMTP down', 500, 'unexpected_failure'),
    });
    await renderFlow();
    await type(await screen.findByLabelText('Email address'), 'ayo@test.local');
    await press(screen.getByRole('button', { name: 'Send code' }));
    await screen.findByText(
      "Codes aren't being delivered right now. Please try again in a little while.",
    );
  });
});

describe('AUTH-2 code step', () => {
  it('verifies on the sixth digit; a returning member lands on success', async () => {
    await reachCodeStep();
    mockVerifyOtp.mockResolvedValue({ error: null });
    mockGetSession.mockResolvedValue(SESSION);
    mockMaybeSingle.mockResolvedValue(ONBOARDED_ROW);

    await type(screen.getByLabelText('6-digit code'), '123456');
    await screen.findByText("You're in!");
    expect(mockVerifyOtp).toHaveBeenCalledWith({
      email: 'ayo@test.local',
      token: '123456',
      type: 'email',
    });
  });

  it('routes a first sign-in to AUTH-3', async () => {
    await reachCodeStep();
    mockVerifyOtp.mockResolvedValue({ error: null });
    mockGetSession.mockResolvedValue(SESSION);
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    await type(screen.getByLabelText('6-digit code'), '123456');
    await screen.findByText('Complete your profile');
  });

  it('shows the invalid-code state after the review fallback also declines', async () => {
    await reachCodeStep();
    mockVerifyOtp.mockResolvedValue({
      error: new AuthApiError('Token expired', 403, 'otp_expired'),
    });
    mockInvoke.mockResolvedValue({ data: null, error: new Error('401') });

    await type(screen.getByLabelText('6-digit code'), '999999');
    await screen.findByText(
      "That code isn't right. Check the email and try again.",
    );
    expect(mockInvoke).toHaveBeenCalled();
  });

  it('signs in through the review bypass when the server accepts it', async () => {
    await reachCodeStep();
    mockVerifyOtp
      .mockResolvedValueOnce({
        error: new AuthApiError('Token expired', 403, 'otp_expired'),
      })
      .mockResolvedValueOnce({ error: null });
    mockInvoke.mockResolvedValue({
      data: { ok: true, token_hash: 'hash-123' },
      error: null,
    });
    mockGetSession.mockResolvedValue(SESSION);
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    await type(screen.getByLabelText('6-digit code'), '424242');
    await screen.findByText('Complete your profile');
    expect(mockVerifyOtp).toHaveBeenLastCalledWith({
      token_hash: 'hash-123',
      type: 'email',
    });
  });

  it('starts with the countdown, not the resend action', async () => {
    await reachCodeStep();
    expect(screen.queryByRole('button', { name: 'Resend code' })).toBeNull();
    expect(screen.getByText(/Resend code in 0:/)).toBeTruthy();
  });
});

describe('AUTH-3 profile step', () => {
  it('requires the 16+ declaration before anything is written', async () => {
    mockGetSession.mockResolvedValue(SESSION);
    await renderFlow('profile');
    await type(await screen.findByLabelText('Display name'), 'Ayo');
    await press(screen.getByRole('button', { name: 'Enter' }));
    await screen.findByText('You need to be 16 or older to create an account.');
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('prefills the onboarding branch, writes the one-shot row, and succeeds', async () => {
    mockGetSession.mockResolvedValue(SESSION);
    mockInsert.mockResolvedValue({ error: null });
    await renderFlow('profile');

    expect(await screen.findByText('AGBC Lighthouse Berlin')).toBeTruthy();
    await type(await screen.findByLabelText('Display name'), 'Ayo');
    await press(screen.getByRole('checkbox'));
    await press(screen.getByRole('button', { name: 'Enter' }));

    await screen.findByText("You're in!");
    const written = mockInsert.mock.calls[0][0] as Record<string, unknown>;
    expect(written.display_name).toBe('Ayo');
    expect(written.branch_id).toBe('00000000-0000-4000-8000-000000000002');
    expect(written.email).toBe('ayo@test.local');
    expect(typeof written.onboarded_at).toBe('string');
    expect(typeof written.age_confirmed_at).toBe('string');
    expect(useAuthStore.getState().status).toBe('member');
  });

  it('shows the save error and keeps the form when the write fails', async () => {
    mockGetSession.mockResolvedValue(SESSION);
    mockInsert.mockResolvedValue({
      error: { code: '500', message: 'boom' },
    });
    await renderFlow('profile');
    await type(await screen.findByLabelText('Display name'), 'Ayo');
    await press(screen.getByRole('checkbox'));
    await press(screen.getByRole('button', { name: 'Enter' }));
    await screen.findByText("We couldn't finish setting up. Please try again.");
    expect(screen.getByDisplayValue('Ayo')).toBeTruthy();
  });
});

describe('AUTH-4 success step', () => {
  it('continues back to the origin screen', async () => {
    mockGetSession.mockResolvedValue(SESSION);
    mockInsert.mockResolvedValue({ error: null });
    await renderFlow('profile');
    await type(await screen.findByLabelText('Display name'), 'Ayo');
    await press(screen.getByRole('checkbox'));
    await press(screen.getByRole('button', { name: 'Enter' }));
    await screen.findByText("You're in!");

    await press(screen.getByRole('button', { name: 'Continue' }));
    expect(mockBack).toHaveBeenCalled();
  });

  it('greets the new member by name', async () => {
    mockGetSession.mockResolvedValue(SESSION);
    mockInsert.mockResolvedValue({ error: null });
    await renderFlow('profile');
    await type(await screen.findByLabelText('Display name'), 'Ayo');
    await press(screen.getByRole('checkbox'));
    await press(screen.getByRole('button', { name: 'Enter' }));
    await waitFor(() => {
      expect(screen.getByText(/Welcome to the family, Ayo/)).toBeTruthy();
    });
  });
});

describe('gate-return replay (W2.2, docs/spec/03 + 04 rule 9)', () => {
  it('names the action on AUTH-4 and lands the Glory after returning', async () => {
    useGateStore
      .getState()
      .beginGateSignIn({ kind: 'glory', testimonyId: 'tes-1' });
    await reachCodeStep();
    mockVerifyOtp.mockResolvedValue({ error: null });
    mockGetSession.mockResolvedValue(SESSION);
    mockMaybeSingle.mockResolvedValue(ONBOARDED_ROW);

    await type(screen.getByLabelText('6-digit code'), '123456');
    await screen.findByText(/Taking you back to say Glory to God/);
    await press(screen.getByRole('button', { name: 'Continue' }));

    expect(mockBack).toHaveBeenCalled();
    // W2.4 moved the landing from a direct write to the offline write queue, so
    // what the return guarantees is that the reaction is RECORDED. Getting it to
    // the server, retrying it and reconciling a refusal are the queue's job and
    // are tested there; the promise to the member is unchanged, and now it also
    // holds when they signed in with no signal.
    await waitFor(() => {
      expect(useWriteQueueStore.getState().queue['glory:tes-1']).toMatchObject({
        state: 'on',
      });
    });
    expect(useGateStore.getState().pending).toBeNull();
  });

  it('a sign-in without a pending action replays nothing', async () => {
    await reachCodeStep();
    mockVerifyOtp.mockResolvedValue({ error: null });
    mockGetSession.mockResolvedValue(SESSION);
    mockMaybeSingle.mockResolvedValue(ONBOARDED_ROW);

    await type(screen.getByLabelText('6-digit code'), '123456');
    await screen.findByText(/Taking you back…/);
    await press(screen.getByRole('button', { name: 'Continue' }));

    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('an abandoned flow drops the pending action (docs/spec/03 lifetime)', async () => {
    useGateStore
      .getState()
      .beginGateSignIn({ kind: 'glory', testimonyId: 'tes-1' });
    const view = await renderFlow();
    await view.unmount();
    expect(useGateStore.getState().pending).toBeNull();
  });
});

describe('resume route (docs/spec/03 half-created profile)', () => {
  it('mounts directly on AUTH-3', async () => {
    mockGetSession.mockResolvedValue(SESSION);
    await renderFlow('profile');
    expect(await screen.findByText('Complete your profile')).toBeTruthy();
  });
});
