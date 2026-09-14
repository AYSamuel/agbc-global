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

// The celebration's Share opens the picture sheet since W4.15 slice 4, which reaches
// the branch list (for the card's branch line) and, through the card, the QR and the two
// natives. None of them is under test here; the mocks only stop construction.
jest.mock('@/features/onboarding/useBranches', () => ({
  useBranchesQuery: () => ({
    data: [{ id: 'branch-1', name: 'AGBC Lighthouse Berlin' }],
    isError: false,
  }),
}));
jest.mock('react-native-view-shot', () => ({
  captureRef: () => new Promise<string>(() => undefined),
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: () => Promise.resolve(true),
  shareAsync: () => Promise.resolve(),
}));
jest.mock('react-native-qrcode-svg', () => ({
  __esModule: true,
  default: () => null,
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
  useNotificationAskStore.setState({ asked: false, pending: null });
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

    expect(screen.getByText('A month of Sundays')).toBeOnTheScreen();
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
    expect(screen.queryByText('A month of Sundays')).toBeNull();
  });

  test('the share is the gold card, signed with the full name, and it outlives the overlay', async () => {
    signIn();
    mockMilestones.mockReturnValue({
      data: [{ kind: 'first_service', achievedAt: '2026-08-08T10:00:00Z' }],
    });
    await renderMoments();
    await fireEvent.press(
      screen.getByRole('button', { name: 'Share the joy' }),
    );

    // The overlay is told and closes; the preview is still here to send.
    expect(useCelebratedStore.getState().known).toContain('first_service');
    expect(screen.getByText('Share this milestone')).toBeOnTheScreen();
    const hidden = { includeHiddenElements: true } as const;
    expect(screen.getByText('Your first service', hidden)).toBeTruthy();
    // Spelled out (Ayo, 2026-09-14): a card that leaves the app names the church in full.
    expect(
      screen.getByText(
        'With my church family at Amazing Grace Bible Church.',
        hidden,
      ),
    ).toBeTruthy();
    // The FULL profile name, a signature (plan §4), and the member's own branch.
    expect(screen.getByText('Grace Bello', hidden)).toBeTruthy();
    expect(screen.getByText('AGBC Lighthouse Berlin', hidden)).toBeTruthy();
  });

  test('a gathering count renders as an ORDINAL, not as its raw key', async () => {
    // This one has to go through real i18next rather than a stub. The stubs all
    // passed while the phone rendered "milestoneGatherings" at the member,
    // because i18next only selects `_ordinal_*` forms when told `ordinal: true`
    // and otherwise falls back to the key (2026-08-09).
    signIn();
    mockMilestones.mockReturnValue({
      data: [{ kind: '50_gatherings', achievedAt: '2026-08-08T10:00:00Z' }],
    });
    await renderMoments();

    expect(screen.getByText('Your 50th gathering')).toBeOnTheScreen();
    expect(
      screen.queryByText(/milestoneGatherings|celebrateGatherings/),
    ).toBeNull();
  });

  test('a generated year tier renders its number too', async () => {
    signIn();
    mockMilestones.mockReturnValue({
      data: [{ kind: '520_week_rhythm', achievedAt: '2026-08-08T10:00:00Z' }],
    });
    await renderMoments();

    expect(screen.getByText('10 years of Sundays')).toBeOnTheScreen();
  });

  test('a guest is never celebrated at', async () => {
    mockMilestones.mockReturnValue({
      data: [{ kind: '4_week_rhythm', achievedAt: '2026-08-08T10:00:00Z' }],
    });
    await renderMoments();
    expect(screen.queryByText('A month of Sundays')).toBeNull();
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
    useNotificationAskStore.setState({ pending: 'check_in' });
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
    useNotificationAskStore.setState({ pending: 'check_in' });
    mockMilestones.mockReturnValue({
      data: [{ kind: 'first_service', achievedAt: '2026-08-08T10:00:00Z' }],
    });
    await renderMoments();

    expect(screen.getByText('Your first service')).toBeOnTheScreen();
    expect(screen.queryByText('Want a reminder before service?')).toBeNull();
  });

  test('"Yes" fires the OS dialog, and the app never asks again either way', async () => {
    signIn();
    useNotificationAskStore.setState({ pending: 'check_in' });
    await renderMoments();
    await fireEvent.press(
      screen.getByRole('button', { name: 'Yes, remind me' }),
    );

    expect(mockRequest).toHaveBeenCalled();
    expect(useNotificationAskStore.getState().asked).toBe(true);
  });

  test('"Not now" spends the ask too, and the check-in is untouched', async () => {
    signIn();
    useNotificationAskStore.setState({ pending: 'check_in' });
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
    useNotificationAskStore.setState({ pending: 'check_in' });
    await renderMoments();

    expect(screen.queryByText('Want a reminder before service?')).toBeNull();
    expect(useNotificationAskStore.getState().asked).toBe(false);
  });

  test('the reassurance names the thing the member actually just did', async () => {
    // "You're checked in either way" appeared under an RSVP on device
    // (2026-08-09), which is a sentence about something that did not happen.
    // The moment carries its own kind so the footnote can be true.
    signIn();
    useNotificationAskStore.setState({ pending: 'rsvp' });
    await renderMoments();

    expect(screen.getByText(/Your RSVP stands either way/)).toBeOnTheScreen();
    expect(screen.queryByText(/You're checked in either way/)).toBeNull();
  });

  test('and still says checked in when that is what happened', async () => {
    signIn();
    useNotificationAskStore.setState({ pending: 'check_in' });
    await renderMoments();

    expect(screen.getByText(/You're checked in either way/)).toBeOnTheScreen();
  });

  test('after sign-in it reassures about the account, not an act', async () => {
    // `06`'s third trigger has no deed behind it, so the two older sentences
    // would both be untrue: nothing was checked into and nothing was RSVPd.
    signIn();
    useNotificationAskStore.setState({ pending: 'signed_in' });
    await renderMoments();

    expect(screen.getByText(/You're in either way/)).toBeOnTheScreen();
    expect(screen.queryByText(/You're checked in either way/)).toBeNull();
    expect(screen.queryByText(/Your RSVP stands either way/)).toBeNull();
  });

  test('a member who already answered the OS is not interrupted at all', async () => {
    signIn();
    mockState.mockResolvedValue('granted');
    useNotificationAskStore.setState({ pending: 'check_in' });
    await renderMoments();

    expect(screen.queryByText('Want a reminder before service?')).toBeNull();
  });
});
