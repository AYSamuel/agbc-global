import { fireEvent, render, screen } from '@testing-library/react-native';

import i18n from '@/i18n';
import { ToastProvider } from '@/components/ui';
import { ThemeScope } from '@/theme';

import { durationMinutes, formatPublishedDate, joinMeta } from '../format';
import { resolveLiveSermon } from '../live';
import type { SermonSummary } from '../queries';
import { useSearchHistoryStore } from '../searchHistory';

import Sermon from '../../../../app/sermon/[id]';
import Watch from '../../../../app/(tabs)/watch';
import WatchSearch from '../../../../app/watch-search';

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access --
   documented jest.mock factory shapes */
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access */

const mockPush = jest.fn();
const mockBack = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
  useLocalSearchParams: () => mockParams,
}));

jest.mock('expo-localization', () => ({
  getLocales: jest.fn(() => [{ languageCode: 'en' }]),
}));

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(() => Promise.resolve({})),
}));

// The iframe wraps a native webview; the harness only needs its presence.
jest.mock('react-native-youtube-iframe', () => {
  const { Text } =
    jest.requireActual<typeof import('react-native')>('react-native');
  const MockPlayer = (props: { videoId: string }) => (
    <Text testID="youtube-player">{props.videoId}</Text>
  );
  return { __esModule: true, default: MockPlayer };
});

const mockSermons = jest.fn<
  { data: SermonSummary[] | undefined; isError: boolean; refetch: () => void },
  []
>();
const mockSermon = jest.fn<
  {
    data: SermonSummary | null | undefined;
    isError: boolean;
    refetch: () => void;
  },
  []
>();
const mockSearch = jest.fn<
  { data: SermonSummary[] | undefined; isError: boolean; refetch: () => void },
  []
>();
const mockKindList = jest.fn<
  { data: SermonSummary[] | undefined; isError: boolean; refetch: () => void },
  []
>();
jest.mock('../queries', () => ({
  useSermonsQuery: () => mockSermons(),
  useSermonQuery: () => mockSermon(),
  useSermonSearchQuery: () => mockSearch(),
  useSermonKindQuery: () => mockKindList(),
}));

jest.mock('@/features/onboarding/useBranches', () => ({
  useBranchesQuery: () => ({
    data: [
      {
        id: 'b1',
        slug: 'glasgow',
        name: 'AGBC Glasgow',
        city: 'Glasgow',
        country: 'UK',
        is_hq: true,
        youtube_channel_id: 'UCtestchannel',
        order: 1,
      },
    ],
    isError: false,
  }),
}));

function sermon(overrides: Partial<SermonSummary> = {}): SermonSummary {
  return {
    id: 'aaa',
    title: 'Grace That Carries You',
    speaker: 'Rev Olayinka Ademiluka',
    youtube_id: 'yt-1',
    audio_url: null,
    duration_sec: 2280,
    thumbnail_url: '',
    series: null,
    published_at: '2026-07-18T10:00:00Z',
    is_live: false,
    live_checked_at: null,
    kind: 'video',
    status: 'available',
    ...overrides,
  };
}

function renderScreen(ui: React.ReactElement) {
  return render(
    <ThemeScope name="light">
      <ToastProvider>{ui}</ToastProvider>
    </ThemeScope>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  // Deterministic empty-input state (zustand persists across tests in a file).
  useSearchHistoryStore.setState({ terms: [] });
});

describe('resolveLiveSermon (docs/spec/08 stale bound)', () => {
  const now = new Date('2026-07-19T12:00:00Z');

  test('a freshly-checked live sermon resolves', () => {
    const live = sermon({
      id: 'live',
      is_live: true,
      live_checked_at: '2026-07-19T11:50:00Z',
    });
    expect(resolveLiveSermon([sermon(), live], now)?.id).toBe('live');
  });

  test('a stale live flag never advertises dead air', () => {
    const stale = sermon({
      id: 'stale',
      is_live: true,
      live_checked_at: '2026-07-19T11:30:00Z',
    });
    expect(resolveLiveSermon([stale], now)).toBeNull();
  });

  test('an unstamped live flag is ignored', () => {
    expect(
      resolveLiveSermon(
        [sermon({ is_live: true, live_checked_at: null })],
        now,
      ),
    ).toBeNull();
  });
});

