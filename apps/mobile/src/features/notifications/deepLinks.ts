// Where a tapped notification is allowed to take you (docs/spec/15, `03`).
//
// THE RULE IS NAVIGATE-ONLY. `15` and `03`'s gate-return security rule both say a deep
// link never carries or triggers a write. That is not a promise the sender can keep on its
// own: `notifications.deep_link` is written by the server today, and by W3.5's broadcast
// composer (with a leader typing a link) tomorrow. So the app treats the value as
// UNTRUSTED and resolves it against an allowlist of routes it is willing to open. A path
// that is not on the list opens the notification centre instead of nothing, because a tap
// that appears to do nothing reads as a broken app.
//
// What the allowlist stops, concretely:
//   * `agbcglobal://` or `https://` targets that would leave the app or re-enter it with
//     someone else's parameters;
//   * `../` traversal into a route that was never meant to be linkable;
//   * query strings, which are how a "navigation" quietly becomes an action
//     (`/give?confirm=1`); expo-router would hand them straight to the screen.
//
// The list is deliberately explicit rather than derived from the router: a route existing
// is not the same as it being safe to open from a lock screen, and a new screen should
// have to be added here on purpose.

/** Static routes a notification may open. */
const STATIC_ROUTES = new Set([
  '/',
  '/home',
  '/watch',
  '/family',
  '/give',
  '/more',
  '/events',
  '/branches',
  '/about',
  '/contact',
  '/academy',
  '/store',
  '/library',
  '/plan',
  '/rhythm',
  '/my-list',
  '/my-posts',
  '/notifications',
  '/settings',
  '/settings/profile',
]);

/**
 * Dynamic routes, as prefix + a single trailing segment.
 *
 * The segment is checked against a conservative shape (uuid or slug characters) rather
 * than accepted wholesale: it lands in a route parameter, and a segment carrying slashes
 * or dots is not an id, it is an attempt at something else.
 */
const DYNAMIC_PREFIXES = [
  '/sermon',
  '/prayer',
  '/testimony',
  '/event',
  '/branch',
  '/course',
];

const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/** Where anything unrecognised goes: the log the notification is already in. */
export const FALLBACK_ROUTE = '/notifications';

/**
 * Resolve a stored `deep_link` into a route this app will open, or the fallback.
 *
 * Returns a string always, never null: every tap must land somewhere. The caller pushes
 * the result and does nothing else with the notification's payload.
 */
export function resolveDeepLink(raw: unknown): string {
  if (typeof raw !== 'string') return FALLBACK_ROUTE;

  const path = raw.trim();

  // Must be an app-relative path. A scheme or authority means it is trying to leave, and
  // `//host` is an authority even without a scheme.
  if (!path.startsWith('/') || path.startsWith('//')) return FALLBACK_ROUTE;

  // No query, no fragment, no traversal. Each of these is how a navigation stops being
  // only a navigation.
  if (/[?#]/.test(path)) return FALLBACK_ROUTE;
  if (path.includes('..')) return FALLBACK_ROUTE;

  // Trailing slash is the same route; normalise before matching so `/more/` is not a miss.
  const normalised =
    path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;

  if (STATIC_ROUTES.has(normalised)) return normalised;

  const lastSlash = normalised.lastIndexOf('/');
  if (lastSlash > 0) {
    const prefix = normalised.slice(0, lastSlash);
    const segment = normalised.slice(lastSlash + 1);
    if (DYNAMIC_PREFIXES.includes(prefix) && SEGMENT.test(segment)) {
      return normalised;
    }
  }

  return FALLBACK_ROUTE;
}

/**
 * Pull the link out of a notification payload.
 *
 * The sender puts it at `data.deepLink` (`_shared/push.ts`). Anything else in `data` is
 * ignored on purpose: the app reads exactly one field from an untrusted payload.
 */
export function deepLinkFromData(data: unknown): string {
  if (typeof data !== 'object' || data === null) return FALLBACK_ROUTE;
  const link = (data as Record<string, unknown>).deepLink;
  return resolveDeepLink(link);
}

/** The notification's own id, used to mark it read on open. Never trusted as a route. */
export function notificationIdFromData(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null;
  const id = (data as Record<string, unknown>).notificationId;
  return typeof id === 'string' && SEGMENT.test(id) ? id : null;
}
