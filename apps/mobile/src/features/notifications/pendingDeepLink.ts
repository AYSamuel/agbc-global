// The one notification tap that cannot navigate when it happens (docs/spec/15).
//
// A tap on a KILLED app launches the app, and `getLastNotificationResponseAsync` reports
// it during the first mount. Pushing there does not work, and not for the reason it looks
// like: the navigator is ready enough, but `app/index.tsx` is still going to run its own
// entry routing after the splash delay and `router.replace()` the entry route over
// whatever we pushed. Found on device 2026-08-16: the notification opened the app and
// landed on Home instead of the linked screen, with no error anywhere.
//
// So the cold-start link is HELD here and consumed by the entry router itself, which is
// the one place that knows when launch navigation has finished. The warm path (a tap while
// the app is running) never comes through here: it navigates immediately, because there is
// no entry routing left to fight.
//
// Not persisted, deliberately. A deep link is about a tap that just happened; restoring one
// from a previous launch would teleport a member somewhere they never asked to go.

import { create } from 'zustand';

interface PendingDeepLinkState {
  /** An already-allowlisted route (see deepLinks.ts), or null. */
  route: string | null;
  /**
   * Has `app/index.tsx` finished its launch navigation?
   *
   * THE CONDITION IS THIS, NOT "was the tap a cold start", and the difference cost a
   * device round trip to find. FCM WAKES A KILLED APP to deliver, so by the time the
   * member taps, the process is often alive and the tap arrives through the ordinary
   * listener rather than `getLastNotificationResponseAsync`. It is still racing the entry
   * `router.replace()`, which is what actually eats the navigation. Asking "has entry
   * routing happened" covers both shapes; asking "was this cold" covers one of them.
   *
   * Not persisted: a fresh process always starts false, and `index.tsx` always mounts on a
   * fresh process, so there is no launch where this is stuck true with nobody to consume.
   */
  entryDone: boolean;
  set: (route: string) => void;
  markEntryDone: () => void;
  /** Reads and clears in one step, so it can only be consumed once. */
  take: () => string | null;
}

export const usePendingDeepLinkStore = create<PendingDeepLinkState>(
  (set, get) => ({
    route: null,
    entryDone: false,
    set: (route) => {
      set({ route });
    },
    markEntryDone: () => {
      set({ entryDone: true });
    },
    take: () => {
      const { route } = get();
      if (route !== null) set({ route: null });
      return route;
    },
  }),
);
