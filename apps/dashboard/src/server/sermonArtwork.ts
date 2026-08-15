import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@agbc/shared/database';

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
 * appear in exactly one place below, for the server's own read-back, and the reason is the
 * opposite of secrecy: the signed route is not the CDN-cached one, so it cannot answer with
 * a stale or negatively-cached copy of an object written a second ago.
 */

type Client = SupabaseClient<Database>;

export const SERMON_ARTWORK_BUCKET = 'sermon-artwork';

/** Mirrors the bucket row's file_size_limit (5 MiB), for the client-side early refusal. */
export const MAX_ARTWORK_BYTES = 5242880;

/**
 * Mirrors the storage INSERT policy's name rule: machine-minted `<uuid>.<ext>`, one
 * spelling per format. Validated here as well so a forged form field is refused before any
 * storage round trip.
 */
const OBJECT_NAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;

export const ARTWORK_EXTENSIONS = ['jpg', 'png', 'webp'] as const;
export type ArtworkExtension = (typeof ARTWORK_EXTENSIONS)[number];

/** What the manage screen states about the picture, read from the object itself. */
export interface ArtworkFacts {
  sizeBytes: number | null;
  hungAt: string | null;
}

export async function loadArtworkFacts(
  supabase: Client,
  path: string,
): Promise<ArtworkFacts> {
  const { data, error } = await supabase.storage
    .from(SERMON_ARTWORK_BUCKET)
    .list('', { search: path, limit: 1 });
  const object = error ? null : data.find((entry) => entry.name === path);
  return {
    sizeBytes: readSize(object?.metadata),
    hungAt: object?.created_at ?? null,
  };
}

function readSize(metadata: unknown): number | null {
  if (metadata && typeof metadata === 'object' && 'size' in metadata) {
    const size = metadata.size;
    return typeof size === 'number' ? size : null;
  }
  return null;
}

/**
 * Where the picture actually lives for anyone looking at it.
 *
 * No round trip and no credential: on a public bucket this is `${url}/storage/v1/object/
 * public/${bucket}/${path}`, assembled locally. The app builds the same URL the same way,
 * which is the whole point of the public posture: one stable URL per picture, cacheable by
 * the CDN and by every device's image cache, for as long as that object exists.
 */
export function artworkUrl(supabase: Client, path: string): string {
  return supabase.storage.from(SERMON_ARTWORK_BUCKET).getPublicUrl(path).data
    .publicUrl;
}

export type MintOutcome =
  | { ok: true; path: string; token: string; signedUrl: string }
  | { ok: false; reason: 'refused' | 'failed' };

/**
 * A one-shot door for one upload: a machine-minted name and a signed upload URL token.
 *
 * Minted server-side, after authorize(), so the name rule is never in the browser's hands.
 * That matters more here than for audio: these URLs are public and permanent, so a
 * human-written filename would be a permanent public string somebody chose.
 */
export async function mintArtworkUpload(
  supabase: Client,
  extension: ArtworkExtension,
): Promise<MintOutcome> {
  const path = `${crypto.randomUUID()}.${extension}`;
  const { data, error } = await supabase.storage
    .from(SERMON_ARTWORK_BUCKET)
    .createSignedUploadUrl(path);
  if (error) return { ok: false, reason: 'failed' };
  return { ok: true, path, token: data.token, signedUrl: data.signedUrl };
}

/**
 * Are these first bytes actually an image we can serve?
 *
 * The three shapes the bucket admits, all decidable inside the same twelve bytes the audio
 * check already reads: JPEG's `FF D8 FF`, PNG's eight-byte signature, and WebP's `RIFF`
 * at 0 with `WEBP` at 8. Exported so the refusal is unit-testable byte by byte without a
 * storage round trip.
 */
export function isImageMagic(bytes: Uint8Array): boolean {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return true;
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return true;
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return true;
  }
  return false;
}

export type ArtworkVerification = 'image' | 'missing' | 'not_image' | 'invalid';

/**
 * Reads the object's own first bytes and discards it if they are not an image.
 *
 * A Range request, so the check costs 12 bytes, and a timeout, because every outbound call
 * gets one (~/.claude/standards/backend.md). Through a SIGNED url rather than the public
 * one even though this bucket is public: the public route is CDN-cached, and a read-back of
 * something written moments ago is exactly the case where a cache can answer for an object
 * it has not seen.
 *
 * The discard lives here rather than at each caller, so a file that failed the check cannot
 * survive as a shelvable object because somebody forgot the cleanup.
 */
export async function verifyArtworkObject(
  supabase: Client,
  path: string,
): Promise<ArtworkVerification> {
  if (!OBJECT_NAME.test(path)) return 'invalid';

  const { data, error } = await supabase.storage
    .from(SERMON_ARTWORK_BUCKET)
    .createSignedUrl(path, 60);
  if (error) return 'missing';

  const response = await fetch(data.signedUrl, {
    headers: { Range: 'bytes=0-11' },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) return 'missing';

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (isImageMagic(bytes)) return 'image';

  // Unreferenced (no row write has happened), so the delete policy allows this.
  await supabase.storage.from(SERMON_ARTWORK_BUCKET).remove([path]);
  return 'not_image';
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
  if (!previousPath || previousPath === currentPath) return false;
  const removed = await supabase.storage
    .from(SERMON_ARTWORK_BUCKET)
    .remove([previousPath]);
  return !removed.error && removed.data.length > 0;
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

function refusal(
  verified: Exclude<ArtworkVerification, 'image'>,
): 'invalid' | 'not_image' | 'missing' {
  if (verified === 'invalid') return 'invalid';
  if (verified === 'not_image') return 'not_image';
  return 'missing';
}
