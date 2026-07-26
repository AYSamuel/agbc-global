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
 * The configured fixed code must be at least this long or the function refuses
 * to operate (fail closed): a short code would turn the bypass into a
 * brute-forceable back door.
 */
export const REVIEW_CODE_MIN = 20;

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
