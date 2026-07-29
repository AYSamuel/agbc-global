import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@agbc/shared/database';

import { authorize } from './authorize';
import type { QueueKind } from './moderationQueue';

/**
 * Making a moderation decision (docs/spec/17 §1, W2.7 slice 3).
 *
 * The dashboard's first WRITE, so this is the one place three easy mistakes are closed
 * once rather than in every route that follows:
 *
 * 1. **Compare-and-set is opt-in.** The database refuses a decision whose `updated_at`
 *    does not match the row's current value, but ONLY if the caller sends one. Omit it
 *    and the two are identical by definition, the check passes, and a decision made
 *    against words the author has since rewritten lands silently. Asserted in pgTAP 017.
 *    Every decision goes through this function so none can forget.
 *
 * 2. **A refused decision is a no-op, not an error.** `moderators update ... in their
 *    branch` filters a foreign-branch row out before the trigger can object, so the
 *    statement succeeds and changes nothing. Reading "no error" as "it worked" would
 *    show a leader a green tick for something that never happened, so this asks for the
 *    row back and treats an empty result as a refusal.
 *
 * 3. **Authority never comes from the request.** The caller supplies an id; the branch
 *    is read from the row and handed to authorize(). A branch id in the request body
 *    would let the caller nominate their own permissions.
 */

export type Decision = 'approve' | 'reject' | 'remove';

export interface DecisionInput {
  kind: QueueKind;
  id: string;
  /** The version the reviewer had on screen. */
  reviewedUpdatedAt: string;
  decision: Decision;
  /** Shown to the author in MY-POSTS (`09`). Required when rejecting. */
  rejectionReason?: string;
  /** NEVER shown to the author. Required when removing (decided 2026-07-29). */
  moderationNote?: string;
}

export type DecisionResult =
  | { ok: true }
  /** The author edited between review and decision; the item stays in the queue. */
  | { ok: false; reason: 'content_changed' }
  /** Not this caller's branch, or not a moderator at all. */
  | { ok: false; reason: 'refused' }
  /** Only an admin may bring back removed content. */
  | { ok: false; reason: 'restore_needs_admin' }
  | { ok: false; reason: 'missing_reason' }
  | { ok: false; reason: 'failed' };

const STATUS: Record<Decision, Database['public']['Enums']['content_status']> =
  {
    approve: 'approved',
    reject: 'rejected',
    remove: 'removed',
  };

type Client = SupabaseClient<Database>;

export async function moderateItem(
  supabase: Client,
  input: DecisionInput,
): Promise<DecisionResult> {
  if (input.decision === 'reject' && !input.rejectionReason?.trim()) {
    return { ok: false, reason: 'missing_reason' };
  }
  if (input.decision === 'remove' && !input.moderationNote?.trim()) {
    return { ok: false, reason: 'missing_reason' };
  }

  const table = input.kind === 'prayer' ? 'prayers' : 'testimonies';

  // The target's branch, read from the row. If the caller cannot even see it, there is
  // nothing to authorize and nothing to tell them beyond a refusal.
  const { data: target } = await supabase
    .from(table)
    .select('branch_id, status')
    .eq('id', input.id)
    .maybeSingle();
  if (!target) return { ok: false, reason: 'refused' };
  const verdict = await authorize(supabase, {
    action: 'moderate_content',
    branchId: target.branch_id,
  });
  if (!verdict.ok) {
    return {
      ok: false,
      reason: verdict.reason === 'wrong_branch' ? 'refused' : 'refused',
    };
  }
  const { data, error } = await supabase
    .from(table)
    .update({
      status: STATUS[input.decision],
      // Carrying the reviewed version IS the compare-and-set. Never omit it.
      updated_at: input.reviewedUpdatedAt,
      rejection_reason:
        input.decision === 'reject'
          ? (input.rejectionReason?.trim() ?? null)
          : null,
      moderation_note:
        input.decision === 'remove'
          ? (input.moderationNote?.trim() ?? null)
          : null,
    })
    .eq('id', input.id)
    .select('id');
  if (error) {
    // PT409: the trigger's 'content changed since review', surfaced as HTTP 409.
    // NOT 40001 (serialization_failure), which W1.5 used and which makes the request
    // hang forever rather than return: measured over raw HTTP 2026-07-29.
    if (error.code === 'PT409') return { ok: false, reason: 'content_changed' };
    // 42501 insufficient_privilege covers both "not a moderator here" and the
    // admin-only restore; the message distinguishes them.
    if (error.code === '42501') {
      return {
        ok: false,
        reason: error.message.includes('restore')
          ? 'restore_needs_admin'
          : 'refused',
      };
    }
    return { ok: false, reason: 'failed' };
  }

  // The no-op case, and the reason this function returns the row rather than trusting
  // the absence of an error. RLS filters a foreign-branch row out before the trigger can
  // object, so the statement succeeds and changes nothing. `data` is non-nullable once
  // `error` is null, so the length is the whole signal.
  if (data.length === 0) return { ok: false, reason: 'refused' };

  return { ok: true };
}
