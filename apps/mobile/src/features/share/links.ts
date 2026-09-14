// Where a share card's QR points, and what the app does when somebody scans it
// (W4.15 slice 2b, docs/spec/15 "Deep-link configuration").
//
// THE QR IS THE ONLY ELEMENT ON THE CARD A RECIPIENT CAN ACT ON, and the long testimony's
// cut line promises "Read it all in the app" right above it. So the code has to land on
// the thing that was scanned, not on the church's front door, which is where slice 1 sent
// it while the website had nowhere better to go. Both halves of the road now exist:
//
//   * With the app installed, Android opens `https://www.agbcglobal.com/app/*` IN THE APP
//     (the App Links claim in app.config.js, verified against the association file the
//     website serves), and `app/+native-intent.ts` turns the URL into a route below.
//   * Without it, the website's `/app/*` page says what the app is and sends the reader
//     to the store (`Desktop/agbc` src/pages/app/[...rest].astro).
//
// `www`, NEVER THE APEX. `agbcglobal.com` answers 308 to everything, so the browser
// resolves the redirect itself and the app is never asked; only `www` is claimed
// (app.config.js explains why the apex cannot be). A card printed with the apex is a card
// that can never open the app.
//
// SHORT SEGMENTS, BY MEASUREMENT. The code is 138px on a 1080 card and every byte makes
// its modules smaller. `/app/t/<uuid>` (69 bytes) is a version-4 code at error correction
// M, 33 modules, 3.37px per module at 1080, and it decodes at every downscale the
// front-door code did (down to 500px under a nearest-neighbour resample; both fail at
// 400). `/app/testimony/<uuid>` (77 bytes) tips into version 5 and starts failing at
// 600. The plan's §12 said the lever was a shorter URL rather than a bigger code, and
// this is that lever pulled in advance.

import type { ShareContent } from './content';

/** The one origin every share link is built on. */
export const SHARE_ORIGIN = 'https://www.agbcglobal.com';

/** What the footer PRINTS: the address without scheme or `www`, as the frame draws it. */
export const SHARE_ORIGIN_LABEL = SHARE_ORIGIN.replace(
  /^https?:\/\/(www\.)?/,
  '',
);

/**
 * The URL a card's QR encodes. The verse has no page of its own, so its code goes to the
 * app's landing page, which is still a truer answer than the homepage: it says what the
 * app is and where to get it.
 */
export function shareUrlFor(content: ShareContent): string {
  switch (content.kind) {
    case 'testimony':
      return `${SHARE_ORIGIN}/app/t/${content.id}`;
    case 'prayer':
      return `${SHARE_ORIGIN}/app/p/${content.id}`;
    case 'event':
      return `${SHARE_ORIGIN}/app/e/${content.id}`;
    case 'sermon':
      return `${SHARE_ORIGIN}/app/m/${content.id}`;
    case 'branch':
      return `${SHARE_ORIGIN}/app/b/${content.id}`;
    case 'verse':
      return `${SHARE_ORIGIN}/app`;
  }
}

/**
 * The URL shapes the app will treat as a share link: the https form Android hands over,
 * and the same path on the app's own scheme (`agbcglobal://app/...`), which the dev
 * client and a hand-typed `adb shell am start` both produce. Query and fragment are
 * captured only to be dropped, for the reason deepLinks.ts gives: a parameter is how a
 * navigation quietly becomes an action.
 */
const SHARE_LINK =
  /^(?:https:\/\/www\.agbcglobal\.com|agbcglobal:\/)(\/app(?:\/[^?#]*)?)(?:[?#].*)?$/;

/**
 * The id shape a share link may carry into a route parameter. Same conservative test the
 * notification allowlist applies (deepLinks.ts): a segment with a slash or a dot in it is
 * not an id, it is an attempt at something else.
 */
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/** Where a share link lands when it names nothing the app can open: the front door. */
export const SHARE_LINK_FALLBACK = '/home';

/**
 * Is this URL a share link at all? Every other incoming URL (the dev client's own launch
 * URL, a link the app never claimed) must pass through the native-intent hook untouched.
 */
export function isShareLink(url: string): boolean {
  return SHARE_LINK.test(url);
}

/** The one-letter prefix each card prints, and the route it opens. Slice 3 added the
 * event, the message and the branch; the website's `/app/*` page knows the same three. */
const ROUTE_FOR_PREFIX: Record<string, string> = {
  t: '/testimony',
  p: '/prayer',
  e: '/event',
  m: '/sermon',
  b: '/branch',
};

/**
 * The route a share link opens. Returns a string always, never null, and only ever one
 * of the routes above or Home. Everything unrecognised under `/app` goes to Home rather
 * than to an "unmatched route" screen, because a scan that lands on nothing reads as a
 * broken app (docs/spec/04: no dead ends).
 */
export function routeForShareLink(url: string): string {
  const match = SHARE_LINK.exec(url);
  if (match === null) return SHARE_LINK_FALLBACK;
  const path = match[1];
  // Trailing slash is the same link.
  const parts = path.replace(/\/+$/, '').split('/').slice(2);
  if (parts.length !== 2) return SHARE_LINK_FALLBACK;
  const [kind, id] = parts;
  if (!SEGMENT.test(id)) return SHARE_LINK_FALLBACK;
  const route = Object.hasOwn(ROUTE_FOR_PREFIX, kind)
    ? ROUTE_FOR_PREFIX[kind]
    : undefined;
  return route === undefined ? SHARE_LINK_FALLBACK : `${route}/${id}`;
}
