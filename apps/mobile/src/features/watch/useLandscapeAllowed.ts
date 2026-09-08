import { useEffect } from 'react';

import { useLayout } from '@/lib/layout';
import {
  allowRotation,
  lockPortrait,
  rotationAvailable,
} from '@/lib/orientation';

/**
 * Let ONE screen rotate on a phone, in an app that is otherwise portrait.
 *
 * `05` asks for landscape on the player and the reader specifically, not everywhere:
 * unlocking every screen would mean verifying each one at roughly 400dp of height, with
 * a keyboard, at large font scales, which is a far bigger promise than the one `05`
 * makes and one no member is asking for. So the player lifts the app's own lock while
 * it is on screen and puts it back when it leaves.
 *
 * WHAT CHANGED AT W4.11. The lock it lifts used to be the MANIFEST'S, applied to every
 * device by `orientation: 'portrait'`; it is now the app's own, applied only to phones
 * (`lib/orientation.ts`, which explains why). Two consequences here:
 *
 *  - Putting the lock back is now conditional. On a tablet there was no lock to begin
 *    with, and re-imposing one on the way out of the player would leave a tablet stuck
 *    in portrait for the rest of the session, which is the exact bug W4.11 exists to
 *    fix, reintroduced one screen at a time.
 *  - The unlock still runs on every device. It is a no-op on a tablet, and asking is
 *    cheaper than a second branch that has to stay in step with the first.
 */
export { rotationAvailable };

export function useLandscapeAllowed(enabled = true): void {
  const { isTablet } = useLayout();

  useEffect(() => {
    if (!enabled) return;
    allowRotation();

    return () => {
      // A tablet was never locked, so there is nothing to restore.
      if (isTablet) return;
      lockPortrait();
    };
  }, [enabled, isTablet]);
}
