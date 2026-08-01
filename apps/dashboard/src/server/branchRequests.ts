import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@agbc/shared/database';

import type { Caller } from './authorize';

/**
 * Reading and deciding branch-change requests (docs/spec/17 §People, ADR 0015).
 *
 * Everything goes through the CALLER's own client. The read is
 * `public.branch_request_queue`, whose WHERE clause is the whole boundary, and the write is
 * `decide_branch_request`, which checks its own authority. Nothing here can widen either;
 * it can only present them.
 *
 * WHY THE VIEW AND NOT THE TABLE. A leader being asked to accept somebody cannot read that
 * somebody: the requester is still in the branch they are leaving, and `profiles` is
 * branch-scoped. Selecting the table and joining the name gives an EMPTY QUEUE while people
 * wait, because the join is inner and RLS removes the profile (measured, pgTAP `024`). The
 * view is the one path that carries the name, and it carries nothing else about them.
 */

type Client = SupabaseClient<Database>;

export interface BranchRequest {
  id: string;
  displayName: string;
  fromBranchId: string;
  fromBranchName: string;
  toBranchId: string;
  toBranchName: string;
  createdAt: string;
  decidedAt: string | null;
}

export interface BranchRequestBoard {
  /** Pending requests into the caller's branch, oldest first. The work. */
  waiting: BranchRequest[];
  /**
   * Approved moves OUT of the caller's branch, most recent first. Read-only, and told
   * after the fact: a leader cannot block somebody leaving (decision 14). Refused and
   * cancelled requests never appear, which the view enforces rather than this code.
   */
  left: BranchRequest[];
  /** Approved moves INTO the caller's branch this calendar year. */
  joinedThisYear: number;
  /** Approved moves OUT of it this calendar year. */
  leftThisYear: number;
  /**
   * The instant this was read at, returned rather than recomputed by the caller, so the
   * "waiting 3 days" pill and the counts describe the same moment. One displayed fact,
   * one owner.
   */
  readAt: number;
}

/** `17` §1's escalation threshold, reused: the age at which a queue item is called out. */
export const WAITING_TOO_LONG_MS = 48 * 60 * 60 * 1000;

/**
 * How far back the decided rows are fetched. The calendar-year counts always sit inside it,
 * and a leader looking in January still sees who left before Christmas. Bounded rather than
 * open-ended because "select the whole table" is the shape that turns the view's one
 * `can_moderate_branch()` call per row into a real cost (named in the migration).
 */
const HISTORY_WINDOW_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * The row as the DATABASE guarantees it, which is not how the generated types describe it.
 * Postgres cannot prove NOT NULL through a view, so `database.types.ts` marks every column
 * nullable; each one is `not null` on the base table it comes from. Annotated here, once,
 * rather than null-checked at nine call sites that could never fire.
 */
interface QueueRow {
  id: string;
  status: Database['public']['Enums']['branch_request_status'];
  created_at: string;
  decided_at: string | null;
  display_name: string;
  from_branch_id: string;
  from_branch_name: string;
  to_branch_id: string;
  to_branch_name: string;
}

