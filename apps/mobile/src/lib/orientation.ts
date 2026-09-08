import { useEffect } from 'react';

import { useLayout } from './layout';

// Which way up the app is allowed to be (W4.11 slice 1).
//
// WHY THIS EXISTS AT ALL, when a single line of `app.config.js` used to do it. Until
// 1.0.1 the answer was `orientation: 'portrait'`, which Expo turns into
// `android:screenOrientation="PORTRAIT"` on MainActivity: one rule for every device on
// every Android version. Play's release dashboard flagged it, and it turned out to be a
// real bug rather than a console preference.
//
// W4.7 BUILT TABLET LAYOUTS THAT AN ANDROID 15 TABLET CANNOT REACH. The nav rail,
// Watch's two-pane, Home's dashboard grid: all of them need the device to be able to
// turn, and that manifest attribute forbade it. Android 16 ignores orientation locks on
// large screens, which is the ONLY reason the tablet work was ever testable, so those
// layouts currently exist for exactly one Android version. `05` §Tablet has said
// "tablet rendering is not optional" since 2026-07-12.
//
// So the rule moves from the manifest into the app, where it can be conditional:
// **portrait on a phone, free on a tablet, and the player may rotate anywhere.**
// `expo-screen-orientation` has been a dependency since W3.1 and is already linked, so
// this adds no native module and trips no dev-client fence.
//
// WHAT THIS COSTS, both worth knowing before blaming something else later:
//
//  1. A LAUNCH WINDOW THE MANIFEST DID NOT HAVE. The system applied that attribute
//     before the activity existed; this runs in an effect, so a phone launched while
//     held sideways can show one frame of landscape before the lock lands.
//  2. THE SAFETY PROPERTY INVERTS. While the manifest held the lock, a missing
//     `expo-screen-orientation` still could not rotate: the guarded require failed
//     safe. Now a missing module means free rotation into screens never verified in
//     landscape. Production always has it (every EAS build links it); an old dev client
//     is the case that would rotate, and it degrades rather than crashing.
//
// And the thing not to pretend: taking a restriction out of the manifest is also what
// makes Play's static check stop reporting it. That is a side effect, not the reason.

/** Only what this app calls. */
interface OrientationModule {
  OrientationLock: { DEFAULT: number; PORTRAIT_UP: number };
  lockAsync: (lock: number) => Promise<void>;
  unlockAsync: () => Promise<void>;
}

function loadOrientation(): OrientationModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-screen-orientation') as OrientationModule;
  } catch {
    return null;
  }
}

const Orientation = loadOrientation();

/** True when the native module is present, so a caller can say so if it must. */
export const rotationAvailable = Orientation !== null;

/**
 * A refusal is never worth a visible error. The member keeps whichever orientation
 * they already had, which is the same outcome as the module being absent.
 */
export function lockPortrait(): void {
  if (Orientation === null) return;
  void Orientation.lockAsync(Orientation.OrientationLock.PORTRAIT_UP).catch(
    () => undefined,
  );
}

export function allowRotation(): void {
  if (Orientation === null) return;
  void Orientation.unlockAsync().catch(() => undefined);
}

/**
 * The app's baseline, mounted once at the root: portrait on a phone, untouched on a
 * tablet.
 *
 * `isTablet` is SMALLEST width (`layout.ts`, Android's own `sw600dp`), so it does not
 * change when the device turns and this cannot fight itself mid-rotation. It can still
 * change if a tablet is put into a small freeform or split-screen window, which would
 * ask for a portrait lock; Android ignores orientation requests in those windows, so
 * the request is inert rather than wrong.
 */
export function usePortraitOnPhone(): void {
  const { isTablet } = useLayout();
  useEffect(() => {
    if (isTablet) return;
    lockPortrait();
  }, [isTablet]);
}
