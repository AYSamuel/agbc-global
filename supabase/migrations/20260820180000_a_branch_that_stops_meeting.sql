-- W3.5 slice 5a: a branch can be opened, kept, and closed (docs/spec/17 §5, `02`
-- §branches, ADR 0015).
--
-- `branch_status` and `branches.status` have existed since 20260719200021 and NOTHING has
-- ever set 'archived'. The enum was the promise; this migration is the mechanism. What it
-- adds is small, because most of the archived-branch contract was already built by the
-- items that happened to need it first, and finding that out was most of the work:
--
--   * every mobile branch surface (onboarding, BRANCH-SWITCH, BRANCHES, the map, events'
--     city lookup) reads one shared query that already filters `status = 'active'`;
--   * `service-reminders` already joins `branches` on `status = 'active'`;
--   * `branch_change_requests_guard` already refuses an archived DESTINATION, and
--     `set_member_role` already refuses assigning anybody into one;
--   * `moderation_alert_batch` already routes a branch's queue to "its own leaders, or every
--     admin when it has none", citing `02`'s archived-branch rule by name. Since archiving
--     is blocked until the leaders are gone, the escalation is a consequence of the block
--     rather than a second thing to build. A second escalation mechanism would be a second
--     owner of one fact.
--
-- So what is genuinely missing is three things: a write path for branches at all, the act of
-- archiving with its preconditions and its consequences, and the member's own way out of a
-- branch that has closed underneath them.
--
-- ---------------------------------------------------------------------------
-- THE FIVE DECISIONS TAKEN WITH AYO, 2026-08-20, BEFORE THIS FILE
-- ---------------------------------------------------------------------------
--  1. NO SECOND PAIR OF EYES. A broadcast needs an approver because it cannot be unsent; a
--     cancellation needs only a settle window because it is a fact and waiting for an admin
--     is the worse failure; an archive needs a fresh authenticator code and the branch's
--     name typed, because nothing leaves for a phone at the moment it happens and an admin
--     can put it back. `17` §Platform already listed branch management in its step-up set,
--     so this is the doc's own answer rather than a new rule.
--  2. ARCHIVING CANCELS THE BRANCH'S FUTURE EVENTS, through the ordinary status change, so
--     `event-notices` tells everyone still holding an RSVP that it is off, in their own
--     language, on the settle window that already exists.
--  3. The member's prompt is a dismissible launch surface with a Home card behind it, not a
--     gate. Built in slice 5c; what this file owes it is the function it calls.
--  4. AN ARCHIVED BRANCH CAN BE BROUGHT BACK by any admin. A plant that stops meeting
--     sometimes starts again, and the alternative recovery is hand-typed SQL against
--     production.
--  5. The escalated moderation goes to every admin, and is already built (above).
--
-- Rollback (roll forward): a compensating migration drops the five functions, the guard and
-- its trigger, the two policies on each of the two tables, the column grants, and the two
-- columns; and restores `broadcast_recipients`, `create_broadcast_draft`,
-- `approve_broadcast` and `events_insert_guard` to the definitions named at each one below.

begin;

-- `branches` is read by every guest on first launch and joined by four jobs; the column add
-- and the trigger both take ACCESS EXCLUSIVE (~/.claude/standards/database.md §Migrations).
set local lock_timeout = '3s';

-- ===========================================================================
-- 1. Who closed it, and when
-- ===========================================================================
-- TWO COLUMNS RATHER THAN A `privileged_actions` ROW, for the third time in this item and
-- for the same reason each time: that ledger is profile-oriented (`actor_id` and `target_id`
-- both reference `profiles`) and the subject of this action is a BRANCH. Forcing it in would
-- mean a row whose target is null and whose meaning lives in a JSON blob, which is a worse
-- record than two columns on the row itself. W3.5 slice 1 said it about a broadcast approval
-- and slice 4 about `events.status_changed_by`; the shape here is deliberately identical to
-- the second, down to the ON DELETE SET NULL.

alter table public.branches
  add column archived_at timestamptz,
  add column archived_by uuid references public.profiles (id) on delete set null;