export async function loadBranchRequests(
  supabase: Client,
  caller: Caller,
  now: number = Date.now(),
): Promise<BranchRequestBoard> {
  const since = new Date(now - HISTORY_WINDOW_MS).toISOString();

  // ONE read for all four things on screen. The view already scopes it to what this caller
  // may see, so the filters below are about relevance, never about authority: a leader
  // passing anything at all here still cannot reach another branch's rows.
  const { data, error } = await supabase
    .from('branch_request_queue')
    .select(
      'id, status, created_at, decided_at, display_name, from_branch_id, from_branch_name, to_branch_id, to_branch_name',
    )
    // Everything still waiting, plus a year of decided rows. `decided_at` is null on a
    // pending row, so `gte` is false for it and the two halves cannot double-count.
    .or(`status.eq.pending,decided_at.gte.${since}`)
    .order('created_at', { ascending: true })
    // `merge: false` replaces the generated row type rather than intersecting with it,
    // which is the point: the generated one calls every column nullable and intersecting
    // would keep the nulls this annotation exists to remove.
    .overrideTypes<QueueRow[], { merge: false }>();

  if (error) {
    throw new Error(`could not read the branch requests: ${error.message}`);
  }

  const yearStart = Date.UTC(new Date(now).getUTCFullYear(), 0, 1);
  // An admin moderates every branch, so "into my branch" is every branch for them. A leader
  // has exactly one. Note this narrows what is SHOWN, not what is permitted: the view
  // already decided that.
  const mine = (branchId: string) =>
    caller.role === 'admin' || branchId === caller.branchId;

  const decidedThisYear = (row: QueueRow) =>
    row.status === 'approved' &&
    row.decided_at !== null &&
    new Date(row.decided_at).getTime() >= yearStart;

  const waiting = data
    .filter((row) => row.status === 'pending' && mine(row.to_branch_id))
    .map(toRequest);

  const left = data
    .filter((row) => row.status === 'approved' && mine(row.from_branch_id))
    // Newest first: history is read as "what happened lately", the opposite of a queue.
    .sort((a, b) => (b.decided_at ?? '').localeCompare(a.decided_at ?? ''))
    .map(toRequest);

  return {
    waiting,
    left,
    joinedThisYear: data.filter(
      (row) => decidedThisYear(row) && mine(row.to_branch_id),
    ).length,
    leftThisYear: data.filter(
      (row) => decidedThisYear(row) && mine(row.from_branch_id),
    ).length,
    readAt: now,
  };
}

function toRequest(row: QueueRow): BranchRequest {
  return {
    id: row.id,
    displayName: row.display_name,
    fromBranchId: row.from_branch_id,
    fromBranchName: row.from_branch_name,
    toBranchId: row.to_branch_id,
    toBranchName: row.to_branch_name,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
  };
}

export type DecideFailure =
  /** The request is not there any more. */
  | 'gone'
  /** Somebody else got to it, or a second tab did. */
  | 'already_decided'
  /** Not the destination, and not an admin. */
  | 'not_yours'
  /** An admin inside the 48 hours the destination's own leader gets first. */
  | 'leader_first'
  /** A refusal with no note. */
  | 'reason_required'
  /** A note sent with an approval, which is a bug in the caller. */
  | 'note_on_approval'
  | 'failed';

export type DecideResult = { ok: true } | { ok: false; reason: DecideFailure };

/**
 * Approve or refuse, in one transaction inside the database.
 *
 * NO STEP-UP CODE HERE, and that is a decision rather than an omission (decision 8, `17`).
 * Role assignment asks for a fresh authenticator code because handing out authority is
 * irreversible; a queue item is closer to a moderation decision, and re-challenging a
 * leader on every one of them is how queues stop getting cleared.
 *
 * The note is only ever sent with a refusal. It reaches `privileged_actions`, never the
 * request row, because the row is readable by the member and by the source branch's leader
 * and a column on a readable row is disclosed to its reader (ADR 0015).
 */
export async function decideRequest(
  supabase: Client,
  input: { requestId: string; approve: boolean; note?: string },
): Promise<DecideResult> {
  const { error } = await supabase.rpc('decide_branch_request', {
    request: input.requestId,
    approve: input.approve,
    ...(input.note ? { note: input.note } : {}),
  });

  if (!error) return { ok: true };
  return { ok: false, reason: mapRpcError(error.message) };
}

/**
 * Postgres error to a reason the surface can speak.
 *
 * Message matching, for the same reason `assignRole.ts` gives and with the same thing
 * making it safe: `decide_branch_request` raises 23514 for four different refusals, so the
 * SQLSTATE alone cannot tell them apart, and pgTAP `023` asserts every one of these strings.
 * Changing a message in the migration turns a database test red before it reaches here.
 */
function mapRpcError(message: string): DecideFailure {
  const says = (fragment: string) => message.includes(fragment);

  if (says('no such request')) return 'gone';
  if (says('already been decided')) return 'already_decided';
  if (says('only the branch being joined')) return 'not_yours';
  if (says('48 hours to decide this first')) return 'leader_first';
  if (says('needs a reason for the ministry record')) return 'reason_required';
  if (says('recorded for a refusal, not an approval'))
    return 'note_on_approval';

  // An unmapped refusal is still a refusal: falling through to a generic failure is what
  // keeps a future migration's new rule from reading as success.
  return 'failed';
}
