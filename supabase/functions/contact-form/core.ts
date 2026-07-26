// Pure decisions for the contact form (docs/spec/04 CONTACT): validation via
// the shared contract, the bot honeypot, the outgoing email payload, and a
// small in-memory rate limiter. No I/O here; index.ts owns the wire.

import {
  contactRequestSchema,
  type ContactRequest,
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
