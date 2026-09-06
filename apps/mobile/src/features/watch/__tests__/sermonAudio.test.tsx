import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type React from 'react';
import { type PanGesture, State } from 'react-native-gesture-handler';
import {
  fireGestureHandler,
  getByGestureTestId,
} from 'react-native-gesture-handler/jest-utils';

import { ToastProvider } from '@/components/ui';
import {
  audioPlayer,
  createdPlayers,
  resetAudioMock,
  setAudioStatus,
} from '@/test/expoAudio';
import { ThemeScope } from '@/theme';

import { NowPlayingProvider } from '../nowPlaying';
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
// Whether the screen under test is the one the member is looking at. The real
// `useFocusEffect` runs its effect on focus and its cleanup on blur; here it
// runs while this flag is up, so a test can render the screen as one sitting
// in the history behind another (the tablet's stack remount, W4.9 slice 3).
let mockFocused = true;
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: mockBack }),
  useLocalSearchParams: () => mockParams,
  useFocusEffect: (effect: () => (() => void) | undefined) => {
    jest
      .requireActual<typeof import('react')>('react')
      .useEffect(
        () => (mockFocused ? effect() : undefined),
        [effect, mockFocused],
      );
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
// The provider's own re-mint (W4.9 slice 3): a fresh URL for the same object,
// minted without the screen, because the screen may be gone by then.
const mockMintUrl = jest.fn((_audioPath: string): Promise<string> =>
  Promise.resolve('https://storage.test/sermon-audio/one.mp3?token=fresh'),
);
jest.mock('../audioSource', () => ({
  useSermonAudioUrlQuery: () => mockAudioUrl(),
  mintSermonAudioUrl: (audioPath: string) => mockMintUrl(audioPath),
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

// The top bar's Save half (W3.1 slice 4) is watch.test.tsx's subject; this
// suite only needs the screen to mount without a QueryClient behind it.
jest.mock('@/features/watch/saved', () => ({
  queueSave: jest.fn(),
  useSavedQuery: () => ({ data: false }),
  useSavedState: () => false,
}));

function sermon(overrides: Partial<SermonSummary> = {}): SermonSummary {
  return {
    id: 'aaa',
    title: 'Grace That Carries You',
    speaker: 'Rev Olayinka Ademiluka',
    youtube_id: 'yt-1',
    audio_path: 'one.mp3',
    artwork_path: null,
    duration_sec: 2280,
    thumbnail_url: 'https://img.test/one.jpg',
    series: null,
    published_at: '2026-07-18T10:00:00Z',
    kind: 'video',
    status: 'available',
    ...overrides,
  };
}

// The app's one player lives above the screen since W4.9 slice 3, so the
// harness carries it, exactly as the root layout does.
function tree(child: React.ReactNode) {
  return (
    <ThemeScope name="light">
      <ToastProvider>
        <NowPlayingProvider>{child}</NowPlayingProvider>
      </ToastProvider>
    </ThemeScope>
  );
}

function renderScreen() {
  return render(tree(<Sermon />));
}

/** Navigate away: the screen unmounts, the provider above it stays. */
function leaveScreen() {
  return screen.rerender(tree(null));
}

/** Let a chain of awaited promises settle: the re-mint, then the audio session
 * configured, then the lock screen activated. */
function settle() {
  return act(async () => {
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  });
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
  mockFocused = true;
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

  test('the lock screen gets OUR artwork when the message has some', async () => {
    // W3.1 slice 5, and the sharpest edge of the public-bucket decision: the OS fetches
    // this URL itself, out of our process, possibly hours into a background listen. What
    // it must never be handed is a credential with an expiry.
    const before = process.env.EXPO_PUBLIC_SUPABASE_URL;
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://stack.test';
    try {
      mockSermon.mockReturnValue({
        data: sermon({ artwork_path: 'cover.jpg' }),
        isError: false,
        refetch: jest.fn(),
      });
      await renderScreen();
      await enterAudio();
      expect(audioPlayer.setActiveForLockScreen).toHaveBeenCalledWith(
        true,
        expect.objectContaining({
          artworkUrl:
            'https://stack.test/storage/v1/object/public/sermon-artwork/cover.jpg',
        }),
        expect.anything(),
      );
    } finally {
      if (before === undefined) delete process.env.EXPO_PUBLIC_SUPABASE_URL;
      else process.env.EXPO_PUBLIC_SUPABASE_URL = before;
    }
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

  // W4.9 slice 2 (frame approved 2026-09-06): the bar is a seek control, a pan
  // gesture claimed natively so the screen's scroll view cannot take a drag
  // whose finger drifts (the tablet, 2026-09-06). A drag follows the finger and
  // seeks ONCE when the finger leaves; a tap is a pan that never activated. The
  // bar's width comes from onLayout, which the renderer never fires, so each
  // test lays the bar out by hand at 300 wide. The gesture is driven through
  // gesture-handler's own test helper, which fills in the BEGAN, ACTIVE and END
  // states around the points given.
  async function layOutBar() {
    const bar = screen.getByRole('adjustable', { name: 'Playback position' });
    await fireEvent(bar, 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 44 } },
    });
    return bar;
  }

  function seekBar() {
    return getByGestureTestId('seek-bar') as PanGesture;
  }

  test('a drag follows the finger and seeks once, where it let go', async () => {
    await renderScreen();
    await enterAudio();
    await act(() => {
      setAudioStatus({ currentTime: 860 });
    });
    await layOutBar();

    // The finger goes down at 10% and travels to 50%: the clock follows it and
    // the player is asked exactly once, for where it let go.
    await act(() => {
      fireGestureHandler<PanGesture>(seekBar(), [
        { state: State.BEGAN, x: 30, translationY: 0 },
        { state: State.ACTIVE, x: 30, translationY: 0 },
        { x: 90, translationY: 0 },
        { x: 150, translationY: 0 },
        { state: State.END, x: 150, translationY: 0 },
      ]);
    });
    expect(audioPlayer.seekTo).toHaveBeenCalledTimes(1);
    expect(audioPlayer.seekTo).toHaveBeenLastCalledWith(1140);
    // Off the finger, the clock is the player's again.
    expect(screen.getByText('14:20')).toBeOnTheScreen();
  });

  test('a tap seeks to where it landed, and past the end lands on the end', async () => {
    await renderScreen();
    await enterAudio();
    await layOutBar();

    // A tap: the pan never activates and the finger did not move vertically,
    // so it lands where it touched.
    await act(() => {
      fireGestureHandler<PanGesture>(seekBar(), [
        { state: State.BEGAN, x: 75, translationY: 0 },
        { state: State.FAILED, x: 75, translationY: 0 },
      ]);
    });
    expect(audioPlayer.seekTo).toHaveBeenLastCalledWith(570);

    // A finger that slides off the right edge reports x past the width.
    await act(() => {
      fireGestureHandler<PanGesture>(seekBar(), [
        { state: State.BEGAN, x: 290, translationY: 0 },
        { state: State.ACTIVE, x: 290, translationY: 0 },
        { state: State.END, x: 340, translationY: 0 },
      ]);
    });
    expect(audioPlayer.seekTo).toHaveBeenLastCalledWith(2280);
  });

  test('a drag the system takes away lands where the finger last was', async () => {
    await renderScreen();
    await enterAudio();
    await layOutBar();

    // A cancel commits, the way Android's own seek bar does: the member dragged
    // to the 11th minute and meant it, whatever interrupted the finger.
    await act(() => {
      fireGestureHandler<PanGesture>(seekBar(), [
        { state: State.BEGAN, x: 30, translationY: 0 },
        { state: State.ACTIVE, x: 30, translationY: 0 },
        { x: 90, translationY: 0 },
        { state: State.CANCELLED, x: 90, translationY: 0 },
      ]);
    });
    expect(audioPlayer.seekTo).toHaveBeenCalledTimes(1);
    expect(audioPlayer.seekTo).toHaveBeenLastCalledWith(684);
  });

  // The one case that seeks nothing, a scroll that happened to start on the
  // bar, is decided by `shouldSeekAfterTouch` and tested in audio.test.ts: the
  // gesture helper cannot express a pan that failed without also ending it.

  test('the screen scrolls again once the finger has left the bar', async () => {
    await renderScreen();
    await enterAudio();
    await layOutBar();
    expect(screen.getByTestId('sermon-screen')).toHaveProp(
      'scrollEnabled',
      true,
    );

    // Belt to the gesture's braces: the screen stops scrolling from touch-down
    // and scrolls again once the finger leaves. The helper fires the whole
    // sequence at once, so only the "again" half is observable here.
    await act(() => {
      fireGestureHandler<PanGesture>(seekBar(), [
        { state: State.BEGAN, x: 30, translationY: 0 },
        { state: State.ACTIVE, x: 30, translationY: 0 },
        { state: State.END, x: 30, translationY: 0 },
      ]);
    });
    expect(screen.getByTestId('sermon-screen')).toHaveProp(
      'scrollEnabled',
      true,
    );
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

    // W4.9 slice 2: 2x is the ceiling (expo-audio clamps Android at 2.0), and
    // the cycle wraps to 1x after it.
    await fireEvent.press(screen.getByRole('button', { name: 'Speed, 1.5x' }));
    expect(audioPlayer.setPlaybackRate).toHaveBeenLastCalledWith(2);
    await fireEvent.press(screen.getByRole('button', { name: 'Speed, 2x' }));
    expect(audioPlayer.setPlaybackRate).toHaveBeenLastCalledWith(1);
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
  test('keeps the audio playing: the bar is where it lives now', async () => {
    // W4.9 slice 3 reverses W3.1's blur-stop. Then, nothing in the app could
    // stop a message once its screen was gone, so the screen stopped it. Now
    // the player belongs to the provider above every screen and the bar can
    // stop it, so a member browsing elsewhere keeps listening.
    await renderScreen();
    await enterAudio();

    await leaveScreen();

    expect(audioPlayer.pause).not.toHaveBeenCalled();
    expect(audioPlayer.remove).not.toHaveBeenCalled();
  });

  test('coming back to the playing message shows it, without reloading or stopping', async () => {
    // The tap on the now-playing bar (and the tablet remounting its stack on
    // the way out of two-pane): the screen mounts fresh on a message the app
    // is already playing. It must open in audio mode on that player, not in
    // video mode, where its own rule would stop the audio it came back for.
    await renderScreen();
    await enterAudio();
    await leaveScreen();
    expect(createdPlayers).toBe(1);

    await screen.rerender(tree(<Sermon />));

    expect(screen.getByRole('button', { name: 'Pause' })).toBeOnTheScreen();
    expect(audioPlayer.remove).not.toHaveBeenCalled();
    expect(createdPlayers).toBe(1);
  });

  test('the app closing writes the position and lets the player go', async () => {
    // The provider's own unmount is the app going away: the last position is
    // written and the native object released, so nothing plays into a dead
    // tree.
    await renderScreen();
    await enterAudio();
    await act(() => {
      setAudioStatus({ currentTime: 300 });
    });

    await screen.unmount();

    expect(audioPlayer.remove).toHaveBeenCalledTimes(1);
    expect(usePlaybackStore.getState().positions['aaa'].positionSec).toBe(300);
  });

  test('opening a VIDEO message stops the audio, because one thing plays', async () => {
    // Two sound sources at once is the one thing a media app must never do
    // (docs/spec/08). Entering audio on one screen and video on the next
    // hands the audio to the bar, then the video takes it away.
    await renderScreen();
    await enterAudio();
    expect(audioPlayer.remove).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('tab', { name: 'Video' }));

    expect(audioPlayer.remove).toHaveBeenCalledTimes(1);
  });
});

describe('the member signing out', () => {
  test('unloads the listening with the rest of their state', async () => {
    // Sign-out and deletion both land on guest (`03`, `16`); a message left
    // playing would be a member's choice still sounding after they left.
    mockAuthState.mockReturnValue({ status: 'member' });
    await renderScreen();
    await enterAudio();
    expect(audioPlayer.remove).not.toHaveBeenCalled();

    mockAuthState.mockReturnValue({ status: 'guest' });
    await screen.rerender(tree(<Sermon />));

    expect(audioPlayer.remove).toHaveBeenCalledTimes(1);
  });
});

describe('the facts changing under a loaded message', () => {
  test('refresh the lock screen in place, never through a second activation', async () => {
    // The lock-screen invariant (PR #252): a second `setActiveForLockScreen`
    // on the same player crashes the media session, so a corrected title
    // goes through `updateLockScreenMetadata` and nothing else.
    await renderScreen();
    await enterAudio();
    await settle();
    const activations = audioPlayer.setActiveForLockScreen.mock.calls.length;

    mockSermon.mockReturnValue({
      data: sermon({ title: 'Corrected on the dashboard' }),
      isError: false,
      refetch: jest.fn(),
    });
    await screen.rerender(tree(<Sermon />));

    expect(audioPlayer.updateLockScreenMetadata).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: 'Corrected on the dashboard' }),
    );
    expect(audioPlayer.setActiveForLockScreen).toHaveBeenCalledTimes(
      activations,
    );
  });
});

