import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@agbc/shared/database';

import {
  IMAGE_EXTENSIONS,
  MAX_IMAGE_BYTES,
  imageRefusal,
  loadImageFacts,
  mintImageUpload,
  publicImageUrl,
  retireImage,
  verifyImageObject,
  type ImageExtension,
  type ImageFacts,
  type ImageVerification,
  type MintOutcome,
} from './imageShelf';

/**
 * The sermon-artwork shelf (docs/spec/17 §4, docs/spec/08; the storage contract is
 * `20260815140000_a_message_gets_a_face.sql`).
 *
 * The audio module's sibling, and shaped like it on purpose: the upload goes straight from
 * the browser to storage under the admin's own JWT, and what the browser DID upload is then
 * treated as untrusted, read back by its own first bytes before any row points at it
 * (~/.claude/standards/security.md §File uploads: never trust the client's Content-Type).
 *
 * ONE difference that matters, and it is the bucket's posture. `sermon-artwork` is
 * public-read, so nothing here mints a URL for a member: the app derives it from the path
 * with `getPublicUrl()`, which is string construction with no round trip. Signed URLs
 * appear in exactly one place, for the server's own read-back, and the reason is the
 * opposite of secrecy: the signed route is not the CDN-cached one, so it cannot answer with
 * a stale or negatively-cached copy of an object written a second ago.
 *
 * EVERYTHING BUCKET-SHAPED NOW LIVES IN `imageShelf.ts` (W3.5 slice 4b), because
 * `event-images` is the same shelf again and a second copy of `isImageMagic` would be a
 * second thing to update the day a format is added. What stays here is what touches
 * `sermons`: the column, the row read-back, and the words this feature uses for a refusal.
 */

type Client = SupabaseClient<Database>;

export const SERMON_ARTWORK_BUCKET = 'sermon-artwork';

// The shelf's own vocabulary, kept as this module's names so its callers read in the
// language of the feature rather than of the mechanism.
export const MAX_ARTWORK_BYTES = MAX_IMAGE_BYTES;
export const ARTWORK_EXTENSIONS = IMAGE_EXTENSIONS;
export type ArtworkExtension = ImageExtension;
export type ArtworkFacts = ImageFacts;

export async function loadArtworkFacts(
  supabase: Client,
  path: string,
): Promise<ArtworkFacts> {
  return await loadImageFacts(supabase, SERMON_ARTWORK_BUCKET, path);
}

export function artworkUrl(supabase: Client, path: string): string {
  return publicImageUrl(supabase, SERMON_ARTWORK_BUCKET, path);
}

export type { MintOutcome };

export async function mintArtworkUpload(
  supabase: Client,
  extension: ArtworkExtension,
): Promise<MintOutcome> {
  return await mintImageUpload(supabase, SERMON_ARTWORK_BUCKET, extension);
}

export { isImageMagic } from './imageShelf';

export type ArtworkVerification = ImageVerification;

export async function verifyArtworkObject(
  supabase: Client,
  path: string,
): Promise<ArtworkVerification> {
  return await verifyImageObject(supabase, SERMON_ARTWORK_BUCKET, path);
}

/**
 * Retires the picture a row has just stopped pointing at.
 *
 * Called AFTER the row write, never before: the delete policy refuses to remove a
 * referenced object, so the other order cannot even be written. A failure here leaves an
 * orphaned file, which is storage garbage rather than a member-facing defect, and is
 * reported rather than thrown.
 */
export async function retireArtwork(
  supabase: Client,
  previousPath: string | null,
  currentPath: string | null,
): Promise<boolean> {
  return await retireImage(
    supabase,
    SERMON_ARTWORK_BUCKET,
    previousPath,
    currentPath,
  );
}

/**
 * The one column this module needs, read here rather than through `sermonAudio`'s
 * `loadSermon`: the two modules calling each other would be an import cycle, and this side
 * of it wants one field, not a shelf row. `undefined` means the message is gone.
 */
async function currentArtwork(
  supabase: Client,
  sermonId: string,
): Promise<string | null | undefined> {
  const { data, error } = await supabase
    .from('sermons')
    .select('artwork_path')
    .eq('id', sermonId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data === null ? undefined : data.artwork_path;
}

export type ArtworkOutcome =
  | { ok: true; replaced: boolean; oldFileRemoved?: boolean }
  | {
      ok: false;
      reason:
        'invalid' | 'not_image' | 'missing' | 'gone' | 'refused' | 'failed';
    };

/**
 * Puts a picture on a message that already exists (the manage screen).
 *
 * The same order as the audio path at both ends: the bytes are checked BEFORE the row
 * points at them, and the OLD file goes LAST, only once the row has moved on.
 */
export async function setArtwork(
  supabase: Client,
  sermonId: string,
  path: string,
): Promise<ArtworkOutcome> {
  const verified = await verifyArtworkObject(supabase, path);
  if (verified !== 'image') return { ok: false, reason: refusal(verified) };

  const previousPath = await currentArtwork(supabase, sermonId);
  if (previousPath === undefined) return { ok: false, reason: 'gone' };

  // `.select()` for the same reason attachAudio reads its rows back: RLS turns a refused
  // update into a successful statement that touches nothing, and reporting that as saved
  // would be a lie (the zero-row trap, ADR 0015's plan).
  const { data, error } = await supabase
    .from('sermons')
    .update({ artwork_path: path })
    .eq('id', sermonId)
    .select('id');
  if (error) return { ok: false, reason: 'failed' };
  if (data.length === 0) return { ok: false, reason: 'refused' };

  const oldFileRemoved = await retireArtwork(supabase, previousPath, path);
  return {
    ok: true,
    replaced: previousPath !== null,
    ...(previousPath === null ? {} : { oldFileRemoved }),
  };
}

/**
 * Takes the picture off a message: clear the reference, THEN delete the file.
 *
 * Never refused the way removing AUDIO is on an audio-only message. Removing the audio
 * would leave a message that is nothing at all; removing the picture puts back the branded
 * gradient, which is a designed state the app has rendered since W1.3.
 */
export async function removeArtwork(
  supabase: Client,
  sermonId: string,
): Promise<
  { ok: true; fileRemoved: boolean } | { ok: false; reason: ArtworkProblem }
> {
  const previousPath = await currentArtwork(supabase, sermonId);
  if (previousPath === undefined) return { ok: false, reason: 'gone' };
  if (previousPath === null) return { ok: false, reason: 'no_artwork' };

  const { data, error } = await supabase
    .from('sermons')
    .update({ artwork_path: null })
    .eq('id', sermonId)
    .select('id');
  if (error) return { ok: false, reason: 'failed' };
  if (data.length === 0) return { ok: false, reason: 'refused' };

  return {
    ok: true,
    fileRemoved: await retireArtwork(supabase, previousPath, null),
  };
}

export type ArtworkProblem = 'gone' | 'no_artwork' | 'refused' | 'failed';

const refusal = imageRefusal;
