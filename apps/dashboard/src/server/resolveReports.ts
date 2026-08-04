import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@agbc/shared/database';

import { authorize } from './authorize';
import type { QueueKind } from './moderationQueue';

/**
 * Resolving reports (docs/spec/17 §1, W2.7 slice 4's second half).
 *
 * Three writes, and the same three rules the first dashboard write closed at slice 3:
 * authority is read from the row and never from the request, a refusal that RLS filters
 * out is a no-op rather than an error so the row count is the only honest signal, and
 * every path goes through one function so none can forget either.
 *
 * THE SAFEGUARDING RULE IS ENFORCED HERE, not only by a button the frame leaves out.
 * `02` is explicit that a flagged report survives the sweep because removal does not end
 * a safeguarding duty, and the same reasoning applies to a person: a leader closing a
 * card must not quietly close the flagged report attached to it. Every write below
 * excludes flagged rows, so the only way one closes is the safeguarding process itself.
 */

/**
 * The note stored on a resolved report. Data rather than UI copy, so it lives here and
 * not in `copy/en.ts`: `02` reserves `resolution_note` for the system's own account of
 * why a report stopped being open.
 */
const DISMISSED_NOTE = 'Reviewed by a moderator and dismissed.';
const ACTIONED_NOTE = 'Resolved by a moderation decision on the content.';

export type ReportAction = 'dismiss' | 'flag_safeguarding';

export interface ResolveInput {
  kind: QueueKind;
  id: string;
  action: ReportAction;
}

export type ResolveResult =
  | { ok: true; changed: number }
  /** Not this caller's branch, not a moderator, or the content is unreadable to them. */
  | { ok: false; reason: 'refused' }
  /**
   * Every open report on this item is flagged for safeguarding, so there was nothing this
   * action was allowed to close. Distinct from 'refused': the caller has the authority,
   * and the answer is still no.
   */
  | { ok: false; reason: 'safeguarding_stays_open' }
  | { ok: false; reason: 'failed' };

type Client = SupabaseClient<Database>;

export async function resolveReports(
  supabase: Client,
  input: ResolveInput,
): Promise<ResolveResult> {
  const branchId = await branchOf(supabase, input.kind, input.id);
  if (!branchId) return { ok: false, reason: 'refused' };

  const verdict = await authorize(supabase, {
    action: 'moderate_content',
    branchId,
  });
  if (!verdict.ok) return { ok: false, reason: 'refused' };

  return input.action === 'flag_safeguarding'
    ? await flag(supabase, input)
    : await close(supabase, input, 'dismissed', DISMISSED_NOTE);
}

/**
 * Close the open reports on an item because the content itself was just decided.
 *
 * Called after a successful moderation decision made FROM the reports screen, so a leader
 * who removes a reported post does not have to dismiss its reports as a second chore. It
 * takes the caller's client and re-authorizes through the same path as everything else.
 */
export async function markReportsActioned(
  supabase: Client,
  kind: QueueKind,
  id: string,
): Promise<ResolveResult> {
  const branchId = await branchOf(supabase, kind, id);
  if (!branchId) return { ok: false, reason: 'refused' };

  const verdict = await authorize(supabase, {
    action: 'moderate_content',
    branchId,
  });
  if (!verdict.ok) return { ok: false, reason: 'refused' };

  return await close(supabase, { kind, id }, 'actioned', ACTIONED_NOTE);
}

async function close(
  supabase: Client,
  input: Pick<ResolveInput, 'kind' | 'id'>,
  status: Database['public']['Enums']['report_status'],
  note: string,
): Promise<ResolveResult> {
  const { data, error } = await supabase
    .from('reports')
    .update({ status, resolution_note: note })
    .eq(targetColumn(input.kind), input.id)
    .eq('status', 'open')
    // The safeguarding rule, as a WHERE clause rather than a promise.
    .eq('is_safeguarding', false)
    .select('id');
  if (error) return { ok: false, reason: 'failed' };

  if (data.length === 0) {
    // Either RLS filtered every row (not this caller's branch) or every open report here
    // is flagged. The caller cleared authorize() above, so it is the second.
    return { ok: false, reason: 'safeguarding_stays_open' };
  }
  return { ok: true, changed: data.length };
}

async function flag(
  supabase: Client,
  input: Pick<ResolveInput, 'kind' | 'id'>,
): Promise<ResolveResult> {
  const { data, error } = await supabase
    .from('reports')
    .update({ is_safeguarding: true })
    .eq(targetColumn(input.kind), input.id)
    .eq('status', 'open')
    .select('id');
  if (error) return { ok: false, reason: 'failed' };
  if (data.length === 0) return { ok: false, reason: 'refused' };
  return { ok: true, changed: data.length };
}

/** Which of the two nullable target columns holds this kind (`reports_exactly_one_target`). */
function targetColumn(kind: QueueKind): 'prayer_id' | 'testimony_id' {
  return kind === 'prayer' ? 'prayer_id' : 'testimony_id';
}

/**
 * The target's branch, read from the row itself.
 *
 * A branch id arriving in a form field would let the caller nominate their own authority,
 * which is the exact hole `17` forbids and the CI probes hunt for.
 */
async function branchOf(
  supabase: Client,
  kind: QueueKind,
  id: string,
): Promise<string | null> {
  const { data } = await supabase
    .from(kind === 'prayer' ? 'prayers' : 'testimonies')
    .select('branch_id')
    .eq('id', id)
    .maybeSingle();
  return data?.branch_id ?? null;
}