describe('format helpers', () => {
  test('durationMinutes rounds and floors at one minute', () => {
    expect(durationMinutes(2280)).toBe(38);
    expect(durationMinutes(20)).toBe(1);
    expect(durationMinutes(null)).toBeNull();
    expect(durationMinutes(0)).toBeNull();
  });

  test('joinMeta drops empty parts', () => {
    expect(joinMeta(['A', null, 'B', ''])).toBe('A · B');
  });

  test('formatPublishedDate localizes and never says "latest" (2026-07-20)', () => {
    expect(formatPublishedDate('2026-07-18T10:00:00Z', 'en')).toContain('2026');
    expect(formatPublishedDate('2026-07-18T10:00:00Z', 'en')).toContain('July');
    expect(formatPublishedDate('garbage', 'en')).toBe('');
  });
});

describe('WATCH tab four states (docs/spec/04)', () => {
  test('loading shows skeletons', async () => {
    mockSermons.mockReturnValue({
      data: undefined,
      isError: false,
      refetch: jest.fn(),
    });
    await renderScreen(<Watch />);
    expect(
      screen.getAllByTestId('skeleton', { includeHiddenElements: true }).length,
    ).toBeGreaterThan(0);
  });

  test('error with no cache shows retry and refetches', async () => {
    const refetch = jest.fn();
    mockSermons.mockReturnValue({ data: undefined, isError: true, refetch });
    await renderScreen(<Watch />);
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalled();
  });

  test('empty feed is friendly, never bare', async () => {
    mockSermons.mockReturnValue({
      data: [],
      isError: false,
      refetch: jest.fn(),
    });
    await renderScreen(<Watch />);
    expect(screen.getByText('Messages are on their way')).toBeOnTheScreen();
  });

  test('content: newest sermon leads as hero; rail excludes it; tapping navigates', async () => {
    mockSermons.mockReturnValue({
      data: [
        sermon({ id: 'newest', title: 'Newest Message' }),
        sermon({ id: 'older', title: 'Older Message' }),
      ],
      isError: false,
      refetch: jest.fn(),
    });
    await renderScreen(<Watch />);
    await fireEvent.press(
      screen.getByRole('button', { name: 'Newest Message' }),
    );
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/sermon/[id]',
      params: { id: 'newest' },
    });
    expect(
      screen.getByRole('button', { name: /Older Message/ }),
    ).toBeOnTheScreen();
  });

  test('a fresh live sermon takes the hero with the LIVE badge', async () => {
    mockSermons.mockReturnValue({
      data: [
        sermon({ id: 'newest', title: 'Newest Message' }),
        sermon({
          id: 'live',
          title: 'Sunday Service',
          is_live: true,
          live_checked_at: new Date().toISOString(),
        }),
      ],
      isError: false,
      refetch: jest.fn(),
    });
    await renderScreen(<Watch />);
    expect(screen.getByText('LIVE')).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', { name: 'Sunday Service' }),
    );
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/sermon/[id]',
      params: { id: 'live' },
    });
  });

  test('live replays get their own section, capped at three (website mirror)', async () => {
    mockSermons.mockReturnValue({
      data: [
        sermon({ id: 'v1', title: 'Video One' }),
        sermon({ id: 'l1', title: 'Stream One', kind: 'live_replay' }),
        sermon({ id: 'l2', title: 'Stream Two', kind: 'live_replay' }),
        sermon({ id: 'l3', title: 'Stream Three', kind: 'live_replay' }),
        sermon({ id: 'l4', title: 'Stream Four', kind: 'live_replay' }),
      ],
      isError: false,
      refetch: jest.fn(),
    });
    await renderScreen(<Watch />);
    expect(screen.getByText('Recent live streams')).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: /Stream One/ }),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: /Stream Three/ }),
    ).toBeOnTheScreen();
    // The fourth stream sits behind See all.
    expect(screen.queryByRole('button', { name: /Stream Four/ })).toBeNull();
  });

  test('the search affordance opens WATCH-SEARCH', async () => {
    mockSermons.mockReturnValue({
      data: [sermon()],
      isError: false,
      refetch: jest.fn(),
    });
    await renderScreen(<Watch />);
    await fireEvent.press(
      screen.getByRole('button', { name: 'Search messages' }),
    );
    expect(mockPush).toHaveBeenCalledWith('/watch-search');
  });
});

