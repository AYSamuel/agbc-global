import { act, fireEvent, render, screen } from '@testing-library/react-native';

import i18n from '@/i18n';
import { ToastProvider } from '@/components/ui';
import { ThemeScope } from '@/theme';

import { durationMinutes, formatPublishedDate, joinMeta } from '../format';
import { usePlaybackStore } from '../playback';
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
  useFocusEffect: (effect: () => (() => void) | undefined) => {
    jest
      .requireActual<typeof import('react')>('react')
      .useEffect(effect, [effect]);
  },
}));

jest.mock('expo-localization', () => ({
  getLocales: jest.fn(() => [{ languageCode: 'en' }]),
}));

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return --
   documented jest.mock factory shape */
jest.mock('expo-audio', () => require('@/test/expoAudio'));
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return */

// The audio slice's own reads. This file covers the VIDEO half of SERMON; the
// audio half has its own suite in sermonAudio.test.tsx.
jest.mock('@/features/watch/audioSource', () => ({
  useSermonAudioUrlQuery: () => ({
    data: undefined,
    isError: false,
    refetch: jest.fn(),
  }),
}));
jest.mock('@/features/watch/serverPosition', () => ({
  useServerPositionQuery: () => ({ data: null, isPending: false }),
  saveServerPosition: jest.fn(() => Promise.resolve(true)),
}));

// The Save half (W3.1 slice 4): the module's own behavior is proven in
// saved.test.tsx; here only what the top bar does with it.
const mockQueueSave = jest.fn<undefined, [string, boolean]>();
const mockSavedState = jest.fn<boolean, []>(() => false);
jest.mock('@/features/watch/saved', () => ({
  queueSave: (sermonId: string, saved: boolean) => {
    mockQueueSave(sermonId, saved);
  },
  useSavedQuery: () => ({ data: false }),
  useSavedState: () => mockSavedState(),
}));

// SERMON reads the session to decide whether to sync the position server-side.
const mockAuthState = jest.fn<{ status: string }, []>(() => ({
  status: 'guest',
}));
jest.mock('@/state/auth', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector(mockAuthState()),
}));

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(() => Promise.resolve({})),
}));

// The iframe wraps a native webview; the harness needs its presence, and (for
// the W2.10 playback events) the state callback the screen hands it.
let mockPlayerProps: { onChangeState?: (state: string) => void } = {};
jest.mock('react-native-youtube-iframe', () => {
  const { Text } =
    jest.requireActual<typeof import('react-native')>('react-native');
  const MockPlayer = (props: {
    videoId: string;
    onChangeState?: (state: string) => void;
  }) => {
    mockPlayerProps = props;
    return <Text testID="youtube-player">{props.videoId}</Text>;
  };
  return { __esModule: true, default: MockPlayer };
});

// The analytics seam (W2.10): the wire is proven in lib/analytics/__tests__;
// here only WHICH events the player raises, and when.
const mockTrack = jest.fn();
jest.mock('@/lib/analytics', () => ({
  track: (...args: unknown[]) => {
    mockTrack(...args);
  },
}));

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
  mockPlayerProps = {};
  // Deterministic empty-input state (zustand persists across tests in a file).
  useSearchHistoryStore.setState({ terms: [] });
  usePlaybackStore.setState({ positions: {} });
});

