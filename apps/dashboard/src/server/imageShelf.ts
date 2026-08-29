import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@agbc/shared/database';

/**
 * What every public-read picture bucket in this dashboard does, once (W3.5 slice 4b).
 *
 * `sermon-artwork` (W3.1 slice 5) and `event-images` are the same shelf twice: a public-read
 * bucket, 5 MiB, jpeg/png/webp, a machine-minted `<uuid>.<ext>` name, a signed upload URL,
 * a magic-byte read-back before any row points at the object, and a retire step that runs
 * only after the row has moved on.
 *
 * EXTRACTED RATHER THAN COPIED, which is this repo's own rule and `upload.ts`'s own history:
 * two uploaders sending bytes two slightly different ways is the drift the shared library
 * rule exists to prevent. The thing most worth having in one place is `isImageMagic`: a
 * second copy is a second thing to update the day a format is added, and the copy that gets
 * missed is a hole in an upload path.
 *
 * WHAT IS NOT HERE, deliberately: anything that touches a TABLE. Reading the current path,
 * writing the new one and reading the row back are per-feature, because the column, the
 * authorize() action and the refusal vocabulary differ, and a generic "update this column on
 * that table" would trade a type-checked write for a stringly-typed one to save six lines.
 */

type Client = SupabaseClient<Database>;

/** Mirrors both bucket rows' file_size_limit, for the client-side early refusal. */
export const MAX_IMAGE_BYTES = 5242880;

export const IMAGE_EXTENSIONS = ['jpg', 'png', 'webp'] as const;
export type ImageExtension = (typeof IMAGE_EXTENSIONS)[number];

/**
 * Mirrors the storage INSERT policies' name rule: machine-minted `<uuid>.<ext>`, one
 * spelling per format. Validated here as well as in the database so a forged form field is
 * refused before any storage round trip.
 */
export const MINTED_OBJECT_NAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;

/** What a manage screen states about a picture, read from the object itself. */
export interface ImageFacts {
  sizeBytes: number | null;
  hungAt: string | null;
}

export async function loadImageFacts(
  supabase: Client,
  bucket: string,
  path: string,
): Promise<ImageFacts> {
  const { data, error } = await supabase.storage
    .from(bucket)
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
export function publicImageUrl(
  supabase: Client,
  bucket: string,
  path: string,
): string {
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

export type MintOutcome =
  | { ok: true; path: string; token: string; signedUrl: string }
  | { ok: false; reason: 'refused' | 'failed' };

/**
 * A one-shot door for one upload: a machine-minted name and a signed upload URL token.
 *
 * Minted server-side, after authorize(), so the name rule is never in the browser's hands.
 * These URLs are public and permanent, so a human-written filename would be a permanent
 * public string somebody chose, and on an event picture that is where a member's name would
 * end up.
 */
export async function mintImageUpload(
  supabase: Client,
  bucket: string,
  extension: ImageExtension,
): Promise<MintOutcome> {
  const path = `${crypto.randomUUID()}.${extension}`;
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUploadUrl(path);
  if (error) return { ok: false, reason: 'failed' };
  return { ok: true, path, token: data.token, signedUrl: data.signedUrl };
}

/**
 * Are these first bytes actually an image we can serve?
 *
 * The three shapes both buckets admit, all decidable inside twelve bytes: JPEG's
 * `FF D8 FF`, PNG's eight-byte signature, and WebP's `RIFF` at 0 with `WEBP` at 8. Exported
 * so the refusal is unit-testable byte by byte without a storage round trip.
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

export type ImageVerification = 'image' | 'missing' | 'not_image' | 'invalid';

/**
 * Reads the object's own first bytes and discards it if they are not an image.
 *
 * A Range request, so the check costs 12 bytes, and a timeout, because every outbound call
 * gets one (~/.claude/standards/backend.md). Through a SIGNED url rather than the public one
 * even though these buckets are public: the public route is CDN-cached, and a read-back of
 * something written moments ago is exactly the case where a cache can answer for an object
 * it has not seen.
 *
 * The discard lives here rather than at each caller, so a file that failed the check cannot
 * survive as an attachable object because somebody forgot the cleanup.
 */
export async function verifyImageObject(
  supabase: Client,
  bucket: string,
  path: string,
): Promise<ImageVerification> {
  if (!MINTED_OBJECT_NAME.test(path)) return 'invalid';

  const { data, error } = await supabase.storage
    .from(bucket)
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
  await supabase.storage.from(bucket).remove([path]);
  return 'not_image';
}

/**
 * Retires the picture a row has just stopped pointing at.
 *
 * Called AFTER the row write, never before: the delete policy refuses to remove a referenced
 * object, so the other order cannot even be written. A failure here leaves an orphaned file,
 * which is storage garbage rather than a member-facing defect, and is reported rather than
 * thrown.
 */
export async function retireImage(
  supabase: Client,
  bucket: string,
  previousPath: string | null,
  currentPath: string | null,
): Promise<boolean> {
  if (!previousPath || previousPath === currentPath) return false;
  const removed = await supabase.storage.from(bucket).remove([previousPath]);
  return !removed.error && removed.data.length > 0;
}

export function imageRefusal(
  verified: Exclude<ImageVerification, 'image'>,
): 'invalid' | 'not_image' | 'missing' {
  if (verified === 'invalid') return 'invalid';
  if (verified === 'not_image') return 'not_image';
  return 'missing';
}
