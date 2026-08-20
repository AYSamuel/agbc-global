import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@agbc/shared/database';

import { authorize, type Caller } from './authorize';

/**
 * Broadcasts (docs/spec/17 §2, `02` §broadcasts, frames in this PR).
 *
 * Everything goes through the CALLER'S OWN client, which is the whole reason the database
 * half was built the way it was. `broadcasts` has zero client policies and no client grants,
 * so nothing here can touch it directly; the four action functions are SECURITY DEFINER,
 * granted to `authenticated`, and read `auth.uid()` themselves. That means the dashboard
 * never holds the service key for this module and never tells the database who is acting:
 * identity comes from the token, and authority from the live `profiles` row (ADR 0015).
 *
 * WHAT THIS MODULE DELIBERATELY DOES NOT DO: decide whether a send is allowed. It cannot,
 * and that is by design. Submitting is the author's, approval is an admin-who-is-not-the
 * author's, and both are enforced in SQL. What this layer decides is what the screen OFFERS,
 * so a leader is not shown an approve button that would fail.
 */

type Client = SupabaseClient<Database>;

export const BROADCAST_SCOPES = ['branch', 'ministry'] as const;
export type BroadcastScope = (typeof BROADCAST_SCOPES)[number];

export type BroadcastStatus =
  | 'draft'
  | 'pending_approval'
  | 'rejected'
  | 'sending'
  | 'sent'
  | 'halted'
  | 'failed';

export interface BroadcastRow {
  id: string;
  authorId: string;
  authorName: string;
  scope: BroadcastScope;
  branchId: string | null;
  branchName: string | null;
  title: string;
  body: string;
  bodyDe: string | null;
  bodyNl: string | null;
  bodyFr: string | null;
  link: string | null;
  status: BroadcastStatus;
  reviewNote: string | null;
  recipientCount: number | null;
  approvedByName: string | null;
  sentAt: string | null;
  updatedAt: string;
}

/**
 * The link allowlist (decided with Ayo 2026-08-19).
 *
 * An in-app path or agbcglobal.com, and nothing else. A broadcast link is the one place a
 * leader's typing becomes a tap target on hundreds of lock screens, which is why `15`'s deep
 * links are navigate-only in the first place.
 *
 * The database repeats the SHAPE as a CHECK, so a row can never hold a scheme-relative or
 * traversing link even if this is bypassed. The allowlist lives here because a refusal needs
 * a sentence a human can act on, and a CHECK cannot say "paste it into WhatsApp instead".
 */
const ALLOWED_HOST = /^([a-z0-9-]+\.)*agbcglobal\.com$/;

export type LinkVerdict =
  | { ok: true; value: string | null }
  | { ok: false; reason: 'not_allowed' | 'malformed' };