// `resolveLiveSermon` and its stale-bound tests lived here until 2026-08-15 and went
// with ADR 0021: the app carries no live state, so there is no flag to bound.

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

  test('nothing on Watch ever announces a live stream (ADR 0021)', async () => {
    // The hero used to be taken by a running broadcast, wearing a red LIVE badge. The
    // app carries no live state now, so the newest message simply leads and no surface
    // claims anything is playing right now.
    mockSermons.mockReturnValue({
      data: [
        sermon({ id: 'newest', title: 'Newest Message' }),
        sermon({ id: 'stream', title: 'Sunday Service', kind: 'live_replay' }),
      ],
      isError: false,
      refetch: jest.fn(),
    });
    await renderScreen(<Watch />);
    expect(screen.queryByText('LIVE')).not.toBeOnTheScreen();
    expect(screen.getByText('Newest Message')).toBeOnTheScreen();
    // And the replay is still listed: it is a recorded message, not a live one.
    expect(
      screen.getByRole('button', { name: /Sunday Service/ }),
    ).toBeOnTheScreen();
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

  // The see-all list mode used to render only its success state: a cold-offline
  // open showed a bare header (docs/spec/04 forbids the blank freeze). W1.8 gives
  // it the full four states, mirroring the search branch.
  test('see-all list mode: loading shows skeletons under the header', async () => {
    mockParams = { list: 'videos' };
    mockKindList.mockReturnValue({
      data: undefined,
      isError: false,
      refetch: jest.fn(),
    });
    await renderScreen(<WatchSearch />);
    expect(screen.getByText('All messages')).toBeOnTheScreen();
    expect(
      screen.getAllByTestId('skeleton', { includeHiddenElements: true }).length,
    ).toBeGreaterThan(0);
  });

  test('see-all list mode: error offers a retry that refetches', async () => {
    mockParams = { list: 'videos' };
    const refetch = jest.fn();
    mockKindList.mockReturnValue({ data: undefined, isError: true, refetch });
    await renderScreen(<WatchSearch />);
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalled();
  });

  test('see-all list mode: empty is friendly, never a bare header', async () => {
    mockParams = { list: 'videos' };
    mockKindList.mockReturnValue({
      data: [],
      isError: false,
      refetch: jest.fn(),
    });
    await renderScreen(<WatchSearch />);
    expect(screen.getByText('Messages are on their way')).toBeOnTheScreen();
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
      screen.getByRole('link', { name: 'Open on YouTube' }),
    ).toBeOnTheScreen();
    // No attribution line on the video state (W3.1 slice 4, with Ayo): the embed
    // itself carries YouTube's logo and its own "Watch on YouTube" control, so a
    // second credit under it says nothing the screen was not already saying. The
    // audio state, where the thumbnail is shown bare, keeps its line.
    expect(screen.queryByText('Videos play via YouTube')).not.toBeOnTheScreen();
  });

  test('the audio segment explains itself without audio, and Notes opens the gate', async () => {
    mockParams = { id: 'aaa' };
    mockSermon.mockReturnValue({
      data: sermon({ audio_path: null }),
      isError: false,
      refetch: jest.fn(),
    });
    await renderScreen(<Sermon />);
    // Dimmed but answerable (W3.1): 08 wants the unavailable toggle to say WHY,
    // so the reason is on the hint for a screen reader and on a toast for a tap.
    const audio = screen.getByRole('tab', { name: 'Audio' });
    expect(audio).not.toBeDisabled();
    expect(screen.getByHintText("Audio for this message isn't up yet.")).toBe(
      audio,
    );
    await fireEvent.press(audio);
    expect(
      screen.getByText("Audio for this message isn't up yet."),
    ).toBeOnTheScreen();
    // Notes is a member feature: it opens the gate (not a bare push to /auth), so
    // W2.2 can wire gate-return through the sheet.
    await fireEvent.press(screen.getByRole('button', { name: 'Notes' }));
    expect(screen.getByText('Sign in to take notes')).toBeOnTheScreen();
    expect(mockPush).not.toHaveBeenCalled();
    // W2.10: the raise names the action the guest was reaching for.
    expect(mockTrack).toHaveBeenCalledWith('gate_shown', {
      action_type: 'sermon_notes',
    });
    await fireEvent.press(screen.getByText('Sign in'));
    expect(mockPush).toHaveBeenCalledWith('/auth');
  });

  test('Save gates a guest with its own copy, and the gate remembers the message', async () => {
    mockParams = { id: 'aaa' };
    mockSermon.mockReturnValue({
      data: sermon(),
      isError: false,
      refetch: jest.fn(),
    });
    await renderScreen(<Sermon />);
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Sign in to save this message')).toBeOnTheScreen();
    expect(mockQueueSave).not.toHaveBeenCalled();
    expect(mockTrack).toHaveBeenCalledWith('gate_shown', {
      action_type: 'save_sermon',
    });
    await fireEvent.press(screen.getByText('Sign in'));
    expect(mockPush).toHaveBeenCalledWith('/auth');
  });

  test("a member's Save queues the wish; a filled bookmark unsaves", async () => {
    mockParams = { id: 'aaa' };
    mockAuthState.mockReturnValue({ status: 'member' });
    mockSermon.mockReturnValue({
      data: sermon(),
      isError: false,
      refetch: jest.fn(),
    });
    await renderScreen(<Sermon />);
    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));
    expect(mockQueueSave).toHaveBeenCalledWith('aaa', true);

    // The saved state renames the control (the frame's `.ib.on`, aria Saved).
    mockSavedState.mockReturnValue(true);
    await renderScreen(<Sermon />);
    await fireEvent.press(screen.getByRole('button', { name: 'Saved' }));
    expect(mockQueueSave).toHaveBeenCalledWith('aaa', false);
  });

  test("a member's Notes goes straight to the page: the gate is for guests", async () => {
    mockParams = { id: 'aaa' };
    mockAuthState.mockReturnValue({ status: 'member' });
    mockSermon.mockReturnValue({
      data: sermon(),
      isError: false,
      refetch: jest.fn(),
    });
    await renderScreen(<Sermon />);
    await fireEvent.press(screen.getByRole('button', { name: 'Notes' }));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/sermon/notes/[id]',
      params: { id: 'aaa' },
    });
    expect(screen.queryByText('Sign in to take notes')).not.toBeOnTheScreen();
    expect(mockTrack).not.toHaveBeenCalledWith('gate_shown', expect.anything());
  });

  test('the first playing transition fires sermon_played, and only the first (W2.10)', async () => {
    mockParams = { id: 'aaa' };
    mockSermon.mockReturnValue({
      data: sermon(),
      isError: false,
      refetch: jest.fn(),
    });
    await renderScreen(<Sermon />);
    expect(mockTrack).not.toHaveBeenCalled();

    await act(() => {
      mockPlayerProps.onChangeState?.('playing');
    });
    expect(mockTrack).toHaveBeenCalledWith('sermon_played', { mode: 'video' });

    // The iframe reports 'playing' again after every pause; one open, one event.
    await act(() => {
      mockPlayerProps.onChangeState?.('paused');
      mockPlayerProps.onChangeState?.('playing');
    });
    expect(
      mockTrack.mock.calls.filter(([name]) => name === 'sermon_played'),
    ).toHaveLength(1);
  });

  test('a saved position makes the same transition sermon_resumed (W2.10)', async () => {
    mockParams = { id: 'aaa' };
    mockSermon.mockReturnValue({
      data: sermon(),
      isError: false,
      refetch: jest.fn(),
    });
    // Mid-sermon, past MIN_RESUME_SEC and clear of the end grace: the mount
    // computes a non-zero start, which is already the app's resume decision.
    usePlaybackStore.setState({
      positions: { aaa: { positionSec: 600, updatedAt: 1 } },
    });
    await renderScreen(<Sermon />);

    await act(() => {
      mockPlayerProps.onChangeState?.('playing');
    });
    expect(mockTrack).toHaveBeenCalledWith('sermon_resumed', {
      mode: 'video',
    });
    expect(mockTrack).not.toHaveBeenCalledWith(
      'sermon_played',
      expect.anything(),
    );
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

  // A row with a video opens on the video; a row with only audio opens in audio
  // mode (sermonAudio.test.tsx). This is the third case: neither, which is broken
  // data rather than a state anyone designed, and still must not dead-end.
  test('a sermon with neither a video nor audio still says something', async () => {
    mockParams = { id: 'empty' };
    mockSermon.mockReturnValue({
      data: sermon({ id: 'empty', youtube_id: null, audio_path: null }),
      isError: false,
      refetch: jest.fn(),
    });
    await renderScreen(<Sermon />);
    expect(
      screen.getByText("This message isn't ready to play yet."),
    ).toBeOnTheScreen();
    // And no YouTube attribution, because nothing here came from YouTube.
    expect(screen.queryByText('Videos play via YouTube')).not.toBeOnTheScreen();
  });
});

afterAll(async () => {
  await i18n.changeLanguage('en');
});
