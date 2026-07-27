import { z } from 'zod';

// Compose contracts for testimonies and prayer requests (docs/spec/09, W2.3).
// Client validation here is UX only; the server truth is the RLS INSERT policies
// plus the guard triggers in the Family migration, which force authorship, branch,
// pending status and zeroed counters whatever the client sends (docs/spec/02).

export type ComposeTarget = 'testimony' | 'prayer';

/**
 * The consent wording a member agrees to before sharing. This is Art. 9(2)(a)
 * evidence (docs/spec/20 §Consent mechanics), so it is a real value the database
 * validates: `public.consent_versions` holds the versions, an FK ties every post
 * to one, and the insert guards refuse a version that is no longer active.
 *
 * Bumping this means minting a NEW row in `consent_versions` via a migration,
 * never editing an existing one: rows already recorded against the old key are
 * the retained evidence of what those authors actually agreed to.
 *
 * The wording itself lives in the mobile i18n bundle (`family.consent*` keys, four
 * languages) and is pinned to this key by a hash test in apps/mobile, so consent
 * copy cannot drift without a version bump.
 */
export const CONSENT_VERSION = 'content-share-v1';

/**
 * The wording for a post that carries a photo: the `CONSENT_VERSION` points plus
 * the photo-permission clause docs/spec/20 §Photos requires (ask anyone who can
 * be recognised; never a child without a parent's consent).
 *
 * It is a SECOND active version rather than a replacement (decided with Ayo,
 * 2026-07-27). `CONSENT_VERSION` remains the exact and complete description of
 * sharing words only, which is every prayer request and most testimonies, and a
 * prayer author never reads a photo clause on a screen that has no photo. The
 * database keeps the pairing honest: `consent_versions.covers_photos` is checked
 * by the testimony guards whenever a row carries an `image_path`.
 */
export const CONSENT_VERSION_PHOTO = 'content-share-photo-v1';

/** The wording that describes what this particular submission is doing. */
export function consentVersionFor(hasPhoto: boolean): string {
  return hasPhoto ? CONSENT_VERSION_PHOTO : CONSENT_VERSION;
}

/** The private bucket testimony photos live in (docs/spec/02 §Storage). */
export const TESTIMONY_PHOTO_BUCKET = 'testimony-photos';

/** Mirrors the bucket's `file_size_limit`. The client checks it after re-encoding
 * so an oversized pick fails with grace-framed copy instead of a storage error. */
export const TESTIMONY_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

/** Longest edge, in pixels, the app re-encodes a picked photo down to. The
 * re-encode is also what strips EXIF/GPS (a testimony photo can carry a member's
 * home coordinates, docs/spec/02 §Storage). */
export const TESTIMONY_PHOTO_MAX_EDGE = 1600;

/** JPEG quality for that re-encode: visually clean at feed and detail sizes,
 * roughly a tenth of the ceiling in bytes. */
export const TESTIMONY_PHOTO_QUALITY = 0.8;

/**
 * `<author_id>/<random>.jpg`. Both segments are uuids: the folder is the author's
 * id (the storage policies and `assert_photo_path_owned` both hang on that), and
 * the object name is random rather than the member's filename, which would leak
 * whatever their camera roll called it.
 */
export const TESTIMONY_PHOTO_PATH_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png)$/;

/** Body of a `photo-guard` call: the object the member has just uploaded. */
export const photoGuardRequestSchema = z.strictObject({
  path: z.string().regex(TESTIMONY_PHOTO_PATH_PATTERN),
});

export type PhotoGuardRequest = z.infer<typeof photoGuardRequestSchema>;

/**
 * Why a photo was refused, as the wire sees it. The app maps each to its own
 * grace-framed line; `not_an_image` is the one that means the bytes were not
 * what the upload claimed, and the object has already been deleted server-side.
 */
export type PhotoGuardError =
  'invalid' | 'not_an_image' | 'too_large' | 'rate_limited' | 'failed';

/** Mirrors the testimonies_body_length CHECK constraint. */
export const TESTIMONY_BODY_MAX = 2000;
/** Mirrors the prayers_body_length CHECK constraint. */
export const PRAYER_BODY_MAX = 1000;

export function composeBodyMax(target: ComposeTarget): number {
  return target === 'testimony' ? TESTIMONY_BODY_MAX : PRAYER_BODY_MAX;
}

/**
 * Mirrors the language CHECK on both content tables. Deliberately wider than the
 * four UI locales: members post in Yoruba too (docs/spec/02).
 */
export const CONTENT_LANGUAGE_PATTERN = /^[a-z]{2}(-[A-Z]{2})?$/;

/**
 * One form shape for both composers. The target decides which controls render
 * and how long a body may be; it does not need a second schema, and a single
 * shape keeps the two-step flow (compose then consent) on one react-hook-form
 * instance so a draft restore and a validation error cannot disagree.
 */
export interface ComposeForm {
  body: string;
  /** Testimony only; null is a perfectly good uncategorised testimony. */
  categoryId: string | null;
  /**
   * Testimony only, and a PATH in the private bucket rather than a URL: the
   * object is already uploaded and server-validated by the time it lands here
   * (docs/spec/02 §Storage). Always null for a prayer request, which has no
   * photo affordance at all.
   */
  imagePath: string | null;
  /** Prayer only; server-enforced, the UI hiding a name is not the mechanism. */
  isAnonymous: boolean;
  /**
   * Consent is per-submission and never persisted with a draft: a restored draft
   * re-runs the consent step (docs/spec/09 §3), so this starts false every time.
   * boolean + refine rather than z.literal(true) keeps the unchecked state
   * representable and lands the failure as a field error (same reasoning as the
   * 16+ declaration in contracts/auth.ts).
   */
  consentAgreed: boolean;
}

export function composeSchema(target: ComposeTarget) {
  return z.strictObject({
    body: z.string().trim().min(1).max(composeBodyMax(target)),
    categoryId: z.uuid().nullable(),
    // A prayer request carries no photo. Typing it as "always null" rather than
    // ignoring the field means a bug that smuggles one in fails validation here
    // instead of reaching a testimony-only column.
    imagePath:
      target === 'testimony'
        ? z.string().regex(TESTIMONY_PHOTO_PATH_PATTERN).nullable()
        : z.null(),
    isAnonymous: z.boolean(),
    consentAgreed: z.boolean().refine((agreed) => agreed),
  });
}

export type ComposeFormShape = z.infer<ReturnType<typeof composeSchema>>;
