import { useEffect, useState } from 'react';

// A controllable stand-in for expo-audio. jest-expo ships no mock for it, and
// importing the real module in a test explodes on `AudioModule.AudioPlayer.
// prototype` (the native side is absent), which takes the whole suite down.
//
// Use it as: jest.mock('expo-audio', () => require('@/test/expoAudio'));
// then drive playback from the test with `setAudioStatus` inside `act`.
//
// What this can and cannot prove (~/.claude/standards/qa-testing.md is right that
// a hand-rolled stand-in only proves the code matches our BELIEF about the
// library). It proves OUR decisions: which stored position wins, where a skip
// lands, which control the screen shows, which analytics event fires, that a
// failed source is re-minted exactly once. It proves NOTHING about whether audio
// actually keeps playing with the screen off or whether the lock screen binds:
// those are claims about expo-audio and Android, and `08` puts them where they
// belong, on the physical device for 10+ minutes. Same posture the YouTube iframe
// has had since W1.3, and for the same reason: importing the real module here
// throws, because the native half is not present.

export interface FakeAudioStatus {
  id: string;
  currentTime: number;
  duration: number;
  playing: boolean;
  isLoaded: boolean;
  isBuffering: boolean;
  didJustFinish: boolean;
  playbackRate: number;
  error: string | null;
}

const INITIAL: FakeAudioStatus = {
  id: 'fake-player',
  currentTime: 0,
  duration: 0,
  playing: false,
  isLoaded: false,
  isBuffering: false,
  didJustFinish: false,
  playbackRate: 1,
  error: null,
};

let status: FakeAudioStatus = { ...INITIAL };
const subscribers = new Set<() => void>();

// expo-audio releases the player when the component unmounts, and any call into
// a released shared object throws. Modelled here because it is a real hazard the
// device found: a cleanup that pauses the player runs at unmount too, and without
// a guard it took the whole screen down with a render error.
let released = false;

function refuseIfReleased(): void {
  if (released) {
    throw new Error('Cannot use shared object that was already released');
  }
}

export const audioPlayer = {
  id: 'fake-player',
  currentTime: 0,
  play: jest.fn(refuseIfReleased),
  pause: jest.fn(refuseIfReleased),
  seekTo: jest.fn((): Promise<void> => {
    refuseIfReleased();
    return Promise.resolve();
  }),
  setPlaybackRate: jest.fn(refuseIfReleased),
  // Typed with its arguments so a test can read the ORDER of activations and
  // stand-downs (`true`, `false`) off `mock.calls`.
  setActiveForLockScreen: jest.fn(
    (_active: boolean, _metadata?: unknown, _options?: unknown): void => {
      refuseIfReleased();
    },
  ),
  updateLockScreenMetadata: jest.fn(refuseIfReleased),
  clearLockScreenControls: jest.fn(refuseIfReleased),
  // `remove()` is how a player created with `createAudioPlayer` is released
  // (W4.9 slice 3): after it, every call throws, exactly as after the hook's
  // own release. Every player shares these spies, so a test sees one stream
  // of calls: the handoff's ORDER (stand down, remove, then activate the next)
  // is what they record.
  remove: jest.fn(() => {
    released = true;
  }),
};

/** How many players `createAudioPlayer` has minted since the last reset. */
export let createdPlayers = 0;

export function createAudioPlayer(): typeof audioPlayer {
  released = false;
  createdPlayers += 1;
  // A DISTINCT object per player, sharing the spies through its prototype.
  // The provider keys its handoff effects on the player's identity, exactly
  // as the real module hands back a new object each time; a fake that
  // returned the same object re-armed would keep those effects from running
  // and hide a missing re-activation.
  const player = Object.create(audioPlayer) as typeof audioPlayer;
  player.id = `fake-player-${String(createdPlayers)}`;
  return player;
}

export const setAudioModeAsync = jest.fn((): Promise<void> =>
  Promise.resolve(),
);

/** Advance the fake playback. Call inside `act()`. */
export function setAudioStatus(next: Partial<FakeAudioStatus>): void {
  status = { ...status, ...next };
  if (next.currentTime !== undefined)
    audioPlayer.currentTime = next.currentTime;
  subscribers.forEach((notify) => {
    notify();
  });
}

/** Back to a fresh, unloaded player. Call in `beforeEach`. */
export function resetAudioMock(): void {
  status = { ...INITIAL };
  released = false;
  createdPlayers = 0;
  audioPlayer.currentTime = 0;
  audioPlayer.id = 'fake-player';
  [
    audioPlayer.play,
    audioPlayer.pause,
    audioPlayer.seekTo,
    audioPlayer.setPlaybackRate,
    audioPlayer.setActiveForLockScreen,
    audioPlayer.updateLockScreenMetadata,
    audioPlayer.clearLockScreenControls,
    audioPlayer.remove,
    setAudioModeAsync,
  ].forEach((spy) => {
    spy.mockClear();
  });
}

export function useAudioPlayer(): typeof audioPlayer {
  // Registered BEFORE any effect in the hook under test, exactly as the real
  // `useReleasingSharedObject` is, so its cleanup runs first on unmount and
  // anything cleaning up after it meets a released player.
  useEffect(() => {
    released = false;
    return () => {
      released = true;
    };
  }, []);
  return audioPlayer;
}

export function useAudioPlayerStatus(): FakeAudioStatus {
  const [, bump] = useState(0);
  useEffect(() => {
    const notify = () => {
      bump((n) => n + 1);
    };
    subscribers.add(notify);
    return () => {
      subscribers.delete(notify);
    };
  }, []);
  return status;
}
