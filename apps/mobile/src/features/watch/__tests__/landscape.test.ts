import { renderHook } from '@testing-library/react-native';

/**
 * The player's landscape unlock (W4.7 slice 4, `05`: "player and reader support
 * landscape on all devices" while the app itself stays portrait).
 *
 * The behaviour that matters is the PAIR: lifting the lock on the way in and
 * restoring it on the way out. A hook that only unlocked would leave every other
 * screen rotatable, and none of them has been verified in landscape.
 */

// `mock`-prefixed, because a jest.mock factory is hoisted above these
// declarations and may not reach an ordinary out-of-scope name.
const mockLockAsync = jest.fn((_lock: number) => Promise.resolve());
const mockUnlockAsync = jest.fn(() => Promise.resolve());

jest.mock('expo-screen-orientation', () => ({
  OrientationLock: { DEFAULT: 0, PORTRAIT_UP: 1 },
  lockAsync: (lock: number) => mockLockAsync(lock),
  unlockAsync: () => mockUnlockAsync(),
}));

// Imported after the mock so the module's guarded require picks it up.
const { useLandscapeAllowed, rotationAvailable } =
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- must load after jest.mock
  require('../useLandscapeAllowed') as typeof import('../useLandscapeAllowed');

beforeEach(() => {
  jest.clearAllMocks();
});

test('the module is found, so the guard is not silently swallowing it', () => {
  // Without this the rest of the file would pass just as happily against a
  // module that failed to load, which is exactly what the guard is for.
  expect(rotationAvailable).toBe(true);
});

test('entering the player lifts the app-wide portrait lock', async () => {
  await renderHook(() => {
    useLandscapeAllowed();
  });
  expect(mockUnlockAsync).toHaveBeenCalledTimes(1);
  expect(mockLockAsync).not.toHaveBeenCalled();
});

test('leaving it puts the lock back, so nothing else inherits rotation', async () => {
  const view = await renderHook(() => {
    useLandscapeAllowed();
  });
  // RNTL v14: unmount is async too, like render.
  await view.unmount();
  expect(mockLockAsync).toHaveBeenCalledWith(1);
});

test('disabled, it does not touch the orientation at all', async () => {
  await renderHook(() => {
    useLandscapeAllowed(false);
  });
  expect(mockUnlockAsync).not.toHaveBeenCalled();
  expect(mockLockAsync).not.toHaveBeenCalled();
});
