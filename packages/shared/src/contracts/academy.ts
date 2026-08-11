import { z } from 'zod';

// Contract for the Academy edge function (W2.9 slice 2; docs/spec/13, ADR 0017):
// course-handoff, where Register in the app mints the single-use token the website
// resolves. Member-called: the caller's identity comes from their JWT, resolved
// server-side, never from this body.
//
// The email-claim contracts lived here too until 2026-08-11, when the self-service
// claim was cut (ADR 0017 amendment). Its function, RPCs and ledger went with them.

export const COURSE_SLUG_MAX = 64;

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
