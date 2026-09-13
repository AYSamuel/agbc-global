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
  /** An already-allowlisted route (see deepLinks.ts, share/links.ts), or null. */
  route: string | null;
  /**
   * May a GUEST be taken there? A notification's link never (every destination that
   * matters is member-only, and a guest belongs in the gate rather than on a stranger's
   * screen); a scanned share card's link always, because a testimony and a prayer
   * request are guest-browsable and the scanner is more often a stranger than a member
   * (W4.15 slice 2b).
   */
  forGuests: boolean;
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
  set: (route: string, options?: { forGuests: boolean }) => void;
  markEntryDone: () => void;
  /** Reads and clears in one step, so it can only be consumed once. */
  take: () => { route: string; forGuests: boolean } | null;
}

/**
 * Whether the entry router should open a held link, given who is arriving. A member
 * always; a guest only for a link that allows guests, and only when the entry route is
 * Home: a first launch goes to onboarding and a half-created profile resumes AUTH-3, and
 * a testimony pushed over either would be a stranger's screen in the wrong place.
 */
export function mayOpenPending(
  pending: { forGuests: boolean },
  status: 'member' | 'guest' | 'onboarding',
  hasOnboarded: boolean,
): boolean {
  if (status === 'member') return true;
  return pending.forGuests && status === 'guest' && hasOnboarded;
}

export const usePendingDeepLinkStore = create<PendingDeepLinkState>(
  (set, get) => ({
    route: null,
    forGuests: false,
    entryDone: false,
    set: (route, options) => {
      set({ route, forGuests: options?.forGuests ?? false });
    },
    markEntryDone: () => {
      set({ entryDone: true });
    },
    take: () => {
      const { route, forGuests } = get();
      if (route === null) return null;
      set({ route: null, forGuests: false });
      return { route, forGuests };
    },
  }),
);
