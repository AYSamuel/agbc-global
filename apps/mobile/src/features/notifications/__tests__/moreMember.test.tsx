import { fireEvent, render, screen } from '@testing-library/react-native';

import i18n from '@/i18n';
import { ToastProvider } from '@/components/ui';
import { ThemeScope } from '@/theme';

import More from '../../../../app/(tabs)/more';

// MORE's member hub (W3.3 decision 5; frames `More · member (the "My life"
// section)` and `More · member (no rhythm yet)`): the identity card, the five
// My-life rows with the unread number, the rhythm line that waits for the
// first "I'm here", and a Library that stops asking a member to sign in.

void i18n;

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access --
   documented jest.mock factory shapes */
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access */

// `requireActual('../nc')` below reaches the real module, whose supabase client
// demands env at import; the client itself is never exercised here.
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
}));

interface MockAuth {
  status: string;
  profile: { displayName: string; branchId: string } | null;
}
const mockAuthState = jest.fn<MockAuth, []>();
jest.mock('@/state/auth', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector(mockAuthState()),
}));

jest.mock('@/features/family/useBranchNames', () => ({
  useBranchNames: () => ({ 'b-berlin': 'AGBC Lighthouse Berlin' }),
}));

const mockRhythm = jest.fn<{ data: { currentWeeks: number } | null }, []>(
  () => ({ data: null }),
);
jest.mock('@/features/rhythm/queries', () => ({
  useRhythmQuery: () => mockRhythm(),
}));

const mockUnread = jest.fn<{ data: number | undefined }, []>(() => ({
  data: 0,
}));
jest.mock('../nc', () => {
  const actual = jest.requireActual<typeof import('../nc')>('../nc');
  return {
    ...actual,
    useUnreadCount: () => mockUnread(),
  };
});

function renderScreen() {
  return render(
    <ThemeScope name="light">
      <ToastProvider>
        <More />
      </ToastProvider>
    </ThemeScope>,
  );
}

const member: MockAuth = {
  status: 'member',
  profile: { displayName: 'Grace Bello', branchId: 'b-berlin' },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockAuthState.mockReturnValue(member);
  mockRhythm.mockReturnValue({ data: null });
  mockUnread.mockReturnValue({ data: 0 });
});

test('the member card says who you are, and opens the profile', async () => {
  mockRhythm.mockReturnValue({ data: { currentWeeks: 4 } });
  await renderScreen();
  expect(screen.getByText('Grace Bello')).toBeOnTheScreen();
  expect(screen.getByText('AGBC Lighthouse Berlin')).toBeOnTheScreen();
  expect(screen.getByText('4-week rhythm')).toBeOnTheScreen();

  await fireEvent.press(
    screen.getByRole('button', { name: 'Open your profile, Grace Bello' }),
  );
  expect(mockPush).toHaveBeenCalledWith('/settings/profile');
});

test('before the first "I\'m here" the rhythm line simply is not there', async () => {
  await renderScreen();
  expect(screen.getByText('Grace Bello')).toBeOnTheScreen();
  // The card's gold line, specifically; the "My rhythm" ROW must stay.
  expect(screen.queryByText(/-week rhythm/)).not.toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'My rhythm' })).toBeOnTheScreen();
});

test('My life reaches all five destinations, with the unread number on the bell row', async () => {
  mockUnread.mockReturnValue({ data: 3 });
  await renderScreen();

  await fireEvent.press(screen.getByRole('button', { name: 'Profile' }));
  expect(mockPush).toHaveBeenCalledWith('/settings/profile');
  await fireEvent.press(screen.getByRole('button', { name: 'My rhythm' }));
  expect(mockPush).toHaveBeenCalledWith('/rhythm');
  await fireEvent.press(screen.getByRole('button', { name: 'My List' }));
  expect(mockPush).toHaveBeenCalledWith('/my-list');
  await fireEvent.press(screen.getByRole('button', { name: 'My posts' }));
  expect(mockPush).toHaveBeenCalledWith('/my-posts');

  expect(screen.getByText('3')).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Notifications' }));
  expect(mockPush).toHaveBeenCalledWith('/notifications');
});

test('the unread number caps at 99+', async () => {
  mockUnread.mockReturnValue({ data: 150 });
  await renderScreen();
  expect(screen.getByText('99+')).toBeOnTheScreen();
});

test('a member reaches the Library without being asked to sign in', async () => {
  await renderScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'My Library' }));
  expect(mockPush).toHaveBeenCalledWith('/library');
});

test('a guest still gets the sign-in card and no My life section', async () => {
  mockAuthState.mockReturnValue({ status: 'guest', profile: null });
  await renderScreen();
  expect(
    screen.getByText('Post, pray, and track your rhythm'),
  ).toBeOnTheScreen();
  expect(screen.queryByText('My life')).not.toBeOnTheScreen();
});
