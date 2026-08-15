import { fireEvent, render, screen } from '@testing-library/react-native';

import i18n from '@/i18n';
import { ToastProvider } from '@/components/ui';
import { useGateStore } from '@/state/gate';
import { ThemeScope } from '@/theme';

import type { SermonSummary } from '../queries';
import type { SavedListItem } from '../saved';

import MyList from '../../../../app/my-list';

// MY-LIST (docs/spec/08, the four W3.1 slice 4 frames): the list is the
// saving, the remove control sits on the row, and a message the channel lost
// stays listed with its way out where the hand expects it.

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

const mockList = jest.fn<
  {
    data: SavedListItem[] | undefined;
    isPending: boolean;
    isError: boolean;
    refetch: () => void;
  },
  []
>();
const mockQueueSave = jest.fn<undefined, [string, boolean]>();
jest.mock('../saved', () => ({
  useSavedListQuery: () => mockList(),
  queueSave: (sermonId: string, saved: boolean) => {
    mockQueueSave(sermonId, saved);
  },
}));

function sermon(
  id: string,
  overrides: Partial<SermonSummary> = {},
): SermonSummary {
  return {
    id,
    title: `Message ${id}`,
    speaker: 'Pastor Test',
    youtube_id: `yt-${id}`,
    audio_path: null,
    artwork_path: null,
    duration_sec: 2280,
    thumbnail_url: '',
    series: null,
    published_at: '2026-07-18T10:00:00Z',
    kind: 'video',
    status: 'available',
    ...overrides,
  };
}

function item(
  id: string,
  overrides: Partial<SermonSummary> = {},
): SavedListItem {
  return { savedAt: '2026-08-01T10:00:00Z', sermon: sermon(id, overrides) };
}

function renderScreen() {
  return render(
    <ThemeScope name="light">
      <ToastProvider>
        <MyList />
      </ToastProvider>
    </ThemeScope>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuthState.mockReturnValue({ status: 'member' });
  mockList.mockReturnValue({
    data: [],
    isPending: false,
    isError: false,
    refetch: jest.fn(),
  });
  useGateStore.setState({ pending: null, dismissedKinds: [] });
});

test('a guest meets the account, not the list, and the gate remembers the way back', async () => {
  mockAuthState.mockReturnValue({ status: 'guest' });
  await renderScreen();
  expect(screen.getByText('Sign in to keep a list')).toBeOnTheScreen();

  await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
  expect(mockTrack).toHaveBeenCalledWith('gate_shown', {
    action_type: 'my_list',
  });
  expect(useGateStore.getState().pending).toEqual({ kind: 'my_list' });
  expect(mockPush).toHaveBeenCalledWith('/auth');
});

test('loading shows skeletons', async () => {
  mockList.mockReturnValue({
    data: undefined,
    isPending: true,
    isError: false,
    refetch: jest.fn(),
  });
  await renderScreen();
  expect(
    screen.getAllByTestId('skeleton', { includeHiddenElements: true }).length,
  ).toBeGreaterThan(0);
});

test('error offers a retry that refetches', async () => {
  const refetch = jest.fn();
  mockList.mockReturnValue({
    data: undefined,
    isPending: false,
    isError: true,
    refetch,
  });
  await renderScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
  expect(refetch).toHaveBeenCalled();
});

test('empty teaches the gesture and sends them where the messages are', async () => {
  await renderScreen();
  expect(screen.getByText('Nothing saved yet')).toBeOnTheScreen();
  await fireEvent.press(
    screen.getByRole('button', { name: 'Browse messages' }),
  );
  expect(mockPush).toHaveBeenCalledWith('/(tabs)/watch');
});

test('the list counts itself, opens the player, and unsaves from the row', async () => {
  mockList.mockReturnValue({
    data: [item('s1'), item('s2')],
    isPending: false,
    isError: false,
    refetch: jest.fn(),
  });
  await renderScreen();
  expect(screen.getByText('2 saved')).toBeOnTheScreen();

  await fireEvent.press(screen.getByRole('button', { name: /Message s1/ }));
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/sermon/[id]',
    params: { id: 's1' },
  });

  const removes = screen.getAllByRole('button', {
    name: 'Remove from My List',
  });
  expect(removes).toHaveLength(2);
  await fireEvent.press(removes[0]);
  expect(mockQueueSave).toHaveBeenCalledWith('s1', false);
});

test('a message the channel lost stays listed, says so, and keeps its way out', async () => {
  mockList.mockReturnValue({
    data: [
      item('kept'),
      item('gone', { status: 'unavailable', audio_path: null }),
      // Unavailable but the audio survived: still playable, so an ordinary row.
      item('audio', { status: 'unavailable', audio_path: 'a.mp3' }),
    ],
    isPending: false,
    isError: false,
    refetch: jest.fn(),
  });
  await renderScreen();

  // Exactly one row reads gone: the one with nothing left to hear.
  expect(screen.getAllByText('No longer available')).toHaveLength(1);
  expect(
    screen.getByRole('button', {
      name: 'Message gone · No longer available',
    }),
  ).toBeOnTheScreen();
  // Every row keeps the remove control, the gone one included.
  expect(
    screen.getAllByRole('button', { name: 'Remove from My List' }),
  ).toHaveLength(3);
});
