-- Events domain (docs/spec/02 Events, docs/spec/11): public-read events with
-- member-owned RSVPs. branch_id NULL means ministry-wide; there is deliberately
-- no separate is_global flag to drift. Times are stored as wall-clock local
-- time plus an IANA zone (starts_at_local + timezone) per the backend standard:
-- pre-converted UTC breaks when timezone law changes.
--
-- W1.7 ships the read surface; the RSVP triggers land now so the Phase 2 write
-- path (W2.9) inherits a server-trusted contract instead of adding one later.

create type public.event_status as enum ('scheduled', 'cancelled');
create type public.rsvp_status as enum ('going', 'interested', 'cancelled');

-- ---------------------------------------------------------------------------
-- events
-- ---------------------------------------------------------------------------

create table public.events (
  id uuid primary key default gen_random_uuid(),
  -- NULL = ministry-wide (reaches every branch; fan-out semantics in docs/spec/15).
  branch_id uuid references public.branches (id),
  title text not null,
  description text not null default '',
  -- Wall-clock time in `timezone`, NOT an instant (docs/spec/02): "Sunday 11:00"
  -- must survive a future law change in the branch's zone.
  starts_at_local timestamp not null,
  -- IANA id. A BEFORE trigger fills it from the branch (HQ for ministry-wide)
  -- when the writer leaves it null, so it is non-null from birth.
  timezone text not null,
  ends_at_local timestamp,
  location text not null default '',
  image_url text,
  -- Published events with RSVPs are cancelled, never hard-deleted: old
  -- notification deep links must land on the cancelled treatment, not a 404
  -- (docs/spec/11). No client role holds DELETE.
  status public.event_status not null default 'scheduled',
  rsvp_enabled boolean not null default true,
  -- v1 events are manual dashboard entries; 'sanity' is reserved for a post-v1
  -- website-CMS sync (docs/spec/11).
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_source_known check (source in ('manual', 'sanity')),
  constraint events_ends_after_start
    check (ends_at_local is null or ends_at_local > starts_at_local)
);

comment on table public.events is
  'Branch and ministry-wide gatherings (docs/spec/02, docs/spec/11). branch_id NULL = ministry-wide.';
comment on column public.events.starts_at_local is
  'Wall-clock start in `timezone`, never a pre-converted instant (docs/spec/02).';

-- Branch feeds read newest-window-first inside a branch scope; the FK gets its
-- covering index here (docs/spec/02 conventions).
create index events_branch_feed_idx on public.events (branch_id, starts_at_local);
create index events_starts_at_idx on public.events (starts_at_local);

alter table public.events enable row level security;
alter table public.events force row level security;

-- The event's start as an instant, for "has it started" checks. STABLE, not
-- immutable: `at time zone` reads the tz database.
create function public.event_start_instant(starts_at_local timestamp, tz text)
returns timestamptz
language sql
stable
as $$
  select starts_at_local at time zone tz;
$$;

create function public.events_insert_guard()
returns trigger
language plpgsql
as $$
begin
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
  return new;
end;
$$;

create function public.events_update_guard()
returns trigger
language plpgsql
as $$
begin
  -- Reinstatement only while the start is still in the future: a past event
  -- stays cancelled (docs/spec/11).
  if old.status = 'cancelled' and new.status = 'scheduled'
     and public.event_start_instant(new.starts_at_local, new.timezone) <= now() then
    raise exception 'a past event cannot be reinstated'
      using errcode = 'check_violation';
  end if;

  if new.timezone is null or new.timezone = '' then
    new.timezone := old.timezone;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger events_guard
  before insert on public.events
  for each row execute function public.events_insert_guard();

create trigger events_update_guard
  before update on public.events
  for each row execute function public.events_update_guard();

create policy "events are publicly readable"
  on public.events for select
  using (true);

-- Leaders manage their own branch's events; only admins touch ministry-wide
-- rows (can_moderate_branch(null) is true only for admins). Dashboard CRUD
-- arrives in W3.5; the boundary exists from birth (docs/spec/02 matrix).
create policy "moderators create events in their branch"
  on public.events for insert
  with check (public.can_moderate_branch(branch_id));

create policy "moderators update events in their branch"
  on public.events for update
  using (public.can_moderate_branch(branch_id))
  with check (public.can_moderate_branch(branch_id));

