import { z } from 'zod';

// Contracts for the Academy edge functions (W2.9 slice 2; docs/spec/13, ADR 0017):
// email-claim (a member proves a second address and their website registrations link)
// and course-handoff (Register in the app mints the single-use token the website
// resolves). Both are member-called: the caller's identity comes from their JWT,
// resolved server-side, never from these bodies.

export const CLAIM_EMAIL_MAX = 254;
export const CLAIM_CODE_LENGTH = 6;
export const COURSE_SLUG_MAX = 64;

/** The languages the claim email can be written in (docs/spec/16 Localization). */
export const claimLanguageSchema = z.enum(['en', 'de', 'nl', 'fr']);
export type ClaimLanguage = z.infer<typeof claimLanguageSchema>;

const claimEmailSchema = z
  .string()
  .trim()
  .pipe(z.email())
  .pipe(z.string().max(CLAIM_EMAIL_MAX));

/**
 * Request: send a code to the address the member wants to prove. The response is
 * deliberately uniform (ADR 0017): nothing before verification reveals whether an
 * address has registrations, so `ok: true` says only "if this address can be claimed,
 * a code is on its way".
 */
export const emailClaimRequestSchema = z.strictObject({
  action: z.literal('request'),
  email: claimEmailSchema,
  language: claimLanguageSchema.optional(),
});

/** Verify: enter the code; on success the proven address is stored and rows link. */
export const emailClaimVerifySchema = z.strictObject({
  action: z.literal('verify'),
  email: claimEmailSchema,
  code: z
    .string()
    .trim()
    .length(CLAIM_CODE_LENGTH)
    .regex(/^\d+$/, 'codes are numeric'),
});

export const emailClaimRequestBodySchema = z.discriminatedUnion('action', [
  emailClaimRequestSchema,
  emailClaimVerifySchema,
]);
export type EmailClaimRequestBody = z.infer<typeof emailClaimRequestBodySchema>;

export const emailClaimErrorSchema = z.enum([
  /** Malformed request, unauthenticated, or a refusal with nothing to elaborate. */
  'invalid',
  /**
   * The address is another account's: its sign-in address or another member's proven
   * one. The app's copy: "sign in with that address instead" (ADR 0017).
   */
  'address_in_use',
  /** Wrong code. The claim survives until its attempt cap. */
  'invalid_code',
  /** The code expired; request a fresh one. */
  'expired',
  /** Five wrong entries killed this code; request a fresh one. */
  'too_many_attempts',
  'rate_limited',
  'not_configured',
  'send_failed',
]);
export type EmailClaimError = z.infer<typeof emailClaimErrorSchema>;

export const emailClaimResponseSchema = z.object({
  ok: z.boolean(),
  /**
   * request: true when the address was already the caller's (no code needed);
   * verify: always true on success.
   */
  verified: z.boolean().optional(),
  /** verify only: how many website registrations the proven address just linked. */
  linked: z.number().int().nonnegative().optional(),
  error: emailClaimErrorSchema.optional(),
});
export type EmailClaimResponse = z.infer<typeof emailClaimResponseSchema>;

/** Mint the handoff token for one course (ADR 0017 decision 7). */
export const courseHandoffRequestSchema = z.strictObject({
  courseSlug: z
    .string()
    .trim()
    .min(1)
    .max(COURSE_SLUG_MAX)
    .regex(/^[a-z0-9-]+$/, 'slugs are lowercase kebab'),
});
export type CourseHandoffRequest = z.infer<typeof courseHandoffRequestSchema>;

export const courseHandoffErrorSchema = z.enum([
  'invalid',
  /** The member already holds a live registration: show the registered state instead. */
  'already_registered',
  /** The course is not open (upcoming): the app should be offering Notify me. */
  'not_open',
  'rate_limited',
  'failed',
]);
export type CourseHandoffError = z.infer<typeof courseHandoffErrorSchema>;

export const courseHandoffResponseSchema = z.object({
  ok: z.boolean(),
  /** The opaque single-use token; goes into the website URL and nowhere else. */
  token: z.string().optional(),
  /** ISO timestamp; the app can silently re-mint after this. */
  expiresAt: z.string().optional(),
  error: courseHandoffErrorSchema.optional(),
});
export type CourseHandoffResponse = z.infer<typeof courseHandoffResponseSchema>;