comment on column public.branches.archived_at is
  'When this branch was closed, or NULL while it is open (docs/spec/17 §5). Server-written by branches_guard from the status change; restored for any caller who tries to set it.';
comment on column public.branches.archived_by is
  'Who closed it. Server-written from auth.uid(); NULL means a trusted caller with no user context (a seed, a job, pgTAP) or an account since deleted. Not in privileged_actions because that ledger is profile-oriented and this action has no profile target.';

-- The FK gets its covering index, per the conventions in `02`. Partial because almost every
-- row is null: four branches exist and none of them are closed.
create index branches_archived_by_idx
  on public.branches (archived_by)
  where archived_by is not null;

-- ===========================================================================
-- 2. The guard that owns them
-- ===========================================================================
/**
 * The stamp derives from the status change and is never an input.
 *
 * Same rule as `events.status_changed_by` (20260820160000) and for the same reason: an admin
 * who could write "closed by somebody else" could put a name on an act that was not theirs.
 *
 * ON INSERT it only acts for a CLIENT caller. A restore from a dump replays archived
 * branches as INSERTs with their stamps already on them, and a guard that nulled those would
 * quietly rewrite history the first time this database was ever restored. A trusted caller
 * with no `auth.uid()` is therefore left alone, which is the same door every other guard in
 * this schema leaves open.
 *
 * ON UPDATE it acts for everyone, because there the stamp has a source: the transition
 * itself. A trusted caller flipping the status gets `archived_by = NULL`, which reads as
 * "the server did it" and is true.
 */
create function public.branches_guard()
returns trigger
language plpgsql
as $function$
begin
  if tg_op = 'INSERT' then
    if (select auth.uid()) is null then
      return new;
    end if;
    -- A branch that has never opened cannot have closed. This clause is honest about its own
    -- reach, the way `set_member_role`'s last-admin clause is: `status` is not in the INSERT
    -- grant below, so no client can name it and this cannot fire today. It stays as the
    -- backstop for the next caller, because "a new branch opens active" is a rule about the
    -- data rather than about who currently holds a privilege.
    if new.status <> 'active' then
      raise exception 'a new branch opens active; closing one is its own act'
        using errcode = 'check_violation';
    end if;
    new.archived_at := null;
    new.archived_by := null;
    return new;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'archived' then
      new.archived_at := now();
      new.archived_by := (select auth.uid());
    else
      new.archived_at := null;
      new.archived_by := null;
    end if;
  else
    new.archived_at := old.archived_at;
    new.archived_by := old.archived_by;
  end if;

  return new;
end;
$function$;

comment on function public.branches_guard is
  'Owns branches.archived_at/archived_by: stamped from the status transition and from auth.uid(), never taken from a writer (docs/spec/17 §5).';

-- BEFORE, and ahead of nothing else: `branches_set_updated_at` is the only other row trigger
-- on this table and the two touch different columns, so the order Postgres picks (alphabetical
-- on the trigger name) cannot matter.
create trigger branches_guard
  before insert or update on public.branches
  for each row execute function public.branches_guard();

-- ===========================================================================
-- 3. Who may add and edit a branch
-- ===========================================================================
-- POLICIES AND COLUMN GRANTS, not an RPC, and the split is the point.
--
-- `branches` has carried public SELECT and no client write path at all since it was created,
-- and the obvious reading of `17` ("admins manage branches") would be one more SECURITY
-- DEFINER function. It would need seventeen arguments and would have to be rewritten every
-- time a column is added, which is how a write path quietly falls behind its table. The
-- events module answers the same question the other way (RLS is the boundary, and the server
-- module decides what the screen OFFERS), and that is the pattern to follow here.
--
-- What an RPC would have bought is the one thing this must NOT allow: setting `status`
-- directly and skipping everything archiving is supposed to do. Column grants buy it more
-- cheaply and more honestly. `status`, `archived_at` and `archived_by` are simply not in the
-- grant, so a client cannot NAME them: the refusal is `42501` at the grant layer, before RLS
-- is consulted, and it is the same "identity is not an input" mechanism `saved_items` uses
-- for `profile_id` (20260815120000). Archiving therefore HAS to go through the function
-- below, because there is no other door.

