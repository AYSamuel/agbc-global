// Every URL the OS hands the app passes through here before expo-router routes it
// (W4.15 slice 2b, docs/spec/15 "Deep-link configuration").
//
// The only URLs rewritten are share links, `https://www.agbcglobal.com/app/*` and the
// same path on the app's own scheme: a scanned card's QR, opened in the app because
// Android verified the App Links claim. Everything else (the dev client's launch URL,
// anything the app never claimed) is returned exactly as it arrived.
//
// THE COLD START IS THE HARD HALF, and the notification tap already solved it. A link
// that LAUNCHES the app cannot simply become the initial route: `app/index.tsx` is about
// to run its own entry routing after the splash and `router.replace()` over whatever the
// URL opened (found on device 2026-08-16 for notifications, and the mechanism is the
// same). So until the entry router has run, the route is HELD in the pending-link store
// and this hook answers with the root, which mounts the splash as on any launch; the
// entry router pushes the held route once its own navigation is done. Once entry routing
// has happened the answer is the route itself and expo-router navigates.
//
// A share link is opened FOR GUESTS TOO, which is the one way it differs from a
// notification's link: a testimony and a prayer request are guest-browsable (docs/spec/04,
// guest-first), and the person scanning a card is more often a stranger than a member.

import { usePendingDeepLinkStore } from '@/features/notifications/pendingDeepLink';
import { isShareLink, routeForShareLink } from '@/features/share/links';

export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}): string {
  if (!isShareLink(path)) return path;
  const route = routeForShareLink(path);
  const pending = usePendingDeepLinkStore.getState();
  if (!pending.entryDone) {
    pending.set(route, { forGuests: true });
    return '/';
  }
  return route;
}
