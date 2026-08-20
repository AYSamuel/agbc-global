import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@agbc/shared/database';

import { authorize, type Caller } from './authorize';

/**
 * Events (docs/spec/17 §3, `11`, `02` §events; frames in this PR).
 *
 * Everything goes through the CALLER'S OWN client, and unlike broadcasts there is no definer
 * function in the way: `events` has carried its policies since W1.7 (`can_moderate_branch`
 * on insert and update, public read), so RLS is the boundary and this module is what decides
 * what the screen OFFERS. A leader is not shown an edit button that would fail.
 *
 * WHAT THIS MODULE DELIBERATELY DOES NOT DO: decide who gets notified, or when. That is the
 * whole of `event-notices` (20260820120000), derived in SQL from what the row says versus
 * what was last announced. This layer never writes `announced_*` and could not if it tried:
 * the update guard restores those columns for any caller with a `auth.uid()`. What the
 * screens do instead is TELL the leader what their save will do, using the same count the
 * notice itself will reach (`event_rsvp_audience`).
 */

type Client = SupabaseClient<Database>;

export type EventStatus = 'scheduled' | 'cancelled';

export interface EventRow {
  id: string;
  /** NULL is ministry-wide, the single source of truth for scope (docs/spec/02). */
  branchId: string | null;
  branchName: string | null;
  title: string;
  description: string;
  startsAtLocal: string;
  endsAtLocal: string | null;
  timezone: string;
  location: string;
  status: EventStatus;
  rsvpEnabled: boolean;
  /** True when this caller may edit it: a leader's own branch, or anything for an admin. */
  editable: boolean;
}

interface EventRecord {
  id: string;
  branch_id: string | null;
  title: string;
  description: string;
  starts_at_local: string;
  ends_at_local: string | null;
  timezone: string;
  location: string;
  status: EventStatus;
  rsvp_enabled: boolean;
  branch: { name: string } | null;
}

const COLUMNS =
  'id, branch_id, title, description, starts_at_local, ends_at_local, timezone, location, status, rsvp_enabled, branch:branches(name)';

function toRow(record: EventRecord, caller: Caller): EventRow {
  return {
    id: record.id,
    branchId: record.branch_id,
    branchName: record.branch?.name ?? null,
    title: record.title,
    description: record.description,
    startsAtLocal: record.starts_at_local,
    endsAtLocal: record.ends_at_local,
    timezone: record.timezone,
    location: record.location,
    status: record.status,
    rsvpEnabled: record.rsvp_enabled,
    editable: canEdit(record.branch_id, caller),
  };
}

/**
 * The same test `can_moderate_branch()` makes in SQL, made here so the UI can hide what the
 * database would refuse.
 *
 * It is NOT the authorization: every write below awaits `authorize()` and then meets RLS.
 * Hiding a control is a courtesy to the reader, never a boundary (~/.claude/standards).
 */
function canEdit(branchId: string | null, caller: Caller): boolean {
  if (caller.role === 'admin') return true;
  return branchId !== null && branchId === caller.branchId;
}

export interface EventLists {
  /** Starting from today, soonest first: the working list. */
  upcoming: EventRow[];
  /** Newest first, and shorter: history, kept because a deep link still lands on it. */
  past: EventRow[];
}

/**
 * Everything the events screen shows, in one read.
 *
 * A LEADER SEES MINISTRY-WIDE EVENTS TOO, read-only. They are not theirs to edit
 * (`can_moderate_branch(null)` is admins alone), but a branch leader planning their month
 * needs to know the whole family is gathering on the 28th, and the app shows their members
 * exactly that. What they do not see is another BRANCH's events, which are neither theirs
 * to run nor useful to them.
 */
