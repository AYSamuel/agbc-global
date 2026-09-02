import { useEffect } from 'react';

/**
 * Let ONE screen rotate, in an app that is otherwise locked to portrait.
 *
 * `05` asks for landscape on the player and the reader specifically, not
 * everywhere: `app.config.js` stays `orientation: 'portrait'`, because unlocking
 * it app-wide would mean every screen had to be verified in landscape, which is
 * a far bigger promise than the one `05` makes. So the player asks for the lock
 * to be lifted while it is on screen and puts it back when it leaves.
 *
 * NOTE ON TABLETS: current Android ignores an app's orientation lock on large
 * screens outright, so a tablet already rotates everywhere and this hook changes
 * nothing there. It exists for the phone, where the lock is honoured and a
 * sermon watched in landscape is the whole point.
 *
 * `expo-screen-orientation` is a NATIVE module, so this follows the same guarded
 * require the repo already uses for `expo-clipboard` and `expo-linear-gradient`:
 * a dev client built before it was linked throws at import and would take the
 * route down with it. Guarded, the player simply stays portrait on an old dev
 * client instead of crashing, and the next EAS build links it for real.
 */
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

export function useLandscapeAllowed(enabled = true): void {
  useEffect(() => {
    if (Orientation === null || !enabled) return;

    const orientation = Orientation;
    // A refusal is not worth a visible error either way: the member simply keeps
    // the portrait player they already had.
    void orientation.unlockAsync().catch(() => undefined);

    // Leaving the screen puts the app's own lock back, so no other screen
    // inherits a rotation it was never verified in.
    return () => {
      void orientation
        .lockAsync(orientation.OrientationLock.PORTRAIT_UP)
        .catch(() => undefined);
    };
  }, [enabled]);
}
