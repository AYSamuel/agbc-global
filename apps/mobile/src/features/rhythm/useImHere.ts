import { localDateKey } from '@/features/home/queries';
import { useNotificationAskStore } from '@/features/notifications/ask';
import { pushWrite, usePendingWrite } from '@/lib/writeQueue';
import { useAuthStore } from '@/state/auth';

import { announceCheckIn } from './announce';
import { applyCheckedInToCache } from './rhythmCache';

// "I'm here" (docs/spec/10): what the control shows, and what a tap does.
//
// The guest branch lives here rather than in the card, for the same reason
// useGloryPress owns Glory's: "browsing is free, contributing signs you in" is
// one app-wide rule (docs/spec/03), and a copy of it per screen is a copy to get
// wrong.

export interface ImHereControl {
  /** Whether the card shows the quiet checked-in state instead of the action. */
  checkedIn: boolean;
  press: () => void;
}

/**
 * Record a check-in: show it, queue it, say it. The three steps live together
 * because there are two ways to reach them, an ordinary tap and a gate-return
 * after signing in, and they must be the same act (docs/spec/03 rule 9). Not a
 * hook, so the gate-return executor can call it too.
 */
export function queueCheckIn(branchId: string): void {
  // Screen first, then the wire, exactly as a Glory tap does.
  applyCheckedInToCache(branchId);
  // The entity is the day and the state is the branch: see QueuedStates.
  pushWrite('attendance', localDateKey(new Date()), branchId);
  // True the moment they tap: the app has their intention, and the queue will
  // deliver it whenever it can. The server's own correction, when the day turns
  // out to be recorded already, comes from the handler.
  announceCheckIn('recorded');
  // The first value moment (docs/spec/06): gathering with the family is the
  // thing a reminder is FOR, so this is where the app earns the right to ask.
  // Raised on the tap rather than on delivery, because the sheet belongs to the
  // moment the member is living, not to whenever the queue drains. RSVP joins
  // this at W2.9, when an RSVP starts recording rather than only gating.
  useNotificationAskStore.getState().reachedValueMoment();
}

/**
 * @param branchId the BROWSED branch. Attendance records where the member is
 * standing, not where they belong (docs/spec/07): a diaspora member visiting
 * Glasgow checks in at Glasgow, and their rhythm counts it just the same.
 * @param serverCheckedIn `checked_in` from `rhythm_state`, which is the server's
 * answer for its own idea of today. The app never decides this.
 * @param onGateNeeded opens the screen's gate sheet; the sheet belongs to the
 * screen that owns its visibility.
 */
export function useImHerePress(
  branchId: string | null,
  serverCheckedIn: boolean,
  onGateNeeded: () => void,
): ImHereControl {
  const isMember = useAuthStore((state) => state.status === 'member');
  // A tap that has not reached the server yet still shows as checked in: the
  // queue IS the app's record of an unsent wish, so reading it here is what
  // makes an offline tap answer on the next frame (docs/spec/01 §8).
  const pending = usePendingWrite('attendance', localDateKey(new Date()));

  return {
    checkedIn: serverCheckedIn || pending !== undefined,
    press: () => {
      if (!isMember) {
        onGateNeeded();
        return;
      }
      if (branchId === null || serverCheckedIn) return;
      queueCheckIn(branchId);
    },
  };
}
