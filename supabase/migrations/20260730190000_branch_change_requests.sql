-- Branch change requests (ADR 0015, W2.7 people slice, docs/spec/16 + 17).
--
-- A member proposes a move; the branch being JOINED approves it. The table holds who asked,
-- from where, to where, the status and the timestamps, and NOTHING ELSE. That is the whole
-- design constraint, and it is worth stating before the columns:
--
--   A COLUMN ON A ROW THE SUBJECT CAN READ IS DISCLOSED TO THE SUBJECT.
--
-- RLS is row-level. There is no policy that hides a field, so "the UI does not show it" is
-- not a control. Two columns tried to live here during design and could not: `decision_note`
-- (the source leader gets read access to the row) and `decided_by` (the MEMBER gets read
-- access to their own row, and carefully-worded copy that avoids naming the decider is worth
-- nothing when the id can be read straight off the row through PostgREST). Both live in
-- `privileged_actions`, which is admin-read-only. Every column here is safe for every reader
-- below, which is what makes these policies obviously correct rather than merely tested.
-- If a field is ever needed that is not safe for all four readers, it belongs in the audit
-- log or behind a view, not here with a cleverer policy.
--
-- DEVIATION FROM THE PLAN, deliberate, and the one judgement call in this migration.
-- The plan gives the SOURCE branch's leader read access where `status <> 'pending'`. This
-- migration gives it where `status = 'approved'`, which is narrower. `<> 'pending'` also
-- discloses REJECTED and CANCELLED requests, and those say something quite different from
-- "this person left us": they say "this person tried to leave you and did not". ADR 0015's
-- own reasoning for decision 2 is that a leader must not be able to refuse someone leaving
-- "and it is worst in exactly the situations where a person most needs to move". A member
-- trying to move away from a branch where they are unsafe would, under `<> 'pending'`, have
-- that attempt reported back to the leader of the branch they are trying to leave, as soon
-- as it failed or they thought better of it. That is the same disclosure the no-reason rule
-- in decision 3 exists to prevent, arriving by a different door.
-- Acceptance criterion 14 asks that the source leader "sees a decided move OUT of their
-- branch". A rejected or cancelled request is not a move out, and decision 14's stated
-- purpose is answering "who left us, and when". `approved` satisfies both exactly.
--
-- Rollback (roll forward): a compensating migration drops the table, the enum, the guard and
-- the `request_id` column on `privileged_actions`. Nothing reads it yet; the RPC and both
-- surfaces are later slices.

create type public.branch_request_status as enum (
  'pending',
  'approved',
  'rejected',
  'cancelled'
);

create table public.branch_change_requests (
  -- gen_random_uuid() rather than UUIDv7, consistent with every other table here. PG 17.6
  -- has no native uuidv7() and one table diverging is worse than a consistent convention;
  -- PG18's native function is the moment to migrate every table at once (plan decision 15).
  id uuid primary key default gen_random_uuid(),

  -- Trigger-forced to auth.uid() on insert, never taken from the client.
  profile_id uuid not null references public.profiles (id) on delete cascade,

  -- Trigger-forced to the requester's CURRENT branch. A client-supplied value here would let
  -- someone forge a move out of a branch they were never in, which is how the destination
  -- leader ends up approving something that reads as routine and is not.
  from_branch_id uuid not null references public.branches (id),
  to_branch_id uuid not null references public.branches (id),

  status public.branch_request_status not null default 'pending',

  -- Server-set when the request leaves 'pending'. A timestamp discloses nothing about
  -- identity, so unlike `decided_by` it is safe on a row the member reads.
  decided_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint branch_change_requests_distinct_branches
    check (from_branch_id <> to_branch_id)
);

comment on table public.branch_change_requests is
  'Proposed home-branch moves (ADR 0015). The DESTINATION branch approves. Deliberately holds no decider and no note: both are disclosed to readers of the row, and both live in privileged_actions instead.';
comment on column public.branch_change_requests.from_branch_id is
  'The requester''s branch at the moment they asked, forced by trigger. Never client-supplied.';
comment on column public.branch_change_requests.decided_at is
  'When the request left pending. Safe on a member-readable row precisely because it names nobody.';

