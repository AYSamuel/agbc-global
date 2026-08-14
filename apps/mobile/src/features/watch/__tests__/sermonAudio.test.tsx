import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ToastProvider } from '@/components/ui';
import { audioPlayer, resetAudioMock, setAudioStatus } from '@/test/expoAudio';
import { ThemeScope } from '@/theme';

import { usePlaybackStore } from '../playback';
import type { SermonSummary } from '../queries';

import Sermon from '../../../../app/sermon/[id]';

// The AUDIO half of SERMON (docs/spec/08, W3.1 slice 3). What the fake player can
// and cannot prove is written at the top of src/test/expoAudio.ts: these are our
// decisions, not expo-audio's behaviour, which `08` verifies on the device.

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access --
   documented jest.mock factory shapes */
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('expo-audio', () => require('@/test/expoAudio'));
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access */

const mockBack = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: mockBack }),
  useLocalSearchParams: () => mockParams,
  // The real one runs the effect on focus and its cleanup on blur. A screen
  // under test is focused for its whole life, so a plain useEffect IS the
  // contract here: body on mount, cleanup on unmount.
  useFocusEffect: (effect: () => (() => void) | undefined) => {
    jest
      .requireActual<typeof import('react')>('react')
      .useEffect(effect, [effect]);
  },
}));

jest.mock('expo-localization', () => ({
  getLocales: jest.fn(() => [{ languageCode: 'en' }]),
}));

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(() => Promise.resolve({})),
}));

// The embed must never mount in audio mode; a testID is how we prove it.
jest.mock('react-native-youtube-iframe', () => {
  const { Text } =
    jest.requireActual<typeof import('react-native')>('react-native');
  const MockPlayer = (props: { videoId: string }) => (
    <Text testID="youtube-player">{props.videoId}</Text>
  );
  return { __esModule: true, default: MockPlayer };
});

const mockTrack = jest.fn();
jest.mock('@/lib/analytics', () => ({
  track: (...args: unknown[]) => {
    mockTrack(...args);
  },
}));

const mockSermon = jest.fn<
  {
    data: SermonSummary | null | undefined;
    isError: boolean;
    refetch: () => void;
  },
  []
>();
jest.mock('../queries', () => ({
  useSermonQuery: () => mockSermon(),
}));

const mockRefetchUrl = jest.fn();
const mockAudioUrl = jest.fn<
  { data: string | undefined; isError: boolean; refetch: () => void },
  []
>(() => ({
  data: 'https://storage.test/sermon-audio/one.mp3?token=abc',
  isError: false,
  refetch: mockRefetchUrl,
}));
jest.mock('../audioSource', () => ({
  useSermonAudioUrlQuery: () => mockAudioUrl(),
}));

const mockSaveServerPosition = jest.fn(
  (_sermonId: string, _positionSec: number) => Promise.resolve(true),
);
const mockServerPosition = jest.fn<
  {
    data: { positionSec: number; updatedAt: number } | null;
    isPending: boolean;
  },
  []
>(() => ({ data: null, isPending: false }));
jest.mock('../serverPosition', () => ({
  useServerPositionQuery: () => mockServerPosition(),
  saveServerPosition: (sermonId: string, positionSec: number) =>
    mockSaveServerPosition(sermonId, positionSec),
}));

const mockAuthState = jest.fn<{ status: string }, []>(() => ({
  status: 'guest',
}));
jest.mock('@/state/auth', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector(mockAuthState()),
}));

function sermon(overrides: Partial<SermonSummary> = {}): SermonSummary {
  return {
    id: 'aaa',
    title: 'Grace That Carries You',
    speaker: 'Rev Olayinka Ademiluka',
    youtube_id: 'yt-1',
    audio_path: 'one.mp3',
    duration_sec: 2280,
    thumbnail_url: 'https://img.test/one.jpg',
    series: null,
    published_at: '2026-07-18T10:00:00Z',
    is_live: false,
    live_checked_at: null,
    kind: 'video',
    status: 'available',
    ...overrides,
  };
}

