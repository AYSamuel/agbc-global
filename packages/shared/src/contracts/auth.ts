import { z } from 'zod';

// Contract for the review-signin edge function (docs/spec/03 §Security, W2.1).
// Store-review bypass: exactly one allowlisted review email address plus a
// long fixed code, both checked server-side inside the function (never in the
// client), mint a real session via the auth admin API. Supabase has no email
// test-OTP mechanism (verified against live docs 2026-07-26), so this function
// IS the bypass. The response is uniform for every denial reason: flag off,
// unknown email, and wrong code are indistinguishable (no enumeration).

export const REVIEW_EMAIL_MAX = 254;
export const REVIEW_CODE_MAX = 128;
/**
 * The configured fixed code is a 6-digit numeric code so the reviewer types
 * it into AUTH-2's normal input (decided 2026-07-26, docs/spec/03). The small
 * keyspace is compensated server-side: per-environment flag (off in prod
 * outside submission windows), per-IP rate limiting, uniform denials, logging
 * with alerts, and per-window rotation. The function refuses anything shorter
 * than this floor (fail closed).
 */
export const REVIEW_CODE_MIN = 6;

export const reviewSigninRequestSchema = z.strictObject({
  email: z
    .string()
    .trim()
    .pipe(z.email())
    .pipe(z.string().max(REVIEW_EMAIL_MAX)),
  code: z.string().trim().min(1).max(REVIEW_CODE_MAX),
});
export type ReviewSigninRequest = z.infer<typeof reviewSigninRequestSchema>;

export const reviewSigninResponseSchema = z.object({
  ok: z.boolean(),
  /**
   * Present only when ok is true; the app exchanges it for a session via
   * verifyOtp({ token_hash, type: 'email' }).
   */
  token_hash: z.string().optional(),
  /** Present only when ok is false; an i18n-agnostic machine hint. */
  error: z.enum(['invalid', 'rate_limited', 'unavailable']).optional(),
});
export type ReviewSigninResponse = z.infer<typeof reviewSigninResponseSchema>;

// AUTH-1 / AUTH-3 form schemas (docs/spec/03, W2.1 screens). Client validation
// is UX; the server truth stays RLS + the profiles triggers (docs/spec/02).

export const AUTH_NAME_MAX = 80;
/** Mirrors the profiles.language CHECK constraint. */
export const AUTH_LANGUAGES = ['en', 'de', 'nl', 'fr'] as const;

export const authEmailSchema = z.strictObject({
  email: z
    .string()
    .trim()
    .pipe(z.email())
    .pipe(z.string().max(REVIEW_EMAIL_MAX)),
});
export type AuthEmailForm = z.infer<typeof authEmailSchema>;

export const authProfileSchema = z.strictObject({
  displayName: z.string().trim().min(1).max(AUTH_NAME_MAX),
  branchId: z.uuid(),
  language: z.enum(AUTH_LANGUAGES),
  /** The 16+ declaration (docs/spec/20): submit is impossible without it.
   * boolean + refine (not z.literal(true)) so the unchecked form state is
   * representable and the failure lands as a field error, not a type error. */
  ageConfirmed: z.boolean().refine((confirmed) => confirmed),
});
export type AuthProfileForm = z.infer<typeof authProfileSchema>;
