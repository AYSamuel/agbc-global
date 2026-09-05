import {
  activateLockScreen,
  releaseLockScreen,
  type LockScreenPlayer,
} from '../lockScreen';

// The crash this covers is real and it was FATAL: production raised
// `IllegalStateException: Session ID must be unique. ID=` on 2026-09-05, from
// `AudioControlsService.setActivePlayerInternal` building a second media3
// session while the first was still alive (AGBC-MOBILE-3, release 1.0.0 (22)).
//
// The assertions below are about OUR invariant, which is the only half we can
// hold: exactly one player is ever active for the lock screen. What happens
// inside expo-audio when that invariant is kept is a claim about Android and
// belongs on the device, as `08` already says of everything lock-screen shaped.

type FakePlayer = LockScreenPlayer & {
  setActiveForLockScreen: jest.Mock;
};

function fakePlayer(): FakePlayer {
  return { setActiveForLockScreen: jest.fn() };
}

const METADATA = { title: 'Grace that keeps', artist: 'Pastor Ade' };
const OPTIONS = { showSeekForward: true, showSeekBackward: true };

beforeEach(() => {
  // Leave the lock screen unclaimed. The owner is module state, exactly as the
  // real lock screen is process state, so a player from the last test must not
  // still be holding it. Done through the public API rather than a test-only
  // reset: claiming it and handing it straight back IS an unclaimed lock screen,
  // and it exercises the same path everything else here relies on.
  const sentinel = fakePlayer();
  activateLockScreen(sentinel, METADATA, OPTIONS);
  releaseLockScreen(sentinel);
});

describe('who owns the lock screen', () => {
  test('the first player takes it, and nothing is released', () => {
    const player = fakePlayer();

    activateLockScreen(player, METADATA, OPTIONS);

    expect(player.setActiveForLockScreen).toHaveBeenCalledWith(
      true,
      METADATA,
      OPTIONS,
    );
    expect(player.setActiveForLockScreen).toHaveBeenCalledTimes(1);
  });

  test('a second player releases the first BEFORE it takes over', () => {
    // The crash exactly: two players active at once let expo-audio build two
    // media3 sessions with the same (default, empty) id. The order matters as
    // much as the call, because the release is what lets the next build succeed.
    const first = fakePlayer();
    const second = fakePlayer();

    activateLockScreen(first, METADATA, OPTIONS);
    activateLockScreen(second, METADATA, OPTIONS);

    expect(first.setActiveForLockScreen).toHaveBeenLastCalledWith(false);
    expect(second.setActiveForLockScreen).toHaveBeenLastCalledWith(
      true,
      METADATA,
      OPTIONS,
    );
    expect(
      first.setActiveForLockScreen.mock.invocationCallOrder[1],
    ).toBeLessThan(second.setActiveForLockScreen.mock.invocationCallOrder[0]);
  });

  test('a player that already lost the lock screen never releases it again', () => {
    // Two sermon screens can be mounted at once (a deep link pushes a second one
    // and leaves the first mounted, which useSermonAudio's focus effect already
    // documents). The first screen then unmounts LAST, and without this guard its
    // cleanup would tear down the lock screen the second screen is now using.
    const first = fakePlayer();
    const second = fakePlayer();

    activateLockScreen(first, METADATA, OPTIONS);
    activateLockScreen(second, METADATA, OPTIONS);
    first.setActiveForLockScreen.mockClear();

    releaseLockScreen(first);

    expect(first.setActiveForLockScreen).not.toHaveBeenCalled();
    expect(second.setActiveForLockScreen).toHaveBeenLastCalledWith(
      true,
      METADATA,
      OPTIONS,
    );
  });

  test('releasing a player expo-audio has already freed is not fatal', () => {
    // By unmount the player is usually gone: expo-audio's own hook registered
    // its effect first, so its release runs first, and any call into the shared
    // object then throws. Same hazard as the pause in useSermonAudio's focus
    // effect, and the same answer.
    const player = fakePlayer();
    activateLockScreen(player, METADATA, OPTIONS);
    player.setActiveForLockScreen.mockImplementation(() => {
      throw new Error('Cannot use shared object that was already released');
    });

    expect(() => {
      releaseLockScreen(player);
    }).not.toThrow();
  });

  test('the same player re-activating is not released and re-taken', () => {
    // A rebuilt session for a player that already holds the lock screen is the
    // very race this module exists to avoid, so the handoff must be able to tell
    // "somebody else" from "the same one again".
    const player = fakePlayer();

    activateLockScreen(player, METADATA, OPTIONS);
    activateLockScreen(player, METADATA, OPTIONS);

    expect(player.setActiveForLockScreen).not.toHaveBeenCalledWith(false);
  });
});
