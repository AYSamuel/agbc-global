import { renderHook } from '@testing-library/react-native';

/**
 * The app's orientation baseline (W4.11 slice 1): portrait on a phone, untouched on a
 * tablet.
 *
 * This replaced `orientation: 'portrait'` in `app.config.js`, which Expo turned into
 * `android:screenOrientation="PORTRAIT"` on MainActivity and applied to every device.
 * That held tablets in portrait on Android 15 and below, so W4.7's tablet layouts could
 * only be reached on Android 16, which ignores the lock. The rule had to become
 * conditional, and a manifest attribute cannot be.
 */

// `mock`-prefixed, because a jest.mock factory is hoisted above these declarations.
const mockLockAsync = jest.fn((_lock: number) => Promise.resolve());
const mockUnlockAsync = jest.fn(() => Promise.resolve());

jest.mock('expo-screen-orientation', () => ({
  OrientationLock: { DEFAULT: 0, PORTRAIT_UP: 1 },
  lockAsync: (lock: number) => mockLockAsync(lock),
  unlockAsync: () => mockUnlockAsync(),
}));

/**
 * THE DEFAULT WINDOW UNDER JEST IS A TABLET: jest-expo reports 750x1334, whose smallest
 * side is 750 against `layout.ts`'s 600dp line. So a test that does not state a size is
 * testing the tablet branch while reading as if it tested the phone, and the phone
 * branch is the one carrying the lock. Every test here sets its device.
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

// Imported after the mocks so the module's guarded require picks them up.
const { usePortraitOnPhone, lockPortrait, allowRotation, rotationAvailable } =
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- must load after jest.mock
  require('../orientation') as typeof import('../orientation');

beforeEach(() => {
  jest.clearAllMocks();
  mockWidth = 400;
  mockHeight = 900;
});

test('the module is found, so the guard is not silently swallowing it', () => {
  expect(rotationAvailable).toBe(true);
});

describe('the baseline the root mounts', () => {
  test('a phone is locked to portrait', async () => {
    await renderHook(() => {
      usePortraitOnPhone();
    });
    // PORTRAIT_UP, not DEFAULT: DEFAULT means "whatever the system likes", which on a
    // phone is exactly the free rotation this exists to prevent.
    expect(mockLockAsync).toHaveBeenCalledWith(1);
  });

  test('a tablet is left alone entirely', async () => {
    // The point of the item. A tablet must be able to turn on every Android version,
    // not only on 16, or W4.7's layouts are unreachable.
    mockWidth = 800;
    mockHeight = 1280;
    await renderHook(() => {
      usePortraitOnPhone();
    });
    expect(mockLockAsync).not.toHaveBeenCalled();
    expect(mockUnlockAsync).not.toHaveBeenCalled();
  });

  test('a phone in landscape is still a phone, and is still locked', async () => {
    // Smallest width, not current width: turning a device must not change what kind of
    // device it is, or the lock would fight the rotation that produced it.
    mockWidth = 900;
    mockHeight = 400;
    await renderHook(() => {
      usePortraitOnPhone();
    });
    expect(mockLockAsync).toHaveBeenCalledWith(1);
  });

  test('a small tablet at exactly the line counts as a tablet', async () => {
    mockWidth = 600;
    mockHeight = 960;
    await renderHook(() => {
      usePortraitOnPhone();
    });
    expect(mockLockAsync).not.toHaveBeenCalled();
  });
});

describe('the primitives the player uses', () => {
  test('lockPortrait asks for PORTRAIT_UP, whatever the device', () => {
    // Unconditional on purpose: the caller decides, because the player has to restore
    // the lock only where there was one. Putting the check in here would hide it.
    mockWidth = 800;
    mockHeight = 1280;
    lockPortrait();
    expect(mockLockAsync).toHaveBeenCalledWith(1);
  });

  test('allowRotation unlocks', () => {
    allowRotation();
    expect(mockUnlockAsync).toHaveBeenCalledTimes(1);
  });

  test('a rejected lock is swallowed, because a refusal is not worth a red screen', async () => {
    mockLockAsync.mockRejectedValueOnce(new Error('no'));
    expect(() => {
      lockPortrait();
    }).not.toThrow();
    // Let the rejection settle so it cannot surface as an unhandled rejection.
    await Promise.resolve();
  });
});