function renderScreen() {
  return render(
    <ThemeScope name="light">
      <ToastProvider>
        <Sermon />
      </ToastProvider>
    </ThemeScope>,
  );
}

/** Enter audio mode the way a member does, then report a loaded source.
 *
 * A `tab`, not a button, since W3.1 slice 4: mode is a segmented control now,
 * because the tile row dressed a mode, a value and a destination identically. */
async function enterAudio() {
  await fireEvent.press(screen.getByRole('tab', { name: 'Audio' }));
  await act(() => {
    setAudioStatus({ isLoaded: true, duration: 2280 });
  });
  // Audio does not autoplay (2026-08-15), so the member presses play and the
  // fake then reports what the real player would. Every test below this line
  // therefore starts from a message somebody chose to hear.
  await fireEvent.press(screen.getByRole('button', { name: 'Play' }));
  await act(() => {
    setAudioStatus({ playing: true });
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  resetAudioMock();
  mockParams = { id: 'aaa' };
  mockAuthState.mockReturnValue({ status: 'guest' });
  mockServerPosition.mockReturnValue({ data: null, isPending: false });
  mockAudioUrl.mockReturnValue({
    data: 'https://storage.test/sermon-audio/one.mp3?token=abc',
    isError: false,
    refetch: mockRefetchUrl,
  });
  mockSermon.mockReturnValue({
    data: sermon(),
    isError: false,
    refetch: jest.fn(),
  });
  usePlaybackStore.setState({ positions: {}, speed: 1 });
});

describe('entering audio mode', () => {
  test('replaces the embed with the transport and marks the tile on', async () => {
    await renderScreen();
    expect(screen.getByTestId('youtube-player')).toBeOnTheScreen();

    await enterAudio();

    // The embed is gone: 08 forbids playing YouTube audio in the background, so
    // the two players must never be alive at the same time.
    expect(screen.queryByTestId('youtube-player')).not.toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'Back 15 seconds' }),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole('tab', { name: 'Audio', selected: true }),
    ).toBeOnTheScreen();
    // And Speed arrives with the mode: with the embed up there is no rate to
    // change, so the action is absent rather than dimmed (W3.1 slice 4).
    expect(screen.getByRole('button', { name: 'Speed, 1x' })).toBeOnTheScreen();
    // Attribution comes with the mode too: the thumbnail and title on screen are
    // YouTube's, shown with none of their chrome, so their badge names them as
    // the source and links back to the video (their policy asks for both).
    expect(
      screen.getByRole('link', { name: 'Watch on YouTube' }),
    ).toBeOnTheScreen();
    expect(
      screen.getByText('Plays in the background and on your lock screen'),
    ).toBeOnTheScreen();
  });

  test('binds the lock screen, which is what keeps Android playing', async () => {
    await renderScreen();
    await enterAudio();
    expect(audioPlayer.setActiveForLockScreen).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        title: 'Grace That Carries You',
        artist: 'Rev Olayinka Ademiluka',
        artworkUrl: 'https://img.test/one.jpg',
      }),
      expect.objectContaining({ showSeekForward: true }),
    );
  });

  test('a message that was never on YouTube opens straight into audio', async () => {
    mockSermon.mockReturnValue({
      data: sermon({ youtube_id: null, thumbnail_url: '' }),
      isError: false,
      refetch: jest.fn(),
    });
    await renderScreen();
    await act(() => {
      setAudioStatus({ isLoaded: true, duration: 1800, playing: true });
    });

    expect(screen.getByRole('button', { name: 'Pause' })).toBeOnTheScreen();
    // Nothing on the screen came from YouTube, so nothing credits them and
    // there is nowhere to send anybody: no badge, no link.
    expect(
      screen.queryByRole('link', { name: 'Watch on YouTube' }),
    ).not.toBeOnTheScreen();
    expect(
      screen.queryByRole('link', { name: 'Open on YouTube' }),
    ).not.toBeOnTheScreen();

    // And the Video half of the segment stays, dimmed, with the reason: a
    // control that vanishes teaches nothing, and it still answers a press
    // rather than announcing itself disabled while reacting.
    const video = screen.getByRole('tab', { name: 'Video' });
    expect(screen.getByHintText('This message is audio only.')).toBe(video);
    await fireEvent.press(video);
    expect(screen.getByText('This message is audio only.')).toBeOnTheScreen();
    expect(
      screen.getByRole('tab', { name: 'Audio', selected: true }),
    ).toBeOnTheScreen();
  });

  test('a message whose video died still plays, and says why', async () => {
    mockSermon.mockReturnValue({
      data: sermon({ status: 'unavailable' }),
      isError: false,
      refetch: jest.fn(),
    });
    await renderScreen();
    await act(() => {
      setAudioStatus({ isLoaded: true, duration: 2280, playing: true });
    });
    expect(screen.getByText(/still listen to it here/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeOnTheScreen();
    expect(mockBack).not.toHaveBeenCalled();
  });

  test('raises sermon_played with mode audio', async () => {
    await renderScreen();
    await enterAudio();
    expect(mockTrack).toHaveBeenCalledWith('sermon_played', { mode: 'audio' });
  });

  test('does not start playing by itself', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByRole('tab', { name: 'Audio' }));
    await act(() => {
      setAudioStatus({ isLoaded: true, duration: 2280 });
    });

    // Choosing a mode is not pressing play (2026-08-15). The source is loaded
    // and seeked, and then it waits.
    expect(audioPlayer.play).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Play' })).toBeOnTheScreen();
    // And the pill tells the truth about it rather than claiming a listen.
    expect(screen.getByLabelText('Paused')).toBeOnTheScreen();
    // The funnel is not credited with a message nobody has heard.
    expect(mockTrack).not.toHaveBeenCalledWith('sermon_played', {
      mode: 'audio',
    });
  });
});

