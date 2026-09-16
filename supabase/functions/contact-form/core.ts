// Pure decisions for the contact form (docs/spec/04 CONTACT): validation via
// the shared contract, the bot honeypot, the outgoing email payload, and a
// small in-memory rate limiter. No I/O here; index.ts owns the wire.

import {
  type ContactRequest,
  contactRequestSchema,
} from '../../../packages/shared/src/contracts/contact.ts';

export function parseContact(raw: unknown): ContactRequest | null {
  const parsed = contactRequestSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** A filled honeypot marks a bot; the caller feigns success and sends nothing. */
export function isBot(request: ContactRequest): boolean {
  return typeof request.company === 'string' && request.company.trim() !== '';
}

export interface OutgoingEmail {
  from: string;
  to: string;
  reply_to: string;
  subject: string;
  text: string;
}

/**
 * The notification the church inbox receives. The member's address rides in
 * reply_to so the team answers by replying. Header injection is closed by
 * flattening newlines out of the one user value that reaches a header.
 */
export function buildEmail(
  request: ContactRequest,
  from: string,
  to: string,
): OutgoingEmail {
  const safeName = request.name.replace(/[\r\n]+/g, ' ');
  return {
    from,
    to,
    reply_to: request.email,
    subject: `New app message from ${safeName}`,
    text: `From: ${request.name} <${request.email}>\n\n${request.message}`,
  };
}

// The limiter grew a second consumer in W2.1 (review-signin) and moved to
// _shared; re-exported so this module keeps its public surface and tests.
export {
  clientKey,
  createRateLimiter,
  type RateLimiterOptions,
} from '../_shared/rateLimit.ts';

/**
 * The idempotency key a send carries (W4.18 slice 3), forwarded to Resend
 * under the same header name, which keeps it for 24 hours and refuses a second
 * email under it. Resend's limit is 256 characters; the shape accepted here is
 * narrower than that on purpose (a uuid-like token, never free text), because
 * the header is forwarded verbatim to a third party. Absent or malformed reads
 * as "no key": builds 22 and 23 send none and must keep working, and a garbled
 * one is a bug to fix rather than a reason to refuse the member's message.
 */
export const IDEMPOTENCY_KEY_MAX = 128;

export function idempotencyKeyOf(header: string | null): string | null {
  if (header === null) return null;
  const key = header.trim();
  if (key.length === 0 || key.length > IDEMPOTENCY_KEY_MAX) return null;
  return /^[A-Za-z0-9._-]+$/.test(key) ? key : null;
}
