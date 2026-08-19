import { fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';

import i18n from '@/i18n';
import { ToastProvider } from '@/components/ui';
import { ThemeScope } from '@/theme';

import { useNotificationAskStore } from '../ask';
import { columnsForToggle, type NotificationPrefs } from '../prefs';
import type { PermissionState } from '../permission';

import NotificationPrefsScreen from '../../../../app/settings/notifications';

// NOTIF-PREFS (W3.3 decisions 2 and 4; both frames): five switches over six
// columns, captions shared with the Android channels, and the OS banner that
// appears only when the OS itself said no.

void i18n;

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access --
   documented jest.mock factory shapes */
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access */

// `requireActual('../prefs')` below reaches the real module, whose supabase
// client demands env at import; the client itself is never exercised here.
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: mockReplace,
    back: jest.fn(),
    canGoBack: () => true,
  }),
  // The screen re-reads the OS permission on focus; in test-land focus is now.
  useFocusEffect: (effect: import('react').EffectCallback) => {
    const { useEffect } = jest.requireActual<typeof import('react')>('react');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- test shim: mount once, like a first focus
    useEffect(effect, []);
  },
}));

const mockAuthState = jest.fn<
  { status: string; profile: { branchId: string; displayName: string } | null },
  []
>(() => ({
  status: 'member',
  profile: { branchId: 'b-berlin', displayName: 'Grace Bello' },
}));
jest.mock('@/state/auth', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector(mockAuthState()),
}));

jest.mock('@/features/family/useBranchNames', () => ({
  useBranchNames: () => ({ 'b-berlin': 'AGBC Lighthouse Berlin' }),
}));

const mockPermission = jest.fn<Promise<PermissionState>, []>(() =>
  Promise.resolve('granted'),
);
jest.mock('../permission', () => ({
  permissionState: () => mockPermission(),
}));

function prefs(overrides: Partial<NotificationPrefs> = {}): NotificationPrefs {
  return {
    ministryAnnouncements: true,
    branchUpdates: true,
    serviceReminders: true,
    prayerActivity: true,
    prayerReminders: true,
    testimonyActivity: true,
    ...overrides,
  };
}

interface MockPrefsQuery {
  data: NotificationPrefs | undefined;
  isPending: boolean;
  isError: boolean;
  refetch: () => void;
}
const mockPrefsQuery = jest.fn<MockPrefsQuery, []>();
const mockSetPref = jest.fn();
jest.mock('../prefs', () => {
  const actual = jest.requireActual<typeof import('../prefs')>('../prefs');
  return {
    ...actual,
    usePrefs: () => mockPrefsQuery(),
    useSetPref: () => ({ mutate: mockSetPref }),
  };
});

function renderScreen() {
  return render(
    <ThemeScope name="light">
      <ToastProvider>
        <NotificationPrefsScreen />
      </ToastProvider>
    </ThemeScope>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPermission.mockResolvedValue('granted');
  // The banner's other half: this app has had its one ask (ask.ts).
  useNotificationAskStore.setState({ asked: true, pending: null });
  mockPrefsQuery.mockReturnValue({
    data: prefs(),
    isPending: false,
    isError: false,
    refetch: jest.fn(),
  });
});

test('five switches, captioned by their channels, with the branch named', async () => {
  await renderScreen();
  expect(
    screen.getByRole('switch', { name: 'Ministry announcements' }),
  ).toBeOnTheScreen();
  expect(
    screen.getByRole('switch', { name: 'Branch updates' }),
  ).toBeOnTheScreen();
  // The frame's one data-driven caption: the member's own branch.
  expect(
    screen.getByText('News and changes from AGBC Lighthouse Berlin'),
  ).toBeOnTheScreen();
  expect(
    screen.getByRole('switch', { name: 'Service reminders' }),
  ).toBeOnTheScreen();
  expect(
    screen.getByRole('switch', { name: 'Prayer activity' }),
  ).toBeOnTheScreen();
  expect(
    screen.getByRole('switch', { name: 'Testimony (Glory) activity' }),
  ).toBeOnTheScreen();
  // Transactional confirmations are a sentence, never a switch (decision 3).
  expect(
    screen.getByText(
      'Confirmations for things you do (registrations, purchases, post approvals) are always sent.',
    ),
  ).toBeOnTheScreen();
});

test('flipping a switch names its column', async () => {
  await renderScreen();
  await fireEvent.press(screen.getByRole('switch', { name: 'Branch updates' }));
  expect(mockSetPref).toHaveBeenCalledWith({
    toggle: 'branch_updates',
    next: false,
  });
});

test('the prayer switch speaks for both prayer columns (decision 2)', () => {
  expect(columnsForToggle('prayer_activity', false)).toEqual({
    prayer_activity: false,
    prayer_reminders: false,
  });
  expect(columnsForToggle('testimony_activity', false)).toEqual({
    testimony_activity: false,
  });
});

test('the OS banner appears once asked and not granted, and opens its settings', async () => {
  // 'undetermined' is what a revoked, even user-fixed, denial actually reports
  // on device (2026-08-19): the banner must not wait for a 'denied' that
  // Android's rationale seam can never deliver.
  mockPermission.mockResolvedValue('undetermined');
  const openSettings = jest
    .spyOn(Linking, 'openSettings')
    .mockResolvedValue(undefined);
  await renderScreen();
  const action = await screen.findByRole('button', {
    name: 'Open system settings',
  });
  await fireEvent.press(action);
  expect(openSettings).toHaveBeenCalled();
  openSettings.mockRestore();
});

test('no banner while the OS is happy', async () => {
  await renderScreen();
  expect(
    screen.queryByRole('button', { name: 'Open system settings' }),
  ).not.toBeOnTheScreen();
});

test('before the one ask, no banner even with push off: the value moment owns the conversation', async () => {
  useNotificationAskStore.setState({ asked: false, pending: null });
  mockPermission.mockResolvedValue('denied');
  await renderScreen();
  // Settle the async permission read before asserting absence.
  await screen.findByRole('switch', { name: 'Ministry announcements' });
  expect(
    screen.queryByRole('button', { name: 'Open system settings' }),
  ).not.toBeOnTheScreen();
});
