import type { SermonSummary } from './queries';

// Which picture a message shows (W3.1 slice 5, docs/spec/08 §Media architecture).
//
// ONE VISIBLE FACT, ONE OWNER. Four surfaces draw this picture (Watch's hero, every rail
// and search and MY-LIST row, the player's artwork, and the lock screen the OS renders for
// us), and the precedence between two columns is exactly the kind of rule that quietly
// diverges when each surface decides it for itself. It is decided here, once.
//
// Ours wins over YouTube's: a message the church made a cover for should show the cover.
// `thumbnail_url` stays what it always was, the sync's column, written nightly from the
// Data API and never by us; that is why the artwork has a column of its own.
//
// Null means neither, which is not a failure: the branded gradient behind the artwork slot
// is a designed state the app has drawn since W1.3.

export const SERMON_ARTWORK_BUCKET = 'sermon-artwork';

/**
 * The public object URL, built rather than asked for.
 *
 * This module deliberately does NOT import `@/lib/supabase`. `SermonRow` is a
 * presentational component rendered in four places, and reaching the client's
 * `getPublicUrl()` would drag the network singleton into every screen that lists a
 * message, for a string. The jest suite found it immediately, and it was right to: a row
 * that cannot render without a configured backend is a row with a dependency it does not
 * need.
 *
 * Two things make building it safe rather than clever. The route is the documented public
 * one for a public bucket, which is what `getPublicUrl` itself assembles; and the path
 * needs no escaping BY CONSTRUCTION, because both the storage INSERT policy and the
 * server-side mint force `<uuid>.<ext>` (`20260815140000`), so there is never a character
 * in it that a URL would have to encode.
 *
 * Read at call time, not module scope, so a test can set it. In the app it is always
 * present: `lib/supabase.ts` throws at startup without it, so the app cannot reach a screen
 * with a missing base URL. Absent, this yields null and the YouTube thumbnail or the
 * gradient stands, which is a degradation the design already covers.
 */
export function artworkUrl(path: string): string | null {
  const base = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base.replace(/\/+$/, '')}/storage/v1/object/public/${SERMON_ARTWORK_BUCKET}/${path}`;
}

/**
 * The picture for a message, or null when it has neither of the two it could have.
 *
 * Takes the two columns rather than the whole row, so MY-LIST's embedded read and the
 * rails' full row can both call it.
 */
export function sermonArtworkUrl(sermon: {
  artwork_path: SermonSummary['artwork_path'];
  thumbnail_url: SermonSummary['thumbnail_url'];
}): string | null {
  if (sermon.artwork_path !== null) {
    const ours = artworkUrl(sermon.artwork_path);
    if (ours !== null) return ours;
  }
  // The sync writes '' for a message it has no thumbnail for, and the dashboard's own rows
  // never had one at all: both mean "no picture", and only one of them is falsy by type.
  return sermon.thumbnail_url === '' ? null : sermon.thumbnail_url;
}
