// Pure decisions for the store-review bypass (docs/spec/03 §Security):
// validation via the shared contract and the allow/deny decision. No I/O here;
// index.ts owns the admin API and the wire.

import {
  REVIEW_CODE_MIN,
  reviewSigninRequestSchema,
  type ReviewSigninRequest,
} from '../../../packages/shared/src/contracts/auth.ts';
import { timingSafeEqual } from '../_shared/auth.ts';

export function parseReviewSignin(raw: unknown): ReviewSigninRequest | null {
  const parsed = reviewSigninRequestSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** The function's environment, resolved by index.ts before any decision. */
export interface ReviewConfig {
  /** REVIEW_BYPASS_ENABLED === 'true'; absent or anything else means off. */
  enabled: boolean;
  reviewEmail: string | null;
  reviewCode: string | null;
}

/**
 * The single allow/deny decision. Every deny reason (flag off, misconfigured
 * or too-short code, email mismatch, wrong code) is collapsed to `false`; the
 * wire response is identical for all of them (docs/spec/03: no enumeration).
 * The code comparison is constant-time; the email comparison happens first and
 * is not (the review address ships in the store review notes, it is not the
 * secret).
 */
export async function isAllowedAttempt(
  config: ReviewConfig,
  request: ReviewSigninRequest,
): Promise<boolean> {
  if (!config.enabled) return false;
  if (!config.reviewEmail || !config.reviewCode) return false;
  // Fail closed on weak configuration. The code is 6 digits by design
  // (docs/spec/03, decided 2026-07-26: it must fit AUTH-2's normal input);
  // the compensating controls live in index.ts and the config flags.
  if (config.reviewCode.length < REVIEW_CODE_MIN) return false;
  if (request.email.toLowerCase() !== config.reviewEmail.trim().toLowerCase()) {
    return false;
  }
  return timingSafeEqual(request.code, config.reviewCode);
}

/**
 * The alert raised when the bypass actually MINTS A SESSION (index.ts).
 *
 * A constant rather than an inline string so its one hard requirement is testable: it names
 * the event and nothing else. `03` asks for every use to be logged and `20` forbids
 * addresses and codes in logs, and this is the exact call site where including the address
 * would feel helpful. It is not: the address is allowlisted, so it tells a reader nothing
 * they cannot get from the secrets, while putting a real person's email into an error
 * tracker.
 *
 * Failures were already captured; successes were not, which was the wrong way round. A
 * refused attempt is the control working. A successful one is somebody holding valid
 * production credentials that no mailbox gated.
 */
export const REVIEW_BYPASS_ALERT =
  'review-signin: store-review bypass minted a session';
