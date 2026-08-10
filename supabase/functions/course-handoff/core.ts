// Pure decisions for the handoff mint (ADR 0017 decision 7): validation via the shared
// contract and RPC-outcome-to-response mapping. No I/O here; index.ts owns the wire,
// and the token itself is minted inside mint_course_handoff so pgTAP can walk the whole
// mint-and-redeem path without a network.

import {
  type CourseHandoffRequest,
  type CourseHandoffResponse,
  courseHandoffRequestSchema,
} from '../../../packages/shared/src/contracts/academy.ts';

export function parseCourseHandoff(raw: unknown): CourseHandoffRequest | null {
  const parsed = courseHandoffRequestSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** What mint_course_handoff can say. */
export type MintOutcome =
  | 'minted'
  | 'unknown_course'
  | 'not_open'
  | 'already_registered'
  | 'refused';

export function mintResponse(
  outcome: MintOutcome,
  token: string | null,
  expiresAt: string | null,
): { response: CourseHandoffResponse; status: number } {
  switch (outcome) {
    case 'minted':
      return {
        response: {
          ok: true,
          token: token ?? undefined,
          expiresAt: expiresAt ?? undefined,
        },
        status: 200,
      };
    // The app should already be showing the registered state; answering it precisely
    // lets a stale screen reconcile instead of walking a member into paying twice.
    case 'already_registered':
      return { response: { ok: false, error: 'already_registered' }, status: 409 };
    case 'not_open':
      return { response: { ok: false, error: 'not_open' }, status: 409 };
    // An unknown slug and a refused caller read the same: nothing to elaborate.
    case 'unknown_course':
    case 'refused':
      return { response: { ok: false, error: 'invalid' }, status: 403 };
  }
}