-- ONE OPEN REQUEST AT A TIME, as a constraint rather than application logic. A member asking
-- for Emmen while Berlin is still deciding is two leaders acting on the same person.
create unique index branch_change_requests_one_open_idx
  on public.branch_change_requests (profile_id)
  where status = 'pending';

-- Every FK column indexed (`database.md`), each leading with the column its question starts
-- from: the member's own history, the destination queue, the source branch's history.
create index branch_change_requests_profile_idx
  on public.branch_change_requests (profile_id, created_at desc);
create index branch_change_requests_to_branch_idx
  on public.branch_change_requests (to_branch_id, status, created_at);
create index branch_change_requests_from_branch_idx
  on public.branch_change_requests (from_branch_id, status, decided_at desc);

create trigger branch_change_requests_set_updated_at
  before update on public.branch_change_requests
  for each row execute function public.set_updated_at();

alter table public.branch_change_requests enable row level security;
alter table public.branch_change_requests force row level security;

-- Supabase's ALTER DEFAULT PRIVILEGES grants ALL on new public tables to every API role, so
-- "we granted nothing" means "everything was granted for us" (issue #96, `015` test 4, and
-- the function-level twin found in `020`). Start from zero, hand back exactly what is used.
-- No DELETE for anyone: cancelling is an UPDATE to 'cancelled', so a withdrawn request stays
-- in the record rather than vanishing from it.
revoke all on public.branch_change_requests from anon, authenticated, service_role;
grant select, insert, update on public.branch_change_requests to authenticated;

-- --- who can see and do what ------------------------------------------------------------

create policy "members read their own requests"
  on public.branch_change_requests
  for select
  using (profile_id = (select auth.uid()));

-- Onboarded only, matching every other content INSERT policy in this schema. A member still
-- in AUTH-3 has no use for this: profiles_guard lets them change their own branch freely
-- until onboarded_at is set, so a request would be a slower route to something they can just
-- do.
create policy "members ask for their own move"
  on public.branch_change_requests
  for insert
  with check (
    profile_id = (select auth.uid())
    and public.caller_is_onboarded()
  );

-- Cancel, and ONLY cancel. USING picks the rows they may touch (their own, still pending);
-- WITH CHECK pins what the row is allowed to become. The guard trigger holds the columns
-- still, so this pair cannot be widened into "members edit their own request".
create policy "members cancel their own pending request"
  on public.branch_change_requests
  for update
  using (profile_id = (select auth.uid()) and status = 'pending')
  with check (profile_id = (select auth.uid()) and status = 'cancelled');

-- The DESTINATION decides (ADR 0015 decision 2). can_moderate_branch() answers true for
-- admins everywhere, which is the intended fallback approver.
create policy "the destination branch reads its queue"
  on public.branch_change_requests
  for select
  using (public.can_moderate_branch(to_branch_id));

create policy "the destination branch decides"
  on public.branch_change_requests
  for update
  using (public.can_moderate_branch(to_branch_id))
  with check (public.can_moderate_branch(to_branch_id));

-- The SOURCE branch is TOLD, after the fact, and cannot act. Approved only: see the
-- deviation note in this file's header for why not `<> 'pending'`. There is deliberately no
-- matching UPDATE policy; a leader cannot block someone leaving.
create policy "the source branch reads completed moves out"
  on public.branch_change_requests
  for select
  using (
    status = 'approved'
    and public.can_moderate_branch(from_branch_id)
  );

create policy "admins read every request"
  on public.branch_change_requests
  for select
  using (public.caller_is_admin_live());

create policy "admins decide any request"
  on public.branch_change_requests
  for update
  using (public.caller_is_admin_live())
  with check (public.caller_is_admin_live());

-- --- the guard ---------------------------------------------------------------------------

create function public.branch_change_requests_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  requester_branch uuid;
  destination_status public.branch_status;
  last_move timestamptz;
