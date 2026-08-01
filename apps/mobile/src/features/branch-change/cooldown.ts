import type { BranchChangeState } from './queries';

/**
 * The 90-day settle after a COMPLETED move (decision 2), mirroring `022`'s guard.
 *
 * Pure, and in its own module so it can be tested without reaching the Supabase client:
 * `queries.ts` builds one at import time, which is right for a data layer and wrong for a
 * date calculation to depend on.
 */
export const COOLDOWN_DAYS = 90;

/**
 * When this member may ask again, or null when they may ask now.
 *
 * Computed here as well as enforced in the database, and the duplication is deliberate:
 * the guard is the truth and refuses the write, but a member should meet "you can ask
 * again from 12 August" as a calm sheet before they choose a branch, not as an error
 * after.
 *
 * MEASURED FROM THE LAST APPROVED MOVE, never from the last decision. A refusal starts no
 * settle at all (decision 2), so a leader who got it wrong can be asked again the same
 * day rather than costing the member three months.
 */
export function cooldownUntil(
  state: BranchChangeState | undefined,
  now: number = Date.now(),
): Date | null {
  const moved = state?.lastApproved?.decidedAt;
  if (!moved) return null;

  const until = new Date(moved);
  until.setDate(until.getDate() + COOLDOWN_DAYS);
  return until.getTime() > now ? until : null;
}
