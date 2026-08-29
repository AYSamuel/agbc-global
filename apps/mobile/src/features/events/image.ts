export const EVENT_IMAGES_BUCKET = 'event-images';

/**
 * The picture an event shows, built rather than asked for (W3.5 slice 4b, docs/spec/11).
 *
 * The same construction as `features/watch/artwork.ts`, and deliberately a second small
 * module rather than a shared one: what they share is three lines of string assembly, and
 * what they do not share is the question. A message picks BETWEEN two sources (its own
 * artwork and YouTube's thumbnail) and that precedence is the artwork module's whole
 * reason to exist; an event has one source or none.
 *
 * Also: this module deliberately does NOT import `@/lib/supabase`. Reaching the client's
 * `getPublicUrl()` would drag the network singleton into a screen that needs a string, and
 * the jest suite finds it immediately.
 *
 * Two things make building it safe rather than clever. The route is the documented public
 * one for a public bucket, which is what `getPublicUrl` itself assembles; and the path needs
 * no escaping BY CONSTRUCTION, because both the storage INSERT policy and the server-side
 * mint force `<uuid>.<ext>` (`20260822120000`), so there is never a character in it a URL
 * would have to encode.
 *
 * Read at call time, not module scope, so a test can set it. In the app it is always
 * present: `lib/supabase.ts` throws at startup without it. Absent, this yields null and the
 * branded cover stands, which `11` names as its own state rather than a gap.
 */
export function eventImageUrl(path: string | null): string | null {
  if (path === null) return null;
  const base = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base.replace(/\/+$/, '')}/storage/v1/object/public/${EVENT_IMAGES_BUCKET}/${path}`;
}