export async function loadEvents(
  supabase: Client,
  caller: Caller,
  now: Date = new Date(),
): Promise<EventLists> {
  // The cut is by wall clock rather than by instant, deliberately and cheaply: an event is
  // "past" here the moment its local start is behind the viewer's own day, which is what a
  // leader means by past. `event_start_instant` is the precise version and it is the RSVP
  // guard's job, not a list header's.
  const query = supabase
    .from('events')
    .select(COLUMNS)
    .order('starts_at_local', { ascending: true });

  const { data, error } =
    caller.role === 'admin'
      ? await query
      : await query.or(`branch_id.eq.${caller.branchId},branch_id.is.null`);

  if (error) throw new Error(`events read failed: ${error.message}`);

  const rows = (data as unknown as EventRecord[]).map((record) =>
    toRow(record, caller),
  );
  const cutoff = startOfDay(now);

  return {
    upcoming: rows.filter((row) => row.startsAtLocal >= cutoff),
    past: rows.filter((row) => row.startsAtLocal < cutoff).reverse(),
  };
}

/** 'YYYY-MM-DDT00:00:00', for comparing against PostgREST's naive timestamps as strings. */
function startOfDay(now: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T00:00:00`;
}

export async function loadEvent(
  supabase: Client,
  caller: Caller,
  id: string,
): Promise<EventRow | null> {
  const { data, error } = await supabase
    .from('events')
    .select(COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(`event read failed: ${error.message}`);
  if (!data) return null;
  return toRow(data, caller);
}

export interface Audience {
  going: number;
  interested: number;
  /** Everyone a change would reach: going + interested, live accounts only. */
  reachable: number;
}

/**
 * How many people a change to this event would tell.
 *
 * `event_rsvp_audience` is the SAME set `event_notice_recipients` announces to, so the
 * number on the cancel screen and the number that receives cannot drift. It answers zero for
 * an event the caller does not moderate, which is why the screens only ask about their own.
 */
export async function loadAudience(
  supabase: Client,
  id: string,
): Promise<Audience> {
  const { data, error } = await supabase.rpc('event_rsvp_audience', {
    event: id,
  });
  if (error) throw new Error(`audience read failed: ${error.message}`);

  // A caller who does not moderate this event gets a row of zeroes from the function
  // itself; an empty result would mean the event is gone, and zero is the honest answer to
  // "how many would this tell" either way.
  const rows = data as unknown as Audience[];
  return rows.length > 0 ? rows[0] : { going: 0, interested: 0, reachable: 0 };
}

/**
 * How many people posting a NEW event would tell.
 *
 * Separate from `loadAudience` because it answers a different question: that one counts who
 * holds an RSVP to an event that exists, this one counts a branch (or the whole ministry)
 * against the preference that gates a posting. Both come from the database for the same
 * reason: the dashboard cannot see anybody's `notification_prefs` but the caller's own.
 */
export async function postingAudience(
  supabase: Client,
  branchId: string | null,
): Promise<number> {
  // Omitted rather than null for ministry-wide: the SQL argument defaults to null, and a
  // typed client cannot pass null to an argument supabase-js generates as non-null.
  const { data, error } = await supabase.rpc('event_posting_audience', {
    branch: branchId ?? undefined,
  });
  if (error) throw new Error(`posting audience read failed: ${error.message}`);
  return data;
}

export interface EventInput {
  id?: string;
  /** 'branch' uses the caller's own branch; 'ministry' is branch_id NULL and admins only. */
  scope: 'branch' | 'ministry';
  title: string;
  description: string;
  startsAtLocal: string;
  endsAtLocal?: string;
  location: string;
  rsvpEnabled: boolean;
}

export type SaveResult =
  { ok: true; id: string } | { ok: false; reason: SaveRefusal };

export type SaveRefusal =
  | 'refused'
  | 'title_required'
  | 'starts_required'
  | 'location_required'
  | 'ends_before_start'
  | 'scope_locked';

/**
 * Create or update an event.
 *
 * THE SCOPE DECIDES WHICH AUTHORITY IS ASKED FOR, exactly as the broadcast composer does: a
 * leader who posts a crafted form asking for ministry scope is refused here by the same call
 * every other route makes, rather than by a condition somebody remembered to write. RLS
 * refuses it a second time, because `can_moderate_branch(null)` is true for admins alone.
 *
 * THE BRANCH IS READ FROM THE CALLER, never from the form. A branch id in a request body
 * would hand the caller their own audience.
 *
 * SCOPE IS FIXED AFTER CREATION. Moving an event between branches, or into ministry-wide,
 * would change who it belongs to and who has already been told about it, and the notice
 * machinery has no way to say "this is now somebody else's event". Refused here rather than
 * left to produce something incoherent.
 */
export async function saveEvent(
  supabase: Client,
  input: EventInput,
  existing?: EventRow,
): Promise<SaveResult> {
  const title = input.title.trim();
  const location = input.location.trim();
  const startsAtLocal = input.startsAtLocal.trim();
  const endsAtLocal = input.endsAtLocal?.trim() || null;

  if (title === '') return { ok: false, reason: 'title_required' };
  if (startsAtLocal === '') return { ok: false, reason: 'starts_required' };
  if (location === '') return { ok: false, reason: 'location_required' };
  // The database has the same CHECK; this exists so the answer is a sentence rather than a
  // constraint name (`events_ends_after_start`).
  if (endsAtLocal !== null && endsAtLocal <= startsAtLocal) {
    return { ok: false, reason: 'ends_before_start' };
  }

  if (existing) {
    const existingScope = existing.branchId === null ? 'ministry' : 'branch';
    if (existingScope !== input.scope)
      return { ok: false, reason: 'scope_locked' };
  }

  const verdict = await authorize(supabase, {
    action:
      input.scope === 'ministry' ? 'manage_ministry_events' : 'manage_events',
    branchId: existing?.branchId ?? undefined,
  });
  if (!verdict.ok) return { ok: false, reason: 'refused' };

  const payload = {
    title,
    description: input.description.trim(),
    starts_at_local: startsAtLocal,
    ends_at_local: endsAtLocal,
    location,
    rsvp_enabled: input.rsvpEnabled,
  };

  if (input.id) {
    const { error } = await supabase
      .from('events')
      .update(payload)
      .eq('id', input.id);
    if (error) throw new Error(`event save failed: ${error.message}`);
    return { ok: true, id: input.id };
  }

  const { data, error } = await supabase
    .from('events')
    .insert({
      ...payload,
      branch_id: input.scope === 'ministry' ? null : verdict.caller.branchId,
      // Empty ON PURPOSE, not unset: the insert guard fills the zone from the branch (HQ for
      // a ministry-wide event), which is the one place that decision should live, and it
      // reads '' exactly as it reads NULL. The column is NOT NULL with no default, so the
      // generated types insist on a value, and inventing one here would be this layer
      // quietly deciding what time an event happens in.
      timezone: '',
    })
    .select('id')
    .single();

  if (error) throw new Error(`event create failed: ${error.message}`);
  return { ok: true, id: data.id };
}

export type StatusResult = { ok: true } | { ok: false; reason: StatusRefusal };

export type StatusRefusal = 'refused' | 'already_started' | 'not_found';

/**
 * Cancel an event, or put it back on.
 *
 * A PUBLISHED EVENT IS CANCELLED AND NEVER DELETED (`11`, `02`), which is why there is no
 * delete anywhere in this module and no client role holds DELETE on the table: old
 * notification deep links must land on the cancelled treatment rather than a missing page.
 *
 * Reinstatement is future-only, and that rule is the DATABASE's (`events_update_guard` raises
 * `23514`). This maps the refusal to something a human can read rather than repeating the
 * test and risking the two disagreeing about "now".
 */
export async function setEventStatus(
  supabase: Client,
  event: EventRow,
  status: EventStatus,
): Promise<StatusResult> {
  const verdict = await authorize(supabase, {
    action:
      event.branchId === null ? 'manage_ministry_events' : 'manage_events',
    branchId: event.branchId ?? undefined,
  });
  if (!verdict.ok) return { ok: false, reason: 'refused' };

  const { error } = await supabase
    .from('events')
    .update({ status })
    .eq('id', event.id);

  if (!error) return { ok: true };
  if (error.code === '23514') return { ok: false, reason: 'already_started' };
  if (error.code === '42501') return { ok: false, reason: 'refused' };
  throw new Error(`event status change failed: ${error.message}`);
}
