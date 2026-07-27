// Pure decisions for photo-guard (docs/spec/02 §Storage, ~/.claude/standards
// /security.md §File uploads): what the bytes actually are, whether the caller
// owns the path, and how big is too big. No I/O here; index.ts owns storage,
// the database and the wire.

import {
  photoGuardRequestSchema,
  TESTIMONY_PHOTO_MAX_BYTES,
  type PhotoGuardRequest,
} from '../../../packages/shared/src/contracts/family.ts';

export function parsePhotoGuard(raw: unknown): PhotoGuardRequest | null {
  const parsed = photoGuardRequestSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * The only two image types the bucket accepts (docs/spec/02). Signatures are
 * compared against the file's leading bytes, never against the Content-Type the
 * upload declared: that header is client input like any other.
 */
const SIGNATURES: { type: string; bytes: number[] }[] = [
  // JPEG: SOI marker then the start of the first segment. Covers JFIF, Exif and
  // raw JPEG alike, which is the point: the container, not the flavour.
  { type: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  // PNG: the 8-byte signature, including the CRLF/EOF bytes that catch a file
  // mangled by a text-mode transfer.
  {
    type: 'image/png',
    bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  },
];

/** Longest signature above: how many bytes index.ts needs to fetch. */
export const SNIFF_BYTES = 8;

/**
 * The image type the BYTES are, or null if they are not an image this bucket
 * accepts. A magic-byte check proves the container, not that the whole file is
 * benign: a polyglot with a valid JPEG header still passes here. It is one layer
 * of several (private bucket, mime allowlist, size cap, the client re-encode
 * that destroys embedded payloads, and a human review before anything is
 * public), which is exactly how the standard asks uploads to be handled.
 */
export function sniffImageType(head: Uint8Array): string | null {
  for (const signature of SIGNATURES) {
    if (head.length < signature.bytes.length) continue;
    if (signature.bytes.every((byte, index) => head[index] === byte)) {
      return signature.type;
    }
  }
  return null;
}

/** The path's first segment is the owning member's id (storage policies and
 * `assert_photo_path_owned` both hang on that). The caller must be that member:
 * validating someone else's object is not a thing anyone needs to do. */
export function ownsPath(path: string, callerId: string): boolean {
  return path.split('/')[0] === callerId;
}

export interface ObjectFacts {
  sizeBytes: number;
  /** What the upload DECLARED. Compared against the sniffed type, never trusted. */
  declaredType: string | null;
}

export type Verdict =
  | { ok: true; contentType: string }
  | { ok: false; reason: 'too_large' | 'not_an_image' };

/**
 * The whole decision, given the facts index.ts gathered. A `not_an_image`
 * verdict includes the case where the bytes ARE an image but not the one the
 * upload claimed: an object that misdescribes itself is served to browsers under
 * the wrong type, so it is refused rather than silently corrected.
 */
export function judge(facts: ObjectFacts, head: Uint8Array): Verdict {
  if (facts.sizeBytes > TESTIMONY_PHOTO_MAX_BYTES) {
    return { ok: false, reason: 'too_large' };
  }
  const sniffed = sniffImageType(head);
  if (sniffed === null) return { ok: false, reason: 'not_an_image' };
  if (facts.declaredType !== null && facts.declaredType !== sniffed) {
    return { ok: false, reason: 'not_an_image' };
  }
  return { ok: true, contentType: sniffed };
}
