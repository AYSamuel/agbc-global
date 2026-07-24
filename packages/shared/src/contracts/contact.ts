import { z } from 'zod';

// Contract for the contact-form edge function (docs/spec/04 CONTACT, W1.7).
// Client-called with the anon key: guests can write to the church without an
// account. The form goes to the church inbox; per-branch contact is direct
// email links in the app, so there is no branch selector here.

export const CONTACT_NAME_MAX = 120;
export const CONTACT_EMAIL_MAX = 254;
export const CONTACT_MESSAGE_MAX = 4000;

export const contactRequestSchema = z.strictObject({
  name: z.string().trim().min(1).max(CONTACT_NAME_MAX),
  /** Reply-to address: the team answers by replying to the notification. */
  email: z
    .string()
    .trim()
    .pipe(z.email())
    .pipe(z.string().max(CONTACT_EMAIL_MAX)),
  message: z.string().trim().min(1).max(CONTACT_MESSAGE_MAX),
  /**
   * Honeypot: never rendered to humans (docs/spec/04 has no such field); a
   * non-empty value marks the sender as a bot and the function feigns success.
   */
  company: z.string().max(200).optional(),
});
export type ContactRequest = z.infer<typeof contactRequestSchema>;

export const contactResponseSchema = z.object({
  ok: z.boolean(),
  /** Present only when ok is false; an i18n-agnostic machine hint, never shown raw. */
  error: z
    .enum(['invalid', 'rate_limited', 'not_configured', 'send_failed'])
    .optional(),
});
export type ContactResponse = z.infer<typeof contactResponseSchema>;
