import { fireEvent, render, screen } from '@testing-library/react-native';

import i18n from '@/i18n';
import { ToastProvider } from '@/components/ui';
import { useGateStore } from '@/state/gate';
import { ThemeScope } from '@/theme';

import type { NotificationRow } from '../nc';

import NotificationsScreen from '../../../../app/notifications';

// NC (docs/spec/15; frames `NC · notification center` and `NC · empty`): both
// row shapes narrate, unread answers the tap, the stored deep link is resolved
// through the allowlist, and the cursor surfaces as "Show older" until the
// retention boundary is truly reached.

void i18n;

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access --
   documented jest.mock factory shapes */
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access */

const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: jest.fn(),
    canGoBack: () => true,
  }),
}));

const mockAuthState = jest.fn<{ status: string }, []>(() => ({
  status: 'member',
}));
jest.mock('@/state/auth', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector(mockAuthState()),
}));

const mockTrack = jest.fn();
jest.mock('@/lib/analytics', () => ({
  track: (...args: unknown[]) => {
    mockTrack(...args);
  },
}));

interface MockList {
  data: { pages: { rows: NotificationRow[] }[] } | undefined;
  isPending: boolean;
  isError: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  refetch: () => void;
  fetchNextPage: () => Promise<unknown>;
}
const mockList = jest.fn<MockList, []>();
const mockMarkRead = jest.fn();
const mockMarkAllRead = jest.fn();
const mockFetchNextPage = jest.fn(() => Promise.resolve());
jest.mock('../nc', () => ({
  useNotificationsList: () => mockList(),
  useMarkRead: () => ({ mutate: mockMarkRead }),
  useMarkAllRead: () => ({ mutate: mockMarkAllRead }),
}));

function row(
  id: string,
  overrides: Partial<NotificationRow> = {},
): NotificationRow {
  return {
    id,
    type: 'prayer',
    templateKey: 'prayer.someone_prayed',
    params: null,
    title: null,
    body: null,
    deepLink: '/family',
    readAt: '2026-08-18T10:00:00Z',
    createdAt: '2026-08-18T09:00:00Z',
    ...overrides,
  };
}

function listOf(rows: NotificationRow[], overrides: Partial<MockList> = {}) {
  mockList.mockReturnValue({
    data: { pages: [{ rows }] },
    isPending: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    refetch: jest.fn(),
    fetchNextPage: mockFetchNextPage,
    ...overrides,
  });
}

function renderScreen() {
  return render(
    <ThemeScope name="light">
      <ToastProvider>
        <NotificationsScreen />
      </ToastProvider>
    </ThemeScope>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuthState.mockReturnValue({ status: 'member' });
  listOf([]);
  useGateStore.setState({ pending: null, dismissedKinds: [] });
});

test('a guest meets the account, and the gate remembers the log they asked for', async () => {
  mockAuthState.mockReturnValue({ status: 'guest' });
  await renderScreen();
  expect(screen.getByText('Your notifications live here')).toBeOnTheScreen();

  await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
  expect(mockTrack).toHaveBeenCalledWith('gate_shown', {
    action_type: 'notifications',
  });
  expect(useGateStore.getState().pending).toEqual({ kind: 'notifications' });
  expect(mockPush).toHaveBeenCalledWith('/auth');
});

test('an empty log is all caught up, not broken', async () => {
  await renderScreen();
  expect(screen.getByText("You're all caught up")).toBeOnTheScreen();
  expect(
    screen.queryByRole('button', { name: 'Mark all read' }),
  ).not.toBeOnTheScreen();
});

test('a failed load owns up and offers the way back', async () => {
  const refetch = jest.fn();
  listOf([], { isError: true, data: undefined, refetch });
  await renderScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  expect(refetch).toHaveBeenCalled();
});

test('both row shapes narrate: a template renders, a broadcast passes through', async () => {
  listOf([
    row('n1'),
    row('n2', {
      type: 'ministry',
      templateKey: null,
      title: 'Global Grace Gathering',
      body: 'All branches, this Sunday.',
    }),
  ]);
  await renderScreen();
  expect(screen.getByText('Someone prayed with you')).toBeOnTheScreen();
  expect(screen.getByText('Global Grace Gathering')).toBeOnTheScreen();
});

test('a tap on an unread row marks it read and follows its allowlisted link', async () => {
  listOf([row('n1', { readAt: null, deepLink: '/my-list' })]);
  await renderScreen();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Someone prayed with you, unread' }),
  );
  expect(mockMarkRead).toHaveBeenCalledWith('n1');
  expect(mockPush).toHaveBeenCalledWith('/my-list');
});

test('an unrecognised stored link goes nowhere rather than somewhere surprising', async () => {
  listOf([row('n1', { deepLink: '/give?confirm=1' })]);
  await renderScreen();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Someone prayed with you' }),
  );
  expect(mockPush).not.toHaveBeenCalled();
  // Already read, so no write either.
  expect(mockMarkRead).not.toHaveBeenCalled();
});

test('Mark all read appears only with unread rows, and asks for all of them', async () => {
  listOf([row('n1', { readAt: null }), row('n2')]);
  await renderScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Mark all read' }));
  expect(mockMarkAllRead).toHaveBeenCalled();
});

test('the cursor surfaces as Show older; the retention footer waits for the last page', async () => {
  listOf([row('n1')], { hasNextPage: true });
  await renderScreen();
  expect(
    screen.queryByText('Older notifications are removed after 12 months.'),
  ).not.toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Show older' }));
  expect(mockFetchNextPage).toHaveBeenCalled();

  listOf([row('n1')]);
  await renderScreen();
  expect(
    screen.getByText('Older notifications are removed after 12 months.'),
  ).toBeOnTheScreen();
});
