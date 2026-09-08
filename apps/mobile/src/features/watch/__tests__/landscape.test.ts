import { renderHook } from '@testing-library/react-native';

/**
 * The player's landscape unlock (W4.7 slice 4, `05`: "player and reader support
 * landscape on all devices" while the app itself stays portrait ON A PHONE).
 *
 * The behaviour that matters is the PAIR: lifting the lock on the way in and restoring
 * it on the way out. A hook that only unlocked would leave every other screen
 * rotatable, and none of them has been verified in landscape.
 *
 * W4.11 made the restore CONDITIONAL, and that is what most of this file is now about.
 * The app's portrait lock applies to phones only, so putting it back on a tablet would
 * leave the tablet stuck in portrait for the rest of the session, which is exactly the
 * bug W4.11 exists to fix, reintroduced one screen at a time.
 */

// `mock`-prefixed, because a jest.mock factory is hoisted above these declarations and
// may not reach an ordinary out-of-scope name.
const mockLockAsync = jest.fn((_lock: number) => Promise.resolve());
const mockUnlockAsync = jest.fn(() => Promise.resolve());

jest.mock('expo-screen-orientation', () => ({
  OrientationLock: { DEFAULT: 0, PORTRAIT_UP: 1 },
  lockAsync: (lock: number) => mockLockAsync(lock),
  unlockAsync: () => mockUnlockAsync(),
}));

/**
 * THE DEFAULT WINDOW UNDER JEST IS A TABLET, and nothing says so out loud: jest-expo
 * reports 750x1334, whose smallest side is 750, well over `layout.ts`'s 600dp line. So
 * anything conditional on `isTablet` is silently ON in every test that does not set a
 * size, and this file's own "puts the lock back" test went green-then-red the moment
 * the restore became conditional. Every device class here is therefore stated.
 */
let mockWidth = 400;
let mockHeight = 900;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({
    width: mockWidth,
    height: mockHeight,
    scale: 2,
    fontScale: 1,
  }),
}));

function onAPhone() {
  mockWidth = 400;
  mockHeight = 900;
}

function onATablet() {
  mockWidth = 800;
  mockHeight = 1280;
}

// Imported after the mocks so the module's guarded require picks them up.
const { useLandscapeAllowed, rotationAvailable } =
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- must load after jest.mock
  require('../useLandscapeAllowed') as typeof import('../useLandscapeAllowed');

beforeEach(() => {
  jest.clearAllMocks();
  onAPhone();
});

test('the module is found, so the guard is not silently swallowing it', () => {
  // Without this the rest of the file would pass just as happily against a module that
  // failed to load, which is exactly what the guard is for.
  expect(rotationAvailable).toBe(true);
});

test('entering the player lifts the portrait lock', async () => {
  await renderHook(() => {
    useLandscapeAllowed();
  });
  expect(mockUnlockAsync).toHaveBeenCalledTimes(1);
  expect(mockLockAsync).not.toHaveBeenCalled();
});

test('leaving it puts the lock back on a phone, so nothing else inherits rotation', async () => {
  const view = await renderHook(() => {
    useLandscapeAllowed();
  });
  // RNTL v14: unmount is async too, like render.
  await view.unmount();
  expect(mockLockAsync).toHaveBeenCalledWith(1);
});

test('leaving it does NOT lock a tablet, which was never locked to begin with', async () => {
  // The whole of W4.11 is that a tablet can turn. Restoring a lock here would take
  // that away for the rest of the session, one screen at a time.
  onATablet();
  const view = await renderHook(() => {
    useLandscapeAllowed();
  });
  await view.unmount();
  expect(mockUnlockAsync).toHaveBeenCalledTimes(1);
  expect(mockLockAsync).not.toHaveBeenCalled();
});

test('disabled, it does not touch the orientation at all', async () => {
  await renderHook(() => {
    useLandscapeAllowed(false);
  });
  expect(mockUnlockAsync).not.toHaveBeenCalled();
  expect(mockLockAsync).not.toHaveBeenCalled();
});
