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
    isAnonymous: z.boolean(),
    consentAgreed: z.boolean().refine((agreed) => agreed),
  });
}

export type ComposeFormShape = z.infer<ReturnType<typeof composeSchema>>;
