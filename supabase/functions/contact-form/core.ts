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

export interface RateLimiterOptions {
  limit: number;
  windowMs: number;
  /** Injectable clock so tests never sleep (qa standard). */
  now?: () => number;
}

/**
 * Per-key sliding window. In-memory, so it bounds a single warm instance and
 * resets on cold start: a speed bump against casual flooding, not a quota
 * system. Real abuse pressure is also capped by Resend's own send limits.
 */
export function createRateLimiter({
  limit,
  windowMs,
  now = Date.now,
}: RateLimiterOptions): (key: string) => boolean {
  const hits = new Map<string, number[]>();
  return (key: string): boolean => {
    const cutoff = now() - windowMs;
    const recent = (hits.get(key) ?? []).filter((at) => at > cutoff);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now());
    hits.set(key, recent);
    return true;
  };
}

/** First address in x-forwarded-for, or a shared bucket when absent. */
export function clientKey(forwardedFor: string | null): string {
  const first = forwardedFor?.split(',')[0]?.trim();
  return first && first !== '' ? first : 'unknown';
}
