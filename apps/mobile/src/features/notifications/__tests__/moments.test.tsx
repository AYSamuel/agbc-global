import { fireEvent, render, screen } from '@testing-library/react-native';

import '@/i18n';
import { NotificationAsk } from '@/features/notifications/NotificationAsk';
import { useNotificationAskStore } from '@/features/notifications/ask';
import { MilestoneCelebration } from '@/features/rhythm/MilestoneCelebration';
import { useCelebratedStore } from '@/features/rhythm/celebrated';
import { useAuthStore } from '@/state/auth';
import { ThemeScope } from '@/theme';

// The two things that arrive over whatever screen the member is on: the
// milestone celebration (docs/spec/10) and the in-context notification ask
// (docs/spec/06), in that order.

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access --
   documented jest.mock factory shapes */
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access */

jest.mock('expo-localization', () => ({
  getLocales: jest.fn(() => [{ languageCode: 'en', languageTag: 'en-GB' }]),
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

const mockMilestones = jest.fn<{ data: unknown }, []>();
jest.mock('@/features/rhythm/history', () => ({
  useMilestonesQuery: () => mockMilestones(),
}));

const mockShare = jest.fn<undefined, [string]>();
jest.mock('@/features/family/share', () => ({
  shareText: (text: string) => {
    mockShare(text);
  },
}));

// The OS permission, which the dev client may not even carry (see permission.ts).
const mockState = jest.fn<Promise<string>, []>();
const mockRequest = jest.fn<Promise<string>, []>();
jest.mock('@/features/notifications/permission', () => ({
  permissionState: () => mockState(),
  requestPermission: () => mockRequest(),
}));

function signIn() {
  useAuthStore.setState({
    status: 'member',
    email: 'grace@example.test',
    profile: {
      displayName: 'Grace Bello',
      branchId: 'branch-1',
      language: 'en',
      role: 'member',
    },
  });
}

function renderMoments() {
  return render(
    <ThemeScope name="light">
      <MilestoneCelebration />
      <NotificationAsk />
    </ThemeScope>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ status: 'guest', email: null, profile: null });
  useCelebratedStore.setState({ known: [], showing: null });
  useNotificationAskStore.setState({ asked: false, pending: false });
  mockMilestones.mockReturnValue({ data: [] });
  mockState.mockResolvedValue('undetermined');
  mockRequest.mockResolvedValue('granted');
});

describe('the milestone celebration', () => {
  test('a newly awarded milestone announces itself, wherever the member is', async () => {
    signIn();
    mockMilestones.mockReturnValue({
      data: [{ kind: '4_week_rhythm', achievedAt: '2026-08-08T10:00:00Z' }],
    });
    await renderMoments();

    expect(screen.getByText('Four weeks of rhythm')).toBeOnTheScreen();
    expect(screen.getByText('Milestone')).toBeOnTheScreen();
  });

  test('closing it retires that milestone for good', async () => {
    signIn();
    mockMilestones.mockReturnValue({
      data: [{ kind: '4_week_rhythm', achievedAt: '2026-08-08T10:00:00Z' }],
    });
    await renderMoments();
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));

    expect(useCelebratedStore.getState().known).toContain('4_week_rhythm');
    expect(screen.queryByText('Four weeks of rhythm')).toBeNull();
  });

  test('the share is text through the OS sheet, not a rendered image', async () => {
    signIn();
    mockMilestones.mockReturnValue({
      data: [{ kind: 'first_service', achievedAt: '2026-08-08T10:00:00Z' }],
    });
    await renderMoments();
    await fireEvent.press(
      screen.getByRole('button', { name: 'Share the joy' }),
    );

    expect(mockShare).toHaveBeenCalledWith(
      expect.stringContaining('Your first service'),
    );
  });

  test('a guest is never celebrated at', async () => {
    mockMilestones.mockReturnValue({
      data: [{ kind: '4_week_rhythm', achievedAt: '2026-08-08T10:00:00Z' }],
    });
    await renderMoments();
    expect(screen.queryByText('Four weeks of rhythm')).toBeNull();
  });
});

describe('the notification ask (docs/spec/06)', () => {
  test('never appears unbidden: it takes a value moment', async () => {
    signIn();
    await renderMoments();
    expect(screen.queryByText('Want a reminder before service?')).toBeNull();
  });

  test('appears after one, and asks before the OS does', async () => {
    signIn();
    useNotificationAskStore.setState({ pending: true });
    await renderMoments();

    expect(
      screen.getByText('Want a reminder before service?'),
    ).toBeOnTheScreen();
    // The sheet explains first; the OS dialog has not fired.
    expect(mockRequest).not.toHaveBeenCalled();
  });

  test('waits behind a celebration rather than stacking on it', async () => {
    // The first "I'm here" is both a first service and a first value moment.
    signIn();
    useNotificationAskStore.setState({ pending: true });
    mockMilestones.mockReturnValue({
      data: [{ kind: 'first_service', achievedAt: '2026-08-08T10:00:00Z' }],
    });
    await renderMoments();

    expect(screen.getByText('Your first service')).toBeOnTheScreen();
    expect(screen.queryByText('Want a reminder before service?')).toBeNull();
  });

  test('"Yes" fires the OS dialog, and the app never asks again either way', async () => {
    signIn();
    useNotificationAskStore.setState({ pending: true });
    await renderMoments();
    await fireEvent.press(
      screen.getByRole('button', { name: 'Yes, remind me' }),
    );

    expect(mockRequest).toHaveBeenCalled();
    expect(useNotificationAskStore.getState().asked).toBe(true);
  });

  test('"Not now" spends the ask too, and the check-in is untouched', async () => {
    signIn();
    useNotificationAskStore.setState({ pending: true });
    await renderMoments();
    await fireEvent.press(screen.getByRole('button', { name: 'Not now' }));

    expect(mockRequest).not.toHaveBeenCalled();
    expect(useNotificationAskStore.getState().asked).toBe(true);
    expect(screen.queryByText('Want a reminder before service?')).toBeNull();
  });

  test('a build that cannot ask does not spend the ask (the native fence)', async () => {
    // An older dev client has no expo-notifications native module. Marking the
    // ask spent there would leave the member permanently unasked once a build
    // that CAN ask arrives.
    signIn();
    mockState.mockResolvedValue('unavailable');
    useNotificationAskStore.setState({ pending: true });
    await renderMoments();

    expect(screen.queryByText('Want a reminder before service?')).toBeNull();
    expect(useNotificationAskStore.getState().asked).toBe(false);
  });

  test('a member who already answered the OS is not interrupted at all', async () => {
    signIn();
    mockState.mockResolvedValue('granted');
    useNotificationAskStore.setState({ pending: true });
    await renderMoments();

    expect(screen.queryByText('Want a reminder before service?')).toBeNull();
  });
});
