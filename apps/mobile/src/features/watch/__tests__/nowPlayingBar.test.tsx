import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useEffect } from 'react';

import i18n from '@/i18n';
import { audioPlayer, resetAudioMock, setAudioStatus } from '@/test/expoAudio';
import { ThemeScope } from '@/theme';

import { NowPlayingBar } from '../NowPlayingBar';
import {
  NowPlayingProvider,
  useNowPlaying,
  type NowPlayingItem,
} from '../nowPlaying';

// The now-playing bar (docs/spec/08, W4.9 slice 3, frames `NOW-PLAYING-BAR`).
// What it shows and does is decided here; that it survives navigation is the
// provider's job and sermonAudio.test.tsx's subject.

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access --
   documented jest.mock factory shapes */
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('expo-audio', () => require('@/test/expoAudio'));
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access */

const mockPush = jest.fn();
let mockPathname = '/(tabs)/home';
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  usePathname: () => mockPathname,
}));

jest.mock('expo-localization', () => ({
  getLocales: jest.fn(() => [{ languageCode: 'en' }]),
}));

jest.mock('../audioSource', () => ({
  mintSermonAudioUrl: (_audioPath: string) =>
    Promise.resolve('https://storage.test/sermon-audio/one.mp3?token=fresh'),
}));

jest.mock('../serverPosition', () => ({
  saveServerPosition: () => Promise.resolve(true),
}));

jest.mock('@/state/auth', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({ status: 'guest' }),
}));

const ITEM: NowPlayingItem = {
  sermonId: 'aaa',
  title: 'Multiple streams of income',
  artist: 'Pastor Olayinka Ademiluka',
  artworkUrl: null,
  audioPath: 'one.mp3',
  signedUrl: 'https://storage.test/sermon-audio/one.mp3?token=abc',
};

/** Stands in for the player screen: loads a message the way AudioMode does,
 * keyed on the MESSAGE and not the callback, so a stop is not undone by a
 * re-render loading it again. */
function Loader({ item }: { item: NowPlayingItem | null }) {
  const { load } = useNowPlaying();
  useEffect(() => {
    if (item !== null) load(item, { startAtSec: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);
  return null;
}

function renderBar(item: NowPlayingItem | null) {
  return render(
    <ThemeScope name="light">
      <NowPlayingProvider>
        <Loader item={item} />
        <NowPlayingBar where="above-tabs" />
      </NowPlayingProvider>
    </ThemeScope>,
  );
}

beforeAll(() => i18n.changeLanguage('en'));

beforeEach(() => {
  jest.clearAllMocks();
  resetAudioMock();
  mockPathname = '/(tabs)/home';
});

test('draws nothing while nothing is loaded', async () => {
  await renderBar(null);
  expect(screen.queryByRole('button')).not.toBeOnTheScreen();
});

test('names the message and its speaker, and opens the player on tap', async () => {
  await renderBar(ITEM);
  await act(() => {
    setAudioStatus({ isLoaded: true, duration: 2280 });
  });

  expect(screen.getByText('Multiple streams of income')).toBeOnTheScreen();
  expect(screen.getByText('Pastor Olayinka Ademiluka')).toBeOnTheScreen();

  await fireEvent.press(
    screen.getByRole('button', {
      name: 'Now playing: Multiple streams of income, Pastor Olayinka Ademiluka',
    }),
  );
  expect(mockPush).toHaveBeenCalledWith('/sermon/aaa');
});

test('the disc plays and pauses the one player', async () => {
  await renderBar(ITEM);
  await act(() => {
    setAudioStatus({ isLoaded: true, duration: 2280 });
  });

  await fireEvent.press(screen.getByRole('button', { name: 'Play' }));
  expect(audioPlayer.play).toHaveBeenCalledTimes(1);
  await act(() => {
    setAudioStatus({ playing: true });
  });

  await fireEvent.press(screen.getByRole('button', { name: 'Pause' }));
  expect(audioPlayer.pause).toHaveBeenCalledTimes(1);
});

test('play after the end starts the message over', async () => {
  // A finished native player does not move on `play()`; 08 says the end is
  // "start over", so the disc seeks to 0 first (found on the tablet).
  await renderBar(ITEM);
  await act(() => {
    setAudioStatus({
      isLoaded: true,
      duration: 2280,
      currentTime: 2280,
      didJustFinish: true,
    });
  });

  await fireEvent.press(screen.getByRole('button', { name: 'Play' }));
  await act(async () => {
    await Promise.resolve();
  });

  expect(audioPlayer.seekTo).toHaveBeenCalledWith(0);
  expect(audioPlayer.play).toHaveBeenCalledTimes(1);
  const [seek] = audioPlayer.seekTo.mock.invocationCallOrder;
  const [play] = audioPlayer.play.mock.invocationCallOrder;
  expect(seek).toBeLessThan(play);
});

test('the cross stops listening: the player is released and the bar goes', async () => {
  await renderBar(ITEM);
  await act(() => {
    setAudioStatus({ isLoaded: true, duration: 2280 });
  });

  await fireEvent.press(screen.getByRole('button', { name: 'Stop listening' }));

  expect(audioPlayer.remove).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('button')).not.toBeOnTheScreen();
});

test('stands aside on the player itself, and only there', async () => {
  mockPathname = '/sermon/aaa';
  await renderBar(ITEM);
  await act(() => {
    setAudioStatus({ isLoaded: true, duration: 2280 });
  });
  // The player is its own bar.
  expect(screen.queryByRole('button')).not.toBeOnTheScreen();

  // A DIFFERENT message's screen is elsewhere: the bar shows what is playing
  // so the member can get back to it.
  mockPathname = '/sermon/bbb';
  await screen.rerender(
    <ThemeScope name="light">
      <NowPlayingProvider>
        <Loader item={ITEM} />
        <NowPlayingBar where="above-tabs" />
      </NowPlayingProvider>
    </ThemeScope>,
  );
  expect(screen.getByText('Multiple streams of income')).toBeOnTheScreen();
});