describe('the transport', () => {
  test('pause and play drive the player', async () => {
    await renderScreen();
    await enterAudio();

    await fireEvent.press(screen.getByRole('button', { name: 'Pause' }));
    expect(audioPlayer.pause).toHaveBeenCalled();

    await act(() => {
      setAudioStatus({ playing: false });
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Play' }));
    expect(audioPlayer.play).toHaveBeenCalled();
  });

  test('the skip pair seeks by 15s and clamps at the start', async () => {
    await renderScreen();
    await enterAudio();
    await act(() => {
      setAudioStatus({ currentTime: 100 });
    });

    await fireEvent.press(
      screen.getByRole('button', { name: 'Forward 15 seconds' }),
    );
    expect(audioPlayer.seekTo).toHaveBeenLastCalledWith(115);

    await act(() => {
      setAudioStatus({ currentTime: 5 });
    });
    await fireEvent.press(
      screen.getByRole('button', { name: 'Back 15 seconds' }),
    );
    expect(audioPlayer.seekTo).toHaveBeenLastCalledWith(0);
  });

  test('shows elapsed and remaining from the frame', async () => {
    await renderScreen();
    await enterAudio();
    await act(() => {
      setAudioStatus({ currentTime: 860 });
    });
    expect(screen.getByText('14:20')).toBeOnTheScreen();
    expect(screen.getByText('-23:40')).toBeOnTheScreen();
  });
});

describe('speed', () => {
  test('is absent while the video is up, because there is no rate to change', async () => {
    await renderScreen();
    // Absent, not dimmed (W3.1 slice 4). While the embed owns playback there is
    // nothing for a rate to apply to, and the mode segment right above it is the
    // answer to "why", so a greyed control stating "1x" would only be a number
    // that is not true of anything.
    expect(screen.queryByRole('button', { name: /Speed/ })).toBeNull();
    expect(audioPlayer.setPlaybackRate).not.toHaveBeenCalled();
  });

  test('cycles in audio mode and applies to the player', async () => {
    await renderScreen();
    await enterAudio();

    await fireEvent.press(screen.getByRole('button', { name: 'Speed, 1x' }));
    expect(audioPlayer.setPlaybackRate).toHaveBeenLastCalledWith(1.25);
    expect(
      screen.getByRole('button', { name: 'Speed, 1.25x' }),
    ).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Speed, 1.25x' }));
    expect(audioPlayer.setPlaybackRate).toHaveBeenLastCalledWith(1.5);
  });

  test('the choice is sticky, so a new listen inherits it', async () => {
    usePlaybackStore.setState({ speed: 1.5 });
    await renderScreen();
    await enterAudio();
    expect(audioPlayer.setPlaybackRate).toHaveBeenCalledWith(1.5);
  });
});

describe('resume', () => {
  test('seeks to the stored position and calls it a resume', async () => {
    usePlaybackStore.setState({
      positions: { aaa: { positionSec: 640, updatedAt: 5_000 } },
    });
    await renderScreen();
    await enterAudio();
    expect(audioPlayer.seekTo).toHaveBeenCalledWith(640);
    expect(mockTrack).toHaveBeenCalledWith('sermon_resumed', { mode: 'audio' });
  });

  test('a position under 15s is not worth restoring', async () => {
    usePlaybackStore.setState({
      positions: { aaa: { positionSec: 9, updatedAt: 5_000 } },
    });
    await renderScreen();
    await enterAudio();
    expect(audioPlayer.seekTo).not.toHaveBeenCalled();
    expect(mockTrack).toHaveBeenCalledWith('sermon_played', { mode: 'audio' });
  });

  test('within 30s of the end starts the message over', async () => {
    usePlaybackStore.setState({
      positions: { aaa: { positionSec: 2270, updatedAt: 5_000 } },
    });
    await renderScreen();
    await enterAudio();
    expect(audioPlayer.seekTo).not.toHaveBeenCalled();
  });

  test('a member takes the newer of the two layers, not the server one blindly', async () => {
    // The offline-listening case: the device kept saving while the server writes
    // failed, so the server row is older and must not rewind the member.
    mockAuthState.mockReturnValue({ status: 'member' });
    mockServerPosition.mockReturnValue({
      data: { positionSec: 300, updatedAt: 1_000 },
      isPending: false,
    });
    usePlaybackStore.setState({
      positions: { aaa: { positionSec: 1200, updatedAt: 9_000 } },
    });
    await renderScreen();
    await enterAudio();
    expect(audioPlayer.seekTo).toHaveBeenCalledWith(1200);
  });

  test('and follows the other device when THAT is newer', async () => {
    mockAuthState.mockReturnValue({ status: 'member' });
    mockServerPosition.mockReturnValue({
      data: { positionSec: 1800, updatedAt: 9_000 },
      isPending: false,
    });
    usePlaybackStore.setState({
      positions: { aaa: { positionSec: 300, updatedAt: 1_000 } },
    });
    await renderScreen();
    await enterAudio();
    expect(audioPlayer.seekTo).toHaveBeenCalledWith(1800);
  });

  test('nothing is sought until the member row has arrived', async () => {
    mockAuthState.mockReturnValue({ status: 'member' });
    mockServerPosition.mockReturnValue({ data: null, isPending: true });
    await renderScreen();
    // The segment is still there to press, but the surface below is the skeleton:
    // seeking twice is what a premature mount would cost.
    await fireEvent.press(screen.getByRole('tab', { name: 'Audio' }));
    expect(
      screen.queryByRole('button', { name: 'Pause' }),
    ).not.toBeOnTheScreen();
  });
});

describe('writing the position back', () => {
  test('a guest keeps it on the device and never writes to the server', async () => {
    await renderScreen();
    await enterAudio();
    await act(() => {
      setAudioStatus({ currentTime: 700 });
    });
    // Unmount is one of 08's three write moments (with the ~10s tick and
    // backgrounding), and the cheapest to drive here. Awaited, because React
    // schedules the unmount effects: read the store first and the final write
    // has not landed yet.
    await screen.unmount();
    expect(usePlaybackStore.getState().positions.aaa.positionSec).toBe(700);
    expect(mockSaveServerPosition).not.toHaveBeenCalled();
  });

  test('a member writes both layers', async () => {
    mockAuthState.mockReturnValue({ status: 'member' });
    await renderScreen();
    await enterAudio();
    await act(() => {
      setAudioStatus({ currentTime: 700 });
    });
    // Wrapped, because React schedules the unmount effects: without this the
    // assertion runs before the final write lands.
    await screen.unmount();
    expect(usePlaybackStore.getState().positions.aaa.positionSec).toBe(700);
    expect(mockSaveServerPosition).toHaveBeenCalledWith('aaa', 700);
  });

  test('finishing clears the position, so the message starts over next time', async () => {
    usePlaybackStore.setState({
      positions: { aaa: { positionSec: 640, updatedAt: 5_000 } },
    });
    await renderScreen();
    await enterAudio();
    await act(() => {
      setAudioStatus({ didJustFinish: true });
    });
    expect(usePlaybackStore.getState().positions.aaa).toBeUndefined();
  });
});

describe('leaving the screen', () => {
  test('stops the audio, because nothing in the app could stop it after', async () => {
    // Found on the device: a deep link to a second message pushes a new screen
    // and leaves this one mounted, so its sermon kept playing under a player
    // showing something else. Blur is navigation only; backgrounding the app
    // does not blur, so this does not touch the background promise.
    await renderScreen();
    await enterAudio();
    expect(audioPlayer.pause).not.toHaveBeenCalled();

    await screen.unmount();

    expect(audioPlayer.pause).toHaveBeenCalled();
  });
});

describe('when the source fails', () => {
  test('the first error re-mints the URL silently', async () => {
    await renderScreen();
    await enterAudio();
    await act(() => {
      setAudioStatus({ error: 'Source error' });
    });
    expect(mockRefetchUrl).toHaveBeenCalledTimes(1);
    // Still the player, not an error screen: the member should not see a
    // stumble we can fix ourselves.
    expect(screen.getByRole('button', { name: 'Pause' })).toBeOnTheScreen();
  });

  test('the fresh URL arriving does not spend the silence', async () => {
    await renderScreen();
    await enterAudio();
    await act(() => {
      setAudioStatus({ error: 'Source error' });
    });
    expect(mockRefetchUrl).toHaveBeenCalledTimes(1);

    // React Query hands the screen a NEW result object on every fetch-state
    // move, and the refetch resolving with a fresh token is exactly that. The
    // status is still the OLD player's error until the new one reports, so a
    // re-mint callback keyed on the object's identity re-runs the error effect,
    // counts the silent re-mint as spent, and shows the failure over a source
    // that is about to play.
    mockAudioUrl.mockReturnValue({
      data: 'https://storage.test/sermon-audio/one.mp3?token=def',
      isError: false,
      refetch: mockRefetchUrl,
    });
    await screen.rerender(
      <ThemeScope name="light">
        <ToastProvider>
          <Sermon />
        </ToastProvider>
      </ThemeScope>,
    );

    expect(screen.queryByText("The audio couldn't play")).not.toBeOnTheScreen();
    expect(mockRefetchUrl).toHaveBeenCalledTimes(1);
  });

  test('a second error is the member’s to know about', async () => {
    await renderScreen();
    await enterAudio();
    await act(() => {
      setAudioStatus({ error: 'Source error' });
    });
    await act(() => {
      setAudioStatus({ error: null });
      setAudioStatus({ error: 'Source error again' });
    });
    expect(screen.getByText("The audio couldn't play")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(mockRefetchUrl).toHaveBeenCalledTimes(2);
  });

  test('a mint that never lands shows the retry, not a dead player', async () => {
    mockAudioUrl.mockReturnValue({
      data: undefined,
      isError: true,
      refetch: mockRefetchUrl,
    });
    await renderScreen();
    await fireEvent.press(screen.getByRole('tab', { name: 'Audio' }));
    expect(screen.getByText("The audio couldn't play")).toBeOnTheScreen();
  });
});