export function checkLink(raw: string | null | undefined): LinkVerdict {
  const link = (raw ?? '').trim();
  if (link === '') return { ok: true, value: null };

  // An in-app path. Deliberately the same conservative shape the app's own allowlist
  // accepts (`features/notifications/deepLinks.ts`): no query, no fragment, no traversal,
  // because each of those is how a navigation stops being only a navigation.
  if (link.startsWith('/')) {
    if (link.startsWith('//') || /[?#]/.test(link) || link.includes('..')) {
      return { ok: false, reason: 'malformed' };
    }
    return /^\/[A-Za-z0-9/_.-]*$/.test(link)
      ? { ok: true, value: link }
      : { ok: false, reason: 'malformed' };
  }

  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  // https only: an http link on a lock screen is a downgrade nobody chose.
  if (url.protocol !== 'https:') return { ok: false, reason: 'not_allowed' };
  if (!ALLOWED_HOST.test(url.hostname))
    return { ok: false, reason: 'not_allowed' };
  return { ok: true, value: url.toString() };
}

interface BroadcastRecord {
  id: string;
  author_id: string;
  scope: BroadcastScope;
  branch_id: string | null;
  title: string;
  body: string;
  body_de: string | null;
  body_nl: string | null;
  body_fr: string | null;
  link: string | null;
  status: BroadcastStatus;
  review_note: string | null;
  recipient_count: number | null;
  sent_at: string | null;
  updated_at: string;
  author: { display_name: string } | null;
  approver: { display_name: string } | null;
  branch: { name: string } | null;
}

function toRow(record: BroadcastRecord): BroadcastRow {
  return {
    id: record.id,
    authorId: record.author_id,
    authorName: record.author?.display_name ?? '',
    scope: record.scope,
    branchId: record.branch_id,
    branchName: record.branch?.name ?? null,
    title: record.title,
    body: record.body,
    bodyDe: record.body_de,
    bodyNl: record.body_nl,
    bodyFr: record.body_fr,
    link: record.link,
    status: record.status,
    reviewNote: record.review_note,
    recipientCount: record.recipient_count,
    approvedByName: record.approver?.display_name ?? null,
    sentAt: record.sent_at,
    updatedAt: record.updated_at,
  };
}

export interface BroadcastLists {
  /** Waiting on an admin. Empty for a leader, who cannot approve anything. */
  waiting: BroadcastRow[];
  /** The caller's own drafts and anything sent back to them. */
  mine: BroadcastRow[];
  /** History, newest first. */
  sent: BroadcastRow[];
}

/**
 * Everything the broadcasts screen shows, in one read.
 *
 * A leader sees their own work and their branch's history; an admin sees the approval queue
 * as well. The scoping is done here rather than in RLS because `broadcasts` has no client
 * policies at all: this module reaches the table through a definer view function, and what
 * it may show is decided by the caller's role, which `authorize()` has already established.
 */
export async function loadBroadcasts(
  supabase: Client,
  caller: Caller,
): Promise<BroadcastLists> {
  const { data, error } = await supabase.rpc('visible_broadcasts');
  if (error) throw new Error(`broadcasts read failed: ${error.message}`);

  const rows = (data as unknown as BroadcastRecord[]).map(toRow);

  return {
    // An admin's OWN broadcast is not waiting on them: they cannot approve it, and the
    // database refuses if they try. Leaving it in this list showed the same card twice on
    // one screen, both with the refusal, and counted it in "1 waiting on you" (seen in the
    // browser 2026-08-19). It belongs in `mine`, which is where the refusal reads as an
    // explanation rather than as a duplicate row.
    waiting:
      caller.role === 'admin'
        ? rows.filter(
            (row) =>
              row.status === 'pending_approval' &&
              row.authorId !== caller.userId,
          )
        : [],
    mine: rows.filter(
      (row) =>
        row.authorId === caller.userId &&
        (row.status === 'draft' ||
          row.status === 'rejected' ||
          row.status === 'pending_approval'),
    ),
    sent: rows.filter(
      (row) =>
        row.status === 'sending' ||
        row.status === 'sent' ||
        row.status === 'halted' ||
        row.status === 'failed',
    ),
  };
}

export interface DraftInput {
  id?: string;
  scope: BroadcastScope;
  title: string;
  body: string;
  bodyDe?: string;
  bodyNl?: string;
  bodyFr?: string;
  link?: string;
}

export type SaveResult =
  | { ok: true; id: string }
  | { ok: false; reason: 'link_not_allowed' | 'link_malformed' | 'refused' };

/**
 * Create or update a draft.
 *
 * The scope decides which authority is asked for, which is the whole reason
 * `compose_ministry_broadcast` exists as its own action: a leader who posts a crafted form
 * asking for ministry scope is refused here, by the same call every other route makes,
 * rather than by a condition somebody remembered to write.
 */
export async function saveDraft(
  supabase: Client,
  input: DraftInput,
): Promise<SaveResult> {
  const link = checkLink(input.link);
  if (!link.ok) {
    return {
      ok: false,
      reason:
        link.reason === 'not_allowed' ? 'link_not_allowed' : 'link_malformed',
    };
  }

  const verdict = await authorize(supabase, {
    action:
      input.scope === 'ministry'
        ? 'compose_ministry_broadcast'
        : 'compose_broadcast',
  });
  if (!verdict.ok) return { ok: false, reason: 'refused' };

  // `undefined` rather than `null` for every optional value, which is not a typing
  // workaround but the contract: these arguments carry SQL defaults of null, so omitting
  // one is how "the author cleared this field" is expressed. Sending null would say the
  // same thing, and the generated types will not let us, because a caller who omits an
  // argument and a caller who passes null are indistinguishable to Postgres.
  const payload = {
    scope: input.scope,
    // A leader's branch, read from the caller rather than from the form: a branch id in a
    // request body would hand the caller their own audience. The SQL enforces it again.
    branch_id: input.scope === 'branch' ? verdict.caller.branchId : undefined,
    title: input.title.trim(),
    body: input.body.trim(),
    body_de: input.bodyDe?.trim() || undefined,
    body_nl: input.bodyNl?.trim() || undefined,
    body_fr: input.bodyFr?.trim() || undefined,
    link: link.value ?? undefined,
  };

  const { data, error } = input.id
    ? await supabase.rpc('update_broadcast_draft', {
        broadcast: input.id,
        ...payload,
      })
    : await supabase.rpc('create_broadcast_draft', payload);

  if (error) throw new Error(`draft save failed: ${error.message}`);
  return { ok: true, id: data };
}

export type ActionResult = { ok: true } | { ok: false; reason: string };

/** The author sends it for approval. Refused for anyone else, in SQL. */
export async function submitBroadcast(
  supabase: Client,
  id: string,
): Promise<ActionResult> {
  return await call(supabase, 'submit_broadcast', { broadcast: id });
}

/**
 * An admin releases it.
 *
 * `authorize()` first, so a leader never reaches the call at all and the refusal is the
 * dashboard's own rather than a database error shown to a human. The database still decides:
 * it refuses an admin approving their own, which this layer cannot see without the row.
 */
export async function approveBroadcast(
  supabase: Client,
  id: string,
): Promise<ActionResult> {
  const verdict = await authorize(supabase, { action: 'approve_broadcast' });
  if (!verdict.ok) return { ok: false, reason: verdict.reason };
  return await call(supabase, 'approve_broadcast', { broadcast: id });
}

/** Or sends it back, with a reason the author will read. */
export async function rejectBroadcast(
  supabase: Client,
  id: string,
  note: string,
): Promise<ActionResult> {
  const verdict = await authorize(supabase, { action: 'approve_broadcast' });
  if (!verdict.ok) return { ok: false, reason: verdict.reason };
  if (note.trim() === '') return { ok: false, reason: 'note_required' };
  return await call(supabase, 'reject_broadcast', {
    broadcast: id,
    note: note.trim(),
  });
}

/**
 * The brake.
 *
 * Deliberately NOT behind `approve_broadcast`: the database lets the author or any admin
 * halt, because approving is a judgement and halting is an emergency, and the person best
 * placed to notice a mistake is usually the one who wrote it.
 */
export async function haltBroadcast(
  supabase: Client,
  id: string,
): Promise<ActionResult> {
  return await call(supabase, 'halt_broadcast', { broadcast: id });
}

export interface Reach {
  total: number;
  /** Of those, how many have at least one device registered. */
  withDevice: number;
  /** The rest, who find it in the app rather than on a lock screen. */
  inAppOnly: number;
}

/**
 * The reach, split (CONFIRM frame).
 *
 * `17` §2 asks for the exact recipient count and this shows why the number is what it is.
 * The total comes from `broadcast_recipient_count()`, which is the SAME definition the
 * fan-out derives its audience from, so what a leader approves and what receives cannot
 * drift apart.
 */
export async function reachBreakdown(
  supabase: Client,
  id: string,
): Promise<Reach> {
  const [total, withDevice] = await Promise.all([
    recipientCount(supabase, id),
    (async () => {
      const { data, error } = await supabase.rpc(
        'broadcast_reach_with_device',
        {
          broadcast: id,
        },
      );
      if (error) throw new Error(`reach read failed: ${error.message}`);
      return data;
    })(),
  ]);

  return { total, withDevice, inAppOnly: Math.max(total - withDevice, 0) };
}

/** How many people it would reach, for the confirmation screen. */
export async function recipientCount(
  supabase: Client,
  id: string,
): Promise<number> {
  const { data, error } = await supabase.rpc('broadcast_recipient_count', {
    broadcast: id,
  });
  if (error) throw new Error(`recipient count failed: ${error.message}`);
  return data;
}

/**
 * One place where a refused RPC becomes a result rather than a crash.
 *
 * The action functions raise `42501` for an authority failure and `23514` for a state one,
 * and both are things a human did rather than faults: approving something a colleague
 * approved a second earlier is a race, not a bug. The message is Postgres's own, which is
 * written for an operator; the screens map the reason to their own copy.
 */
async function call(
  supabase: Client,
  fn:
    | 'submit_broadcast'
    | 'approve_broadcast'
    | 'reject_broadcast'
    | 'halt_broadcast',
  args: Record<string, string>,
): Promise<ActionResult> {
  const { error } = await supabase.rpc(fn, args as never);
  if (!error) return { ok: true };
  if (
    error.code === '42501' ||
    error.code === '23514' ||
    error.code === 'P0002'
  ) {
    return { ok: false, reason: error.message };
  }
  throw new Error(`${fn} failed: ${error.message}`);
}