describe("a different message's screen behind the one in view", () => {
  test('stops the audio only once it is the screen in view', async () => {
    // The tablet remounts its whole stack on a layout change, rendering every
    // sermon screen in the history at once, each in video mode by default.
    // One that is not focused must keep its hands off the player.
    await renderScreen();
    await enterAudio();

    // A fresh mount of ANOTHER message's screen, out of focus: video mode by
    // default, since the player holds a different message.
    await leaveScreen();
    mockFocused = false;
    mockParams = { id: 'bbb' };
    mockSermon.mockReturnValue({
      data: sermon({ id: 'bbb', title: 'Another message' }),
      isError: false,
      refetch: jest.fn(),
    });
    await screen.rerender(tree(<Sermon />));
    expect(audioPlayer.remove).not.toHaveBeenCalled();

    // The member arrives on it: now the rule applies.
    mockFocused = true;
    await screen.rerender(tree(<Sermon />));
    expect(audioPlayer.remove).toHaveBeenCalledTimes(1);
  });
});

describe('when the source fails', () => {
  // The re-mint moved from the screen to the provider (W4.9 slice 3), because
  // by the time a token expires the screen may be gone: it now mints through
  // `mintSermonAudioUrl` and hands the position to a FRESH player.
  test('the first error re-mints the URL silently, into a fresh player', async () => {
    await renderScreen();
    await enterAudio();
    expect(createdPlayers).toBe(1);
    await act(() => {
      setAudioStatus({ error: 'Source error' });
    });
    expect(mockMintUrl).toHaveBeenCalledTimes(1);
    expect(mockMintUrl).toHaveBeenCalledWith('one.mp3');
    // The screen's own query is not what re-mints any more.
    expect(mockRefetchUrl).not.toHaveBeenCalled();
    await settle();
    expect(createdPlayers).toBe(2);
    // Still the player, not an error screen: the member should not see a
    // stumble we can fix ourselves.
    expect(screen.queryByText("The audio couldn't play")).not.toBeOnTheScreen();
  });

  test('the handoff to the fresh player stands the old one down first', async () => {
    // The lock-screen invariant (PR #252): two activations without a release
    // between them crash the media session. The spies record the ORDER.
    await renderScreen();
    await enterAudio();
    const activations = audioPlayer.setActiveForLockScreen.mock.calls.length;
    await act(() => {
      setAudioStatus({ error: 'Source error' });
    });
    await settle();
    // The fake hands back the SAME object as the fresh player, so the order
    // is the whole proof: active, stood down, removed, active again.
    expect(
      audioPlayer.setActiveForLockScreen.mock.calls.map((call) => call[0]),
    ).toEqual([true, false, true]);
    expect(audioPlayer.setActiveForLockScreen).toHaveBeenCalledTimes(
      activations + 2,
    );
    const [, stoodDown, reactivated] =
      audioPlayer.setActiveForLockScreen.mock.invocationCallOrder;
    const [removed] = audioPlayer.remove.mock.invocationCallOrder;
    expect(stoodDown).toBeLessThan(removed);
    expect(removed).toBeLessThan(reactivated);
  });

  test('a second error is the member’s to know about', async () => {
    await renderScreen();
    await enterAudio();
    await act(() => {
      setAudioStatus({ error: 'Source error' });
    });
    await settle();
    await act(() => {
      setAudioStatus({ error: null });
      setAudioStatus({ error: 'Source error again' });
    });
    expect(screen.getByText("The audio couldn't play")).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(mockMintUrl).toHaveBeenCalledTimes(2);
  });

  test('a re-mint that is refused shows the retry, not a dead player', async () => {
    mockMintUrl.mockRejectedValueOnce(new Error('refused'));
    await renderScreen();
    await enterAudio();
    await act(() => {
      setAudioStatus({ error: 'Source error' });
    });
    await settle();
    expect(screen.getByText("The audio couldn't play")).toBeOnTheScreen();
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