begin
  if tg_op = 'INSERT' then
    -- Server-owned fields. Forced rather than validated, so a client that sends anything at
    -- all for these simply has it overwritten: there is no message to probe and no way to
    -- forge a move out of a branch they were never in.
    if (select auth.uid()) is not null then
      new.profile_id := (select auth.uid());
    end if;
    new.status := 'pending';
    new.decided_at := null;

    select p.branch_id into requester_branch
      from public.profiles p
     where p.id = new.profile_id;

    if not found then
      raise exception 'no such member' using errcode = 'no_data_found';
    end if;
    new.from_branch_id := requester_branch;

    -- The check constraint catches this too, but a named refusal beats a constraint name
    -- surfacing through PostgREST for the commonest mistake there is.
    if new.to_branch_id = requester_branch then
      raise exception 'that is already your home branch'
        using errcode = 'check_violation';
    end if;

    select b.status into destination_status
      from public.branches b
     where b.id = new.to_branch_id;

    if not found then
      raise exception 'no such branch' using errcode = 'no_data_found';
    end if;
    if destination_status <> 'active' then
      raise exception 'that branch is not accepting members'
        using errcode = 'check_violation';
    end if;

    -- THE COOLDOWN IS DERIVED, never stored (plan, "one visible fact, one owner"): it reads
    -- the most recent COMPLETED move. A member who has never moved has no approved row and
    -- therefore no cooldown, and the onboarding choice is not a request, so both fall out
    -- correctly without a branch_changed_at column to keep in step.
    --
    -- A REJECTION STARTS NO COOLDOWN (decision 2), which is why this filters on 'approved'
    -- rather than on decided_at: a leader's mistake stays fixable the same day instead of
    -- costing the member three months.
    select max(r.decided_at) into last_move
      from public.branch_change_requests r
     where r.profile_id = new.profile_id
       and r.status = 'approved';

    if last_move is not null and last_move > now() - interval '90 days' then
      raise exception 'a branch change is available again from %',
        to_char(last_move + interval '90 days', 'YYYY-MM-DD')
        using errcode = 'check_violation';
    end if;

    return new;
  end if;

  -- --- UPDATE ---------------------------------------------------------------------------

  -- Immutable once asked. Who asked, from where, to where and when are the record; a
  -- decision changes the STATUS, never the request.
  if new.profile_id is distinct from old.profile_id
     or new.from_branch_id is distinct from old.from_branch_id
     or new.to_branch_id is distinct from old.to_branch_id
     or new.created_at is distinct from old.created_at then
    raise exception 'a request records what was asked; only its status changes'
      using errcode = 'insufficient_privilege';
  end if;

  -- A decision is final. Without this, a destination leader could walk a rejected request
  -- back to pending and around the one-open-request index, and an approved move could be
  -- silently un-approved after the profile had already been changed.
  if old.status <> 'pending' then
    raise exception 'this request has already been decided'
      using errcode = 'check_violation';
  end if;
  if new.status = 'pending' then
    raise exception 'a decision cannot return a request to pending'
      using errcode = 'check_violation';
  end if;

  -- Server-set, so no caller can post-date or back-date a decision.
  new.decided_at := now();

  return new;
end;
$function$;

comment on function public.branch_change_requests_guard is
  'Forces the server-owned fields on a branch request (requester, source branch, status, decided_at), refuses an archived destination, derives the 90-day cooldown from the last APPROVED move, and makes a decision final (ADR 0015).';

create trigger branch_change_requests_guard
  before insert or update on public.branch_change_requests
  for each row execute function public.branch_change_requests_guard();

-- --- link the audit log back to the request ----------------------------------------------

-- Added here rather than in the audit migration because the FK target has to exist first
-- (noted in the plan's data model). Nullable: most privileged actions have no request behind
-- them, and ON DELETE SET NULL keeps the audit row when a request is ever removed, because
-- an audit row that disappears with the thing it describes is not an audit row.
alter table public.privileged_actions
  add column request_id uuid references public.branch_change_requests (id) on delete set null;

comment on column public.privileged_actions.request_id is
  'The branch request that caused this action, when there was one. An approved request is a branch_changed row carrying its request; a rejection is its own row, because it changes no profile and so fires no trigger (ADR 0015).';

create index privileged_actions_request_idx
  on public.privileged_actions (request_id, occurred_at desc);