-- ---------------------------------------------------------------------------
-- rsvps
-- ---------------------------------------------------------------------------

create table public.rsvps (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  status public.rsvp_status not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One row per member per event; changing your mind is an UPDATE of status,
  -- so "cancelled" is remembered (the member's list keeps the row, docs/spec/11).
  constraint rsvps_event_profile_unique unique (event_id, profile_id)
);

comment on table public.rsvps is
  'Member RSVP state per event (docs/spec/02). Trigger-guarded: no RSVP into a cancelled or started event.';

-- event_id is covered by the unique constraint's leading column.
create index rsvps_profile_id_idx on public.rsvps (profile_id);

alter table public.rsvps enable row level security;
alter table public.rsvps force row level security;

-- Shared refusal for INSERT and UPDATE: going/interested is only accepted for
-- a scheduled, future, RSVP-enabled event. Cancelling your own RSVP stays
-- allowed whatever the event's state (docs/spec/02): a late offline replay is
-- rejected here and the client reconciles quietly (docs/spec/01 §8).
create function public.assert_event_accepts_rsvps(target_event uuid)
returns void
language plpgsql
stable
as $$
declare
  ev public.events%rowtype;
begin
  select * into ev from public.events e where e.id = target_event;
  if not found then
    -- The FK raises its own error; nothing to assert here.
    return;
  end if;
  if ev.status = 'cancelled' then
    raise exception 'this event was cancelled by the organiser'
      using errcode = 'check_violation';
  end if;
  if public.event_start_instant(ev.starts_at_local, ev.timezone) <= now() then
    raise exception 'this event has already started'
      using errcode = 'check_violation';
  end if;
  if not ev.rsvp_enabled then
    raise exception 'RSVP is closed for this event'
      using errcode = 'check_violation';
  end if;
end;
$$;

create function public.rsvps_insert_guard()
returns trigger
language plpgsql
as $$
declare
  actor uuid := (select auth.uid());
begin
  -- No user context = service role, jobs, seeds, or a direct connection: those
  -- are already trusted; a real member request always has a uid.
  if actor is null then
    return new;
  end if;

  -- RSVP identity cannot be forged (docs/spec/02 invariants).
  new.profile_id := actor;

  if new.status in ('going', 'interested') then
    perform public.assert_event_accepts_rsvps(new.event_id);
  end if;
  return new;
end;
$$;

create function public.rsvps_update_guard()
returns trigger
language plpgsql
as $$
declare
  actor uuid := (select auth.uid());
begin
  if actor is null then
    new.updated_at := now();
    return new;
  end if;

  -- The row's identity is fixed: an UPDATE changes status, never whose RSVP it
  -- is or which event it belongs to.
  if new.profile_id is distinct from old.profile_id
     or new.event_id is distinct from old.event_id then
    raise exception 'an RSVP cannot be moved to another member or event'
      using errcode = 'check_violation';
  end if;

  if new.status in ('going', 'interested') then
    perform public.assert_event_accepts_rsvps(new.event_id);
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger rsvps_guard
  before insert on public.rsvps
  for each row execute function public.rsvps_insert_guard();

create trigger rsvps_update_guard
  before update on public.rsvps
  for each row execute function public.rsvps_update_guard();

create policy "members read their own rsvps"
  on public.rsvps for select
  using (profile_id = (select auth.uid()));

-- Leaders see who is coming to their branch's events; ministry-wide events
-- (branch_id NULL) stay admin-only via can_moderate_branch's admin arm.
create policy "moderators read rsvps for their branch's events"
  on public.rsvps for select
  using (
    exists (
      select 1
      from public.events e
      where e.id = event_id
        and public.can_moderate_branch(e.branch_id)
    )
  );

create policy "members rsvp to events"
  on public.rsvps for insert
  with check (profile_id = (select auth.uid()) and public.caller_is_onboarded());

create policy "members update their own rsvps"
  on public.rsvps for update
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()) and public.caller_is_onboarded());

-- ---------------------------------------------------------------------------
-- Grants: RLS is the row boundary; GRANTs are the table boundary.
-- ---------------------------------------------------------------------------

revoke all on public.events, public.rsvps from anon, authenticated;

grant select on public.events to anon, authenticated;
grant insert, update on public.events to authenticated;
grant select, insert, update on public.rsvps to authenticated;
grant all on public.events, public.rsvps to service_role;