describe('WATCH-SEARCH', () => {
  test('short input shows the hint, not results', async () => {
    mockSearch.mockReturnValue({
      data: undefined,
      isError: false,
      refetch: jest.fn(),
    });
    await renderScreen(<WatchSearch />);
    expect(screen.getByText('Find a message')).toBeOnTheScreen();
  });

  test('results render with a count; tapping opens the sermon', async () => {
    mockParams = { q: 'grace' };
    mockSearch.mockReturnValue({
      data: [sermon({ id: 'hit', title: 'Grace for the Journey' })],
      isError: false,
      refetch: jest.fn(),
    });
    await renderScreen(<WatchSearch />);
    expect(screen.getByText('1 result')).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', { name: /Grace for the Journey/ }),
    );
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/sermon/[id]',
      params: { id: 'hit' },
    });
  });

  test('see-all list mode ends with the channel link (decision 2026-07-20)', async () => {
    mockParams = { list: 'live' };
    mockKindList.mockReturnValue({
      data: [sermon({ id: 's1', title: 'Stream One', kind: 'live_replay' })],
      isError: false,
      refetch: jest.fn(),
    });
    await renderScreen(<WatchSearch />);
    expect(screen.getByText('All live streams')).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: /Stream One/ }),
    ).toBeOnTheScreen();
    const openBrowser = jest.requireMock<{
      openBrowserAsync: jest.Mock;
    }>('expo-web-browser').openBrowserAsync;
    await fireEvent.press(
      screen.getByRole('button', { name: 'See more on YouTube' }),
    );
    expect(openBrowser).toHaveBeenCalledWith(
      'https://www.youtube.com/channel/UCtestchannel/streams',
    );
  });

  test('no results offers a clear path back', async () => {
    mockParams = { q: 'zzzz' };
    mockSearch.mockReturnValue({
      data: [],
      isError: false,
      refetch: jest.fn(),
    });
    await renderScreen(<WatchSearch />);
    expect(screen.getByText('No messages found')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByText('Find a message')).toBeOnTheScreen();
  });
});

describe('SERMON player', () => {
  test('renders the player, meta, YouTube fallback, and attribution', async () => {
    mockParams = { id: 'aaa' };
    mockSermon.mockReturnValue({
      data: sermon(),
      isError: false,
      refetch: jest.fn(),
    });
    await renderScreen(<Sermon />);
    expect(screen.getByTestId('youtube-player')).toBeOnTheScreen();
    expect(screen.getByText('Grace That Carries You')).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'Open on YouTube' }),
    ).toBeOnTheScreen();
    expect(screen.getByText('Videos play via YouTube')).toBeOnTheScreen();
  });

  test('the audio tile is disabled without audio and Notes gates to /auth', async () => {
    mockParams = { id: 'aaa' };
    mockSermon.mockReturnValue({
      data: sermon({ audio_url: null }),
      isError: false,
      refetch: jest.fn(),
    });
    await renderScreen(<Sermon />);
    expect(screen.getByRole('button', { name: 'Audio only' })).toBeDisabled();
    await fireEvent.press(screen.getByRole('button', { name: 'Notes' }));
    expect(mockPush).toHaveBeenCalledWith('/auth');
  });

  test('sermon rot renders the unavailable state, never a dead end (docs/spec/08)', async () => {
    mockParams = { id: 'gone' };
    mockSermon.mockReturnValue({
      data: sermon({ id: 'gone', status: 'unavailable' }),
      isError: false,
      refetch: jest.fn(),
    });
    await renderScreen(<Sermon />);
    expect(
      screen.getByText('This message is no longer available'),
    ).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', { name: 'Back to Watch' }),
    );
    expect(mockBack).toHaveBeenCalled();
  });

  test('an audio-first sermon without video explains itself', async () => {
    mockParams = { id: 'audio' };
    mockSermon.mockReturnValue({
      data: sermon({ id: 'audio', youtube_id: null, audio_url: 'x.mp3' }),
      isError: false,
      refetch: jest.fn(),
    });
    await renderScreen(<Sermon />);
    expect(
      screen.getByText(
        'This message is audio-first. Listening arrives in an upcoming update.',
      ),
    ).toBeOnTheScreen();
  });
});

afterAll(async () => {
  await i18n.changeLanguage('en');
});