-- ---------------------------------------------------------------------------
-- FIRST, TAKE BACK WHAT NOBODY MEANT TO GIVE
-- ---------------------------------------------------------------------------
-- MEASURED ON THE LOCAL STACK, 2026-08-20, while writing `047`: the first draft of the
-- column grants below changed nothing, because `anon` and `authenticated` already held
-- `arwdDxtm` on this table. That is ALL privileges, including UPDATE, DELETE and TRUNCATE:
--
--   relacl -> {postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,
--              authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}
--
-- It comes from Supabase's ambient `alter default privileges ... grant all on tables to
-- anon, authenticated, service_role`, applied at CREATE TABLE time. 20260719200021's own
-- header says "never rely on ambient default-privilege bootstrap" and then granted SELECT
-- on top of it without ever revoking, which is the half of that sentence that was missing:
-- an explicit grant does not displace an ambient one.
--
-- Nothing was open. `branches` has FORCE RLS and carried exactly one policy, for SELECT, so
-- every write matched no policy and was refused. But it meant RLS was the ONLY boundary on a
-- table this repo's own convention says should have two ("RLS is the row boundary; GRANTs are
-- the table boundary"), and it is what makes a partial revoke necessary here: a table-level
-- grant cannot be narrowed, only replaced, which is the lesson of 20260803140000 arriving
-- from the other side.
--
-- NINE OTHER TABLES CARRY THE SAME AMBIENT GRANTS (app_config, daily_verses, devices,
-- giving_config, notification_prefs, playback_positions, profiles, sermons, and
-- branch_services below). They are all from W0.10 and W1.x, before this repo started writing
-- its grants out; every table created since has explicit ones. Fixing the two this slice owns
-- and flagging the rest rather than sweeping eight unrelated tables into a feature migration.

revoke all on public.branches from anon, authenticated;
revoke all on public.branch_services from anon, authenticated;

-- Public read is the product (guest-first): restored explicitly, for both roles, exactly as
-- 20260719200021 intended it.
grant select on public.branches, public.branch_services to anon, authenticated;

-- A table-level grant cannot be partially revoked, so the column list is the whole grant
-- (the lesson of 20260803140000, applied to the write side).
grant insert (
  slug, name, city, country, is_hq, timezone, languages, youtube_channel_id, email,
  lat, lng, service_times, address, lead, leaders, welcome, quote, "order"
) on public.branches to authenticated;

-- `slug` is insert-only, deliberately. It is the stable identifier the seed's augmentation
-- map keys on and the one value in this table that is not a display detail; renaming a
-- branch is an edit, re-slugging one is a different branch wearing its rows.
grant update (
  name, city, country, is_hq, timezone, languages, youtube_channel_id, email,
  lat, lng, service_times, address, lead, leaders, welcome, quote, "order"
) on public.branches to authenticated;

-- The machine-readable schedule moves with the form that edits it: `17` §5's "service times"
-- is both the display strings on `branches` and the rows that drive the reminders, and a
-- dashboard that could write one but not the other would let the two disagree about when
-- church is. DELETE is granted here where it is granted almost nowhere else in this schema,
-- because a service that has stopped running has no soft-deleted meaning: the row IS the
-- claim that it happens.
grant insert, update, delete on public.branch_services to authenticated;

-- `aal2` in a policy is safe HERE and was ruled out on content tables, and the difference is
-- who writes: no mobile member ever writes either of these tables, so the claim check costs
-- nobody anything. Same reasoning as the sermon-artwork storage policies (20260815140000).
-- Authority is read from the LIVE table, never from the `user_role` claim (ADR 0015).
create policy "admins add a branch"
  on public.branches for insert
  to authenticated
  with check (
    public.caller_is_admin_live()
    and public.jwt_claim('aal') = 'aal2'
  );

create policy "admins edit a branch"
  on public.branches for update
  to authenticated
  using (
    public.caller_is_admin_live()
    and public.jwt_claim('aal') = 'aal2'
  )
  with check (
    public.caller_is_admin_live()
    and public.jwt_claim('aal') = 'aal2'
  );

-- Deliberately no DELETE policy on `branches`, and no DELETE grant: branches are archived,
-- never hard-deleted, because attendance, content and audit rows reference them (`02`). The
-- absence is the enforcement.

create policy "admins keep the service schedule"
  on public.branch_services for all
  to authenticated
  using (
    public.caller_is_admin_live()
    and public.jwt_claim('aal') = 'aal2'
  )
  with check (
    public.caller_is_admin_live()
    and public.jwt_claim('aal') = 'aal2'
  );

-- ===========================================================================
-- 4. Closing one
-- ===========================================================================
/**
 * Archive a branch: the act `17` §5 describes, with its block and its consequences.
 *
 * THE BLOCK IS THE LEADERS, and it is not a courtesy. `can_moderate_branch()` reads
 * `profiles.branch_id`, so a leader still pointing at an archived branch would be a leader
 * whose authority names something that no longer exists, and the escalation that hands the
 * branch's residual queue to every admin keys off exactly that emptiness
 * (`moderation_alert_batch`, 20260806130000). Reassigning or demoting them first is what
 * makes the escalation true rather than a second mechanism.
 *
 * THE CONSEQUENCES ARE WRITTEN HERE and derived nowhere else, because each one is a state
 * change that other machinery already knows how to notice:
 *   * the diary is CANCELLED through the ordinary status change, so `event-notices` tells
 *     every non-cancelled RSVP holder in their own language, on the settle window that
 *     already exists (decision 2). An event nobody was ever told about announces nothing,
 *     because `event_notice_kind` answers NULL for announced-nothing-now-cancelled: the
 *     honest reading, and it means the settle-window edge resolves itself.
 *   * a broadcast mid-flight is HALTED, and one waiting for an approver is REJECTED with a
 *     note, both through transitions the state machine already allows. Drafts are left
 *     alone: a draft has not gone anywhere, and `create_broadcast_draft` now refuses to
 *     start another.
 *
 * Members are NOT moved here. They choose (decision 3), which is `02`'s rule and the reason
 * the prompt is the one branch change that needs no approval: there is no branch left to
 * stay in and no leader to ask.
 */
create function public.archive_branch(branch uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  subject record;
  remaining_leaders integer;
  still_open integer;
begin
  -- Authority before the second factor, the order `17` §Platform asks for everywhere: an
  -- ordinary member probing this endpoint is told they may not, rather than being walked
  -- into an authenticator app for an act that was never theirs.
  if not public.caller_is_admin_live() then
    raise exception 'only an admin may close a branch'
      using errcode = 'insufficient_privilege';
  end if;

  -- The step-up (decision 1). Read from the access token's own `aal` claim, which the auth
  -- server sets and a client cannot forge. The dashboard's authorize() has already refused
  -- an aal1 session by the time a real request lands here, which is exactly why this is
  -- worth having: the check that never fires is the one that catches the next caller.
  if coalesce(public.jwt_claim('aal'), '') <> 'aal2' then
    raise exception 'closing a branch needs a fresh code from your authenticator'
      using errcode = 'insufficient_privilege';
  end if;

  select b.status, b.is_hq, b.name into subject
    from public.branches b where b.id = branch;

  if not found then
    raise exception 'no such branch' using errcode = 'no_data_found';
  end if;
  if subject.status <> 'active' then
    raise exception 'that branch is already closed' using errcode = 'check_violation';
  end if;

  -- HQ is where everyone is asked to move when a branch closes (`02`: "HQ preselected"), so
  -- closing it would leave the prompt pointing at nothing.
  if subject.is_hq then
    raise exception 'the HQ branch is where members are asked to move when a branch closes, so it cannot itself be closed'
      using errcode = 'check_violation';
  end if;

  -- This clause is honest about its own reach, the way `set_member_role`'s last-admin clause
  -- is: it cannot fire while an HQ branch exists, because the refusal above already keeps one
  -- branch open. It stays as the backstop for a ministry that has somehow unset `is_hq`, and
  -- for the next caller. FOR UPDATE because counting and then acting is a race (two admins
  -- closing the last two branches would both read two and both pass).
  select count(*) into still_open from (
    select 1 from public.branches b where b.status = 'active' for update
  ) locked;
  if still_open <= 1 then
    raise exception 'this is the last open branch' using errcode = 'check_violation';
  end if;

  select count(*) into remaining_leaders
    from public.profiles p
   where p.branch_id = branch
     and p.role = 'leader'
     and p.deleted_at is null;

  if remaining_leaders > 0 then
    raise exception
      'reassign or demote this branch''s leaders first (% still lead it)', remaining_leaders
      using errcode = 'check_violation';
  end if;

  update public.branches set status = 'archived' where id = branch;

  -- Its diary. Future only: a past event stays as it was, and `events_update_guard` would
  -- refuse to move it anyway.
  update public.events e
     set status = 'cancelled'
   where e.branch_id = branch
     and e.status = 'scheduled'
     and public.event_start_instant(e.starts_at_local, e.timezone) > now();

  -- Its outbound post, mid-flight and waiting. Both transitions are on the state machine's
  -- whitelist (20260819190000); neither is invented here.
  update public.broadcasts b
     set status = 'halted'
   where b.branch_id = branch and b.status = 'sending';

  update public.broadcasts b
     set status = 'rejected',
         review_note =
           'This branch has been closed, so this broadcast has nobody left to reach.'
   where b.branch_id = branch and b.status = 'pending_approval';
end;
$function$;

comment on function public.archive_branch is
  'Close a branch (docs/spec/17 §5): admin at aal2, blocked while any leader still points at it, never HQ, never the last one open. Cancels its future events (so the RSVP notices go out) and stops its broadcasts. Members are not moved: they choose, which is the one branch change needing no approval (`02`).';

revoke all on function public.archive_branch(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.archive_branch(uuid) to authenticated;

/**
 * And open it again (decision 4).
 *
 * WHAT THIS DELIBERATELY DOES NOT DO: put the events back, or bring the members back. Those
 * two are not symmetric with closing, and pretending otherwise would be worse than leaving
 * them. The cancellations were ANNOUNCED, so reinstating them would announce a second time,
 * and `events_update_guard` refuses a past event anyway. The members who moved did so
 * through an audited assignment they chose; sweeping them back would be the app deciding
 * where somebody belongs, which is the one thing this whole domain refuses to do.
 *
 * So restoring means exactly one thing: the branch is a place again. The confirm screen says
 * so in those words rather than implying an undo.
 */
create function public.restore_branch(branch uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  current_status public.branch_status;
begin
  if not public.caller_is_admin_live() then
    raise exception 'only an admin may open a branch'
      using errcode = 'insufficient_privilege';
  end if;
  if coalesce(public.jwt_claim('aal'), '') <> 'aal2' then
    raise exception 'opening a branch needs a fresh code from your authenticator'
      using errcode = 'insufficient_privilege';
  end if;

  select b.status into current_status
    from public.branches b where b.id = branch;

  if not found then
    raise exception 'no such branch' using errcode = 'no_data_found';
  end if;
  if current_status <> 'archived' then
    raise exception 'that branch is already open' using errcode = 'check_violation';
  end if;

  update public.branches set status = 'active' where id = branch;
end;
$function$;

comment on function public.restore_branch is
  'Re-open an archived branch (docs/spec/17 §5, decided with Ayo 2026-08-20). Admin at aal2. Deliberately does NOT reinstate its cancelled events or return the members who have already moved: both were announced or chosen, and undoing them would be a second announcement or a decision made on somebody''s behalf.';

revoke all on function public.restore_branch(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.restore_branch(uuid) to authenticated;

-- ===========================================================================
-- 5. The member's own way out
-- ===========================================================================
/**
 * "Choose your new home branch."
 *
 * THE ONE BRANCH CHANGE THAT NEEDS NO APPROVAL AND IGNORES THE 90-DAY COOLDOWN (`02`, ADR
 * 0015), and the precondition below is the whole reason it is allowed to be: the member's
 * home branch is ARCHIVED, so there is no branch left to stay in and no leader to ask. Take
 * that condition away and this function is a cooldown bypass and an approval bypass in one,
 * which is why it is checked here, from the live table, rather than assumed by the screen.
 *
 * It is a server-owned ASSIGNMENT and not a request, which is why it writes `profiles`
 * directly rather than inserting into `branch_change_requests`. `profiles_guard` refuses a
 * member writing their own `branch_id` (20260729200000, the security fix: authority derives
 * from that column), so this raises the same `agbc.privileged_profile_write` flag
 * `set_member_role` and `decide_branch_request` raise. The audit row is not written here
 * either: `profiles_audit` sees the column change and writes `branch_changed` with
 * `actor_id = auth.uid()`, which is the member, and that is the honest actor. Nobody assigned
 * this; they chose it out of a list the server narrowed to one branch left standing.
 *
 * Note what the flag does NOT open. It is exempted from the privileged bypass for `role` one
 * clause EARLIER in `profiles_guard` (20260730120000's header says so explicitly), so a
 * caller holding it still cannot write their own role. The blast radius of this function is
 * its own `branch_id`, and only from an archived branch to an open one.
 */
create function public.rehome_from_archived_branch(destination uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor uuid := (select auth.uid());
  home record;
  home_status public.branch_status;
  target_status public.branch_status;
begin
  if actor is null then
    raise exception 'sign in first' using errcode = 'insufficient_privilege';
  end if;

  select p.branch_id, p.onboarded_at, p.deleted_at into home
    from public.profiles p where p.id = actor;

  if not found then
    raise exception 'no such member' using errcode = 'no_data_found';
  end if;
  if home.deleted_at is not null then
    raise exception 'that account is closed' using errcode = 'check_violation';
  end if;
  -- A member still in onboarding picks their branch in AUTH-3, where the lock has not closed
  -- behind them yet, and a half-created principal receives nothing here (the reasoning
  -- `set_member_role` spells out for the other direction).
  if home.onboarded_at is null then
    raise exception 'finish joining first' using errcode = 'check_violation';
  end if;

  select b.status into home_status
    from public.branches b where b.id = home.branch_id;

  if home_status is distinct from 'archived' then
    raise exception 'your branch is open; a move asks its leader first'
      using errcode = 'insufficient_privilege';
  end if;

  select b.status into target_status
    from public.branches b where b.id = destination;

  if not found then
    raise exception 'no such branch' using errcode = 'no_data_found';
  end if;
  if target_status <> 'active' then
    raise exception 'that branch is not accepting members' using errcode = 'check_violation';
  end if;

  perform set_config('agbc.privileged_profile_write', 'on', true);

  update public.profiles p
     set branch_id = destination
   where p.id = actor;

  perform set_config('agbc.privileged_profile_write', 'off', true);

  -- A request they had open is moot, and leaving it would be a second move waiting to
  -- happen: a destination leader approving it next week would move somebody who has already
  -- settled somewhere else. Cancelled rather than deleted, because the request record is the
  -- history of what was asked (20260730190000).
  update public.branch_change_requests r
     set status = 'cancelled'
   where r.profile_id = actor
     and r.status = 'pending';
end;
$function$;

comment on function public.rehome_from_archived_branch is
  'A member whose home branch has been archived picks a new one (docs/spec/02 §branches, `16`). The ONE branch change needing no approval and ignoring the 90-day cooldown, which is why the archived precondition is read from the live table here rather than trusted from the screen. A server-owned assignment: profiles_audit writes the branch_changed row.';

revoke all on function public.rehome_from_archived_branch(uuid)
  from public, anon, authenticated, service_role;
-- `authenticated` only. No job re-homes anybody, and a leaked service key should not be able
-- to move members between branches (the same reasoning that keeps service_role off
-- set_member_role).
grant execute on function public.rehome_from_archived_branch(uuid) to authenticated;

-- ===========================================================================
-- 6. Where an archived branch must stop reaching people
-- ===========================================================================
-- Three edits, each one clause, each marked. The principle Ayo set for this slice is that the
-- branch's own STATE should be the reason a job finds nothing, rather than each job growing
-- a second gate; these are the places where that state was not yet visible.

/**
 * `broadcast_recipients` (20260819190000), with ONE change, marked.
 *
 * THE BRANCH ARM GAINS THE CONDITION AND THE MINISTRY ARM DOES NOT, which is the same split
 * slice 4 made between `event` and `event_change`. `02` withholds the branch TIER from a
 * member whose branch is archived, not everything: the whole family speaking still reaches
 * them, and it has to, because until they re-home it is the only voice that can.
 *
 * This is also what makes a halted fan-out safe to leave halted. Resume it and it finds no
 * one, because the definition it derives from has moved underneath it.
 */
create or replace function public.broadcast_recipients(broadcast uuid)
returns table (profile_id uuid, language text)
language sql
stable
security definer
set search_path = ''
as $function$
  select p.id, p.language
  from public.broadcasts b
  join public.profiles p
    on p.deleted_at is null
    and (b.scope = 'ministry' or p.branch_id = b.branch_id)
  left join public.notification_prefs np on np.profile_id = p.id
  where b.id = broadcast
    -- THE ONLY CHANGE IN THIS MIGRATION: a closed branch has no branch-tier audience.
    and (
      b.scope = 'ministry'
      or exists (
        select 1 from public.branches br
        where br.id = b.branch_id and br.status = 'active'
      )
    )
    and case b.scope
      when 'ministry' then coalesce(np.ministry_announcements, true)
      when 'branch' then coalesce(np.branch_updates, true)
    end;
$function$;

comment on function public.broadcast_recipients is
  'The audience for a broadcast: prefs applied, blocks deliberately not (docs/spec/15; a broadcast is not activity between two members), and a branch-scoped one reaches nobody once its branch is archived while a ministry one still reaches those members (`02`: the branch TIER stops, not everything). The fan-out''s source and, through broadcast_recipient_count(), the confirmation screen''s number.';

/**
 * `create_broadcast_draft` (20260819210000), with ONE change, marked.
 *
 * Without it the composer would happily start a message to a branch that has closed, and the
 * first thing telling anybody would be a recipient count of zero on the confirmation screen,
 * which reads as a broken counter rather than as an answer (the lesson slice 4's browser pass
 * paid for). Refused at the top of the flow, where the reason can be a sentence.
 *
 * Only an admin can reach this case at all: a leader gets their own branch whatever they ask
 * for, and an archived branch has no leaders left.
 */
create or replace function public.create_broadcast_draft(
  scope public.broadcast_scope,
  branch_id uuid default null,
  title text default '',
  body text default '',
  body_de text default null,
  body_nl text default null,
  body_fr text default null,
  link text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor uuid := (select auth.uid());
  is_admin boolean := public.caller_is_admin_live();
  actor_branch uuid;
  actor_role public.profile_role;
  target_branch uuid;
  new_id uuid;
begin
  select p.branch_id, p.role into actor_branch, actor_role
  from public.profiles p where p.id = actor and p.deleted_at is null;

  if actor_role not in ('leader', 'admin') then
    raise exception 'only staff may write a broadcast'
      using errcode = 'insufficient_privilege';
  end if;

  if scope = 'ministry' then
    if not is_admin then
      raise exception 'only an admin may write to the whole ministry'
        using errcode = 'insufficient_privilege';
    end if;
    target_branch := null;
  else
    -- An admin may write for any branch; a leader gets their own, whatever they asked for.
    target_branch := case when is_admin then coalesce(branch_id, actor_branch)
                          else actor_branch end;
    if target_branch is null then
      raise exception 'a branch broadcast needs a branch'
        using errcode = 'check_violation';
    end if;

    -- THE ONLY CHANGE IN THIS MIGRATION.
    if not exists (
      select 1 from public.branches b
      where b.id = target_branch and b.status = 'active'
    ) then
      raise exception 'that branch has been closed, so a message to it would reach nobody'
        using errcode = 'check_violation';
    end if;
  end if;

  insert into public.broadcasts
    (author_id, scope, branch_id, title, body, body_de, body_nl, body_fr, link)
  values
    (actor, scope, target_branch, title, body, body_de, body_nl, body_fr, link)
  returning id into new_id;

  return new_id;
end;
$function$;

/**
 * `approve_broadcast` (20260819190000), with ONE change, marked.
 *
 * A draft written before the branch closed can still be sitting in the queue. Archiving
 * rejects the ones that were already waiting, but a draft submitted afterwards would arrive
 * here fresh, and "released to nobody, recorded as sent" is exactly the silent outcome this
 * repo refuses.
 */
create or replace function public.approve_broadcast(broadcast uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  row_author uuid;
  row_status public.broadcast_status;
  row_branch uuid;
  actor uuid := (select auth.uid());
begin
  select b.author_id, b.status, b.branch_id into row_author, row_status, row_branch
  from public.broadcasts b where b.id = broadcast;

  if row_author is null then
    raise exception 'no such broadcast' using errcode = 'no_data_found';
  end if;
  if not public.caller_is_admin_live() then
    raise exception 'only an admin may approve a broadcast'
      using errcode = 'insufficient_privilege';
  end if;
  if row_author = actor then
    raise exception 'a broadcast cannot be approved by its author'
      using errcode = 'insufficient_privilege';
  end if;
  if row_status <> 'pending_approval' then
    raise exception 'only a broadcast awaiting approval can be approved'
      using errcode = 'check_violation';
  end if;

  -- THE ONLY CHANGE IN THIS MIGRATION.
  if row_branch is not null and not exists (
    select 1 from public.branches b
    where b.id = row_branch and b.status = 'active'
  ) then
    raise exception 'that branch has been closed, so this broadcast would reach nobody'
      using errcode = 'check_violation';
  end if;

  update public.broadcasts
    set status = 'sending',
        approved_by = actor,
        -- Recomputed at the moment of release rather than trusted from submission: people
        -- join a branch and change their prefs while a draft waits.
        recipient_count = public.broadcast_recipient_count(broadcast)
    where id = broadcast;
end;
$function$;

/**
 * `events_insert_guard` (20260820120000), with ONE change, marked.
 *
 * A NEW event cannot be posted to a closed branch, and refusing it here is what makes the
 * notice machinery need no gate of its own. `event_notice_recipients`' posting arm is
 * deliberately left alone: if no event can be created for an archived branch, the arm has
 * nothing to filter, and gating it as well would be two owners of one fact.
 *
 * A trusted caller is exempt, like everywhere else in this schema, so a dump restore and a
 * pgTAP fixture can both hold an archived branch's history.
 */
create or replace function public.events_insert_guard()
returns trigger
language plpgsql
as $function$
begin
  -- THE ONLY CHANGE IN THIS MIGRATION.
  if new.branch_id is not null and (select auth.uid()) is not null then
    if not exists (
      select 1 from public.branches b
      where b.id = new.branch_id and b.status = 'active'
    ) then
      raise exception 'that branch has been closed, so nothing new can be put on its diary'
        using errcode = 'check_violation';
    end if;
  end if;

  -- Default the zone from the branch; ministry-wide events default to HQ's
  -- zone (docs/spec/02: "defaults to the branch's timezone").
  if new.timezone is null or new.timezone = '' then
    if new.branch_id is not null then
      select b.timezone into new.timezone
      from public.branches b
      where b.id = new.branch_id;
    else
      select b.timezone into new.timezone
      from public.branches b
      where b.is_hq
      order by b."order"
      limit 1;
    end if;
  end if;

  new.announced_status := null;
  new.announced_starts_at_local := null;
  new.announced_location := null;
  new.notice_revision := 1;
  return new;
end;
$function$;

commit;
