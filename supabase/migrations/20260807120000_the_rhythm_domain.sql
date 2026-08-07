-- The rhythm domain: attendance, streaks, milestones (W2.8, docs/spec/10, `02`, `07`).
--
-- "A streak is a gift, not a debt" (`10`). Everything below is shaped by that sentence, and
-- three decisions in particular are worth reading before changing any of it.
--
-- 1. GRACE COVERS ONE MISSED WEEK (decided with Ayo 2026-08-07). `02` said "consecutive ISO
--    weeks" and `10` said a missed week "pauses at prior value ... resumes on next attendance
--    (no reset-to-zero shame)", which are two different rules. The chosen one: a run survives
--    ONE missed week and ends at two. Four weeks, a hard Sunday, then back means five, not
--    one. `02` is corrected in the same PR, because a column comment that says "consecutive"
--    would be a lie the next reader builds on.
--
-- 2. THE TIMEZONE ACTS EXACTLY ONCE, at write time, in the branch attended. After that
--    `service_date` is a DATE and every week calculation is date arithmetic, so no DST rule,
--    no branch timezone edit and no home-branch move can ever re-bucket history. This is why
--    the DST risk `25` warns about lives in the derivation below and nowhere else.
--
-- 3. WHETHER A STREAK IS STILL ALIVE IS A FUNCTION OF TODAY, not of the stored row. A member
--    who stops attending would otherwise keep showing "5 weeks" until some job got round to
--    them. So `streaks` stores the run as computed at the last attendance, and the READ path
--    decides whether it is still live. One visible fact, one owner: the number on the screen
--    comes from `rhythm_state()`, never from the client's own reading of a stale row.

create type public.attendance_source as enum ('here_button', 'live_watch');

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  -- The branch ATTENDED, which is the browsed branch and may differ from home (`07`).
  -- Trust-based by design (`10`: chosen over geofencing and QR codes, for warmth).
  branch_id uuid not null references public.branches (id),
  -- What the device said the moment the member tapped. Kept as the device CLAIMED it, even
  -- when the clamp below refuses to derive from it: the claim is evidence, `service_date` is
  -- the authority.
  client_taken_at timestamptz not null default now(),
  service_date date not null,
  source public.attendance_source not null default 'here_button',
  created_at timestamptz not null default now(),
  -- One row per member per day: a second tap is a no-op, and same-day double services
  -- deliberately collapse into one (`10`).
  constraint attendance_profile_date_unique unique (profile_id, service_date)
);

comment on table public.attendance is
  '"I''m here" and live-watch credit (docs/spec/10). service_date is derived by trigger from client_taken_at in the ATTENDED branch''s timezone, clamped to 72 hours, and is immutable afterwards.';
comment on column public.attendance.client_taken_at is
  'The device''s claim about when the tap happened. Basis for service_date when it is within the past 72 hours and not in the future; otherwise the server''s clock is used and this column keeps the claim.';

create index attendance_profile_date_idx
  on public.attendance (profile_id, service_date desc);
create index attendance_branch_id_idx on public.attendance (branch_id);

create table public.streaks (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  -- Weeks in the run that the last attendance belongs to, grace-bridged. Whether that run is
  -- STILL live is decided at read time (see the header), so this is not what the screen shows
  -- on its own.
  current_weeks integer not null default 0,
  -- Monotonic (`02`): a recompute may raise it and never lowers it.
  longest_weeks integer not null default 0,
  last_service_date date,
  updated_at timestamptz not null default now()
);

comment on table public.streaks is
  'Derived cache of each member''s rhythm (docs/spec/02). Server-owned: written only by the recompute below, never by a client.';

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  achieved_at timestamptz not null default now(),
  -- No double celebrations (`02`): every award is an ON CONFLICT DO NOTHING insert.
  constraint milestones_profile_kind_unique unique (profile_id, kind)
);

comment on table public.milestones is
  'Positive-only achievements (docs/spec/10). Server-owned; kinds are data, so a new one needs no migration.';

-- --- how a week is counted -------------------------------------------------------------------

/**
 * The Monday of a service date's week.
 *
 * `date_trunc('week', ...)` on a DATE is ISO (Monday-anchored) and involves no timezone at
 * all, which is the whole point: by the time a row reaches here the timezone has already been
 * applied once and thrown away.
 */
create function public.rhythm_week(service_date date)
returns date
language sql
immutable
as $function$
  select date_trunc('week', service_date)::date;
$function$;

comment on function public.rhythm_week is
  'The Monday of that date''s ISO week. Pure date arithmetic: no timezone, so no DST case (docs/spec/10).';

/**
 * The day a tap counts for, in the branch attended.
 *
 * Its own function rather than a line inside the trigger, for one reason: this is the ONLY
 * place a timezone is applied in the whole domain, so it is the only place a DST rule can be
 * got wrong, and the trigger cannot be asked about a clock change (the 72-hour clamp puts
 * every historical instant out of its reach). Here the March and October changeovers are
 * ordinary arguments, and `030` asks about them directly.
 */
create function public.attendance_service_date(basis timestamptz, zone text)
returns date
language sql
immutable
as $function$
  select (basis at time zone zone)::date;
$function$;

comment on function public.attendance_service_date is
  'The local calendar day of an instant in a branch''s IANA timezone (docs/spec/02). The timezone acts here and nowhere else: service_date is a DATE afterwards, so no later DST rule or timezone edit can re-bucket history.';

/**
 * Recompute one member's streak from scratch.
 *
 * FULL recompute, never incremental (`02`): a late offline replay lands an OLDER service_date
 * than rows already stored, and an incremental count would miss that the new row bridges two
 * runs into one. Recomputing from immutable rows is also what makes this safe to re-run, which
 * the weekly cron pass depends on.
 *
 * SECURITY DEFINER because it writes `streaks`, which no client may write, and because the
 * trigger that calls it fires as whichever member just tapped.
 */
create function public.recompute_streak(target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  run_weeks integer := 0;
  best_weeks integer := 0;
  last_date date;
begin
  with weeks as (
    select distinct public.rhythm_week(a.service_date) as wk
    from public.attendance a
    where a.profile_id = target
  ),
  marked as (
    select
      wk,
      -- A new run starts when more than one week was missed. 7 days is the next week, 14 is
      -- the week after a single miss (grace covers it), 21 or more is a fresh start.
      case
        when wk - lag(wk) over (order by wk) <= 14 then 0
        else 1
      end as starts_run
    from weeks
  ),
  grouped as (
    select wk, sum(starts_run) over (order by wk) as run_id
    from marked
  ),
  runs as (
    select run_id, count(*)::integer as weeks, max(wk) as last_wk
    from grouped
    group by run_id
  )
  select
    (select r.weeks from runs r order by r.last_wk desc limit 1),
    (select max(r.weeks) from runs r),
    (select max(a.service_date) from public.attendance a where a.profile_id = target)
  into run_weeks, best_weeks, last_date;

  insert into public.streaks (profile_id, current_weeks, longest_weeks, last_service_date, updated_at)
  values (target, coalesce(run_weeks, 0), coalesce(best_weeks, 0), last_date, now())
  on conflict (profile_id) do update
    set current_weeks = excluded.current_weeks,
        -- Monotonic (`02`). A recompute over deleted history must not take somebody's longest
        -- rhythm away from them.
        longest_weeks = greatest(public.streaks.longest_weeks, excluded.longest_weeks),
        last_service_date = excluded.last_service_date,
        updated_at = now();
end;
$function$;

revoke all on function public.recompute_streak(uuid)
  from public, anon, authenticated, service_role;

comment on function public.recompute_streak is
  'Rebuilds one member''s streak from their attendance rows, bridging a single missed week (docs/spec/10, decided 2026-08-07). Idempotent and safe to re-run.';

/**
 * Award a milestone, once and only once.
 *
 * Definer, because `milestones` has no client write path at all: a celebration is something
 * the server decides you earned, not something a client can claim.
 */
create function public.award_milestone(target uuid, milestone_kind text)
returns void
language sql
security definer
set search_path = ''
as $function$
  insert into public.milestones (profile_id, kind)
  values (target, milestone_kind)
  on conflict (profile_id, kind) do nothing;
$function$;

revoke all on function public.award_milestone(uuid, text)
  from public, anon, authenticated, service_role;

comment on function public.award_milestone is
  'Records an achievement once per member (docs/spec/02 unique(profile_id, kind)). Server-owned: no client write path exists.';

-- --- writing attendance -----------------------------------------------------------------------

/**
 * Identity, and the day it counts for.
 *
 * THE CLAMP (`02` invariant): a device clock is not evidence. The claim is used when it falls
 * within the past 72 hours and is not in the future, so a Saturday tap replayed from an
 * offline queue on Monday still records Saturday; anything older or ahead falls back to the
 * server's clock, so fabricating last year's attendance is impossible.
 *
 * No user context means service role, a seed or a job, exactly as `rsvps_insert_guard` reads
 * it: those are already trusted, and they are how history gets seeded and tested at all.
 */
create function public.attendance_insert_guard()
returns trigger
language plpgsql
as $$
declare
  actor uuid := (select auth.uid());
  zone text;
  basis timestamptz;
begin
  if actor is null then
    -- Trusted writer. It may state the day outright; otherwise derive it as usual.
    if new.service_date is not null then
      return new;
    end if;
  else
    new.profile_id := actor;
  end if;

  select b.timezone into zone from public.branches b where b.id = new.branch_id;
  if zone is null then
    -- No such branch: the foreign key raises the real error, and inventing a date here would
    -- only hide it.
    return new;
  end if;

  basis := coalesce(new.client_taken_at, now());
  if basis > now() or basis < now() - interval '72 hours' then
    basis := now();
  end if;

  new.service_date := public.attendance_service_date(basis, zone);
  return new;
end;
$$;

/**
 * Attendance is a fact, not a state: it is never edited, and the row cannot move to another
 * member, branch or day. Deleting one is the account-deletion path's job (`16`), through the
 * cascade, not a client's.
 */
create function public.attendance_update_guard()
returns trigger
language plpgsql
as $$
begin
  raise exception 'attendance rows are immutable'
    using errcode = 'check_violation';
end;
$$;

/** Recompute, then celebrate. Both idempotent, so a replayed insert changes nothing twice. */
create function public.attendance_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  weeks integer;
begin
  perform public.recompute_streak(new.profile_id);

  select s.current_weeks into weeks from public.streaks s where s.profile_id = new.profile_id;

  perform public.award_milestone(new.profile_id, 'first_service');
  if weeks >= 4 then
    perform public.award_milestone(new.profile_id, '4_week_rhythm');
  end if;
  if weeks >= 12 then
    perform public.award_milestone(new.profile_id, '12_week_rhythm');
  end if;

  return null;
end;
$$;

create trigger attendance_guard
  before insert on public.attendance
  for each row execute function public.attendance_insert_guard();

create trigger attendance_immutable
  before update on public.attendance
  for each row execute function public.attendance_update_guard();

create trigger attendance_rhythm
  after insert on public.attendance
  for each row execute function public.attendance_after_insert();

-- --- the content milestones ---------------------------------------------------------------
--
-- Awarded on APPROVAL, not on submission (decided while building, 2026-08-07). A celebration
-- for a post that a moderator then rejects is the opposite of what `10` asks for, and the
-- member has no idea why they were congratulated. `first_testimony` and `first_prayer` are
-- listed in `10`; the plan milestones belong to W4.4 with the plan itself.

create function public.content_milestone_after_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    perform public.award_milestone(
      new.author_id,
      case tg_table_name when 'testimonies' then 'first_testimony' else 'first_prayer' end
    );
  end if;
  return null;
end;
$$;

create trigger testimonies_milestone
  after update on public.testimonies
  for each row execute function public.content_milestone_after_update();

create trigger prayers_milestone
  after update on public.prayers
  for each row execute function public.content_milestone_after_update();

-- --- who may read what ----------------------------------------------------------------------

alter table public.attendance enable row level security;
alter table public.attendance force row level security;
alter table public.streaks enable row level security;
alter table public.streaks force row level security;
alter table public.milestones enable row level security;
alter table public.milestones force row level security;

create policy "members read their own attendance"
  on public.attendance for select
  using (profile_id = (select auth.uid()));

-- The only client write in this whole domain. The guard forces identity and the day; the
-- unique constraint makes the second tap a no-op rather than a second row.
create policy "members record their own attendance"
  on public.attendance for insert
  with check (profile_id = (select auth.uid()) and public.caller_is_onboarded());

create policy "members read their own streak"
  on public.streaks for select
  using (profile_id = (select auth.uid()));

create policy "members read their own milestones"
  on public.milestones for select
  using (profile_id = (select auth.uid()));

-- No UPDATE or DELETE policy anywhere in this domain, and no write policy at all on `streaks`
-- or `milestones`: both are server-owned. Revoked BY NAME as well, because Supabase's bootstrap
-- grants ALL on new tables to anon and authenticated directly, so RLS would be the only thing
-- standing there (issue #96, and the note in 20260729220000).
revoke all on public.attendance from anon, authenticated;
revoke all on public.streaks from anon, authenticated;
revoke all on public.milestones from anon, authenticated;

grant select, insert on public.attendance to authenticated;
grant select on public.streaks to authenticated;
grant select on public.milestones to authenticated;

-- --- the read path the screens draw from -------------------------------------------------------

/**
 * Everything Home's streak strip and the next-service card need, in one answer.
 *
 * Deliberately ONE function rather than "read `streaks`, then work out today, then check for a
 * row": that is three facts from three places, and W2.4 cost four device-only bugs to exactly
 * that shape. In particular the CLIENT must not decide what "today" is here. Its clock can be
 * wrong, and a card that says "not yet checked in" while the server holds a row for today is
 * indistinguishable from a bug in the tap.
 *
 * `state` is the fact; the copy is the app's (`10` is emphatic that a pause is never a scold):
 *   none    no attendance ever recorded
 *   active  attended this week or last: the rhythm is current
 *   grace   exactly one full week missed, and the run is being carried across it
 *   lapsed  two or more full weeks missed; current_weeks reads 0, longest is untouched
 *
 * SECURITY INVOKER, and it never takes a profile id: it answers for `auth.uid()` and nobody
 * else, so there is no foreign id to probe.
 */
create function public.rhythm_state(p_branch_id uuid default null)
returns table (
  today date,
  checked_in boolean,
  state text,
  current_weeks integer,
  longest_weeks integer,
  last_service_date date
)
language sql
stable
as $function$
  with me as (
    select p.id, p.branch_id as home_branch
    from public.profiles p
    where p.id = (select auth.uid())
  ),
  zone as (
    -- The browsed branch decides the day, because that is where the member is standing (`07`).
    -- Home branch is the fallback for a screen that has no branch context.
    select b.timezone
    from public.branches b
    join me on true
    where b.id = coalesce(p_branch_id, me.home_branch)
  ),
  today as (
    select (now() at time zone (select timezone from zone))::date as day
  ),
  streak as (
    select s.current_weeks, s.longest_weeks, s.last_service_date
    from public.streaks s
    join me on me.id = s.profile_id
  )
  select
    (select day from today),
    exists (
      select 1 from public.attendance a
      join me on me.id = a.profile_id
      where a.service_date = (select day from today)
    ),
    case
      when (select last_service_date from streak) is null then 'none'
      -- Whole weeks between the last attended week and this one. 0 is this week, 1 is last
      -- week and the current one is not missed until it ends, 2 is one full week missed.
      when ((select public.rhythm_week((select day from today)) - public.rhythm_week(last_service_date) from streak) / 7) <= 1
        then 'active'
      when ((select public.rhythm_week((select day from today)) - public.rhythm_week(last_service_date) from streak) / 7) = 2
        then 'grace'
      else 'lapsed'
    end,
    case
      when (select last_service_date from streak) is null then 0
      when ((select public.rhythm_week((select day from today)) - public.rhythm_week(last_service_date) from streak) / 7) > 2 then 0
      else (select current_weeks from streak)
    end,
    coalesce((select longest_weeks from streak), 0),
    (select last_service_date from streak);
$function$;

revoke all on function public.rhythm_state(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.rhythm_state(uuid) to authenticated;

comment on function public.rhythm_state is
  'The member''s rhythm as of now, for auth.uid() only: today in the browsed branch''s timezone, whether they are already checked in, and the live streak (docs/spec/10). The server owns "today" so the screen and the write cannot disagree.';

/**
 * "I'm here" (`10`), as one call.
 *
 * Returns the state AFTER the tap plus whether this tap is the one that recorded it, so the
 * toast ("You're already checked in") and the streak strip come from the same answer. The
 * second tap is a no-op by the unique constraint rather than by anything the client remembers.
 *
 * SECURITY INVOKER: the insert goes through the member's own policy and the guard, exactly as a
 * direct insert from the offline queue would, so there is one write path and not two.
 */
create function public.record_attendance(
  p_branch_id uuid,
  p_client_taken_at timestamptz default now()
)
returns table (
  recorded boolean,
  today date,
  checked_in boolean,
  state text,
  current_weeks integer,
  longest_weeks integer,
  last_service_date date
)
language plpgsql
as $function$
declare
  inserted uuid;
begin
  insert into public.attendance (profile_id, branch_id, client_taken_at, source)
  values ((select auth.uid()), p_branch_id, p_client_taken_at, 'here_button')
  on conflict (profile_id, service_date) do nothing
  returning id into inserted;

  return query
    select inserted is not null, r.today, r.checked_in, r.state,
           r.current_weeks, r.longest_weeks, r.last_service_date
    from public.rhythm_state(p_branch_id) r;
end;
$function$;

revoke all on function public.record_attendance(uuid, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.record_attendance(uuid, timestamptz) to authenticated;

comment on function public.record_attendance is
  'Records "I''m here" for the browsed branch and answers with the resulting rhythm (docs/spec/10). Idempotent: a second tap the same day records nothing and says so.';

-- --- the safety net ---------------------------------------------------------------------------

/**
 * Re-run every member's streak.
 *
 * `21` §5 asks for this as a weekly pass behind the on-write trigger. It exists for the cases
 * a trigger cannot see: a restored backup, a repaired row, an attendance row removed by the
 * deletion job. Bounded by the number of members with any attendance at all.
 */
create function public.recompute_all_streaks()
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  touched integer := 0;
  member uuid;
begin
  for member in
    select distinct a.profile_id from public.attendance a
  loop
    perform public.recompute_streak(member);
    touched := touched + 1;
  end loop;
  return touched;
end;
$function$;

revoke all on function public.recompute_all_streaks()
  from public, anon, authenticated, service_role;
grant execute on function public.recompute_all_streaks() to service_role;

comment on function public.recompute_all_streaks is
  'Weekly safety net behind the on-write recompute (docs/spec/21 §5). Idempotent by construction: it recomputes from immutable attendance rows.';

-- Monday morning, after the weekend's services have landed. Same pattern as every other job
-- (ADR 0016): the schedule lives here, the values live in the vault, and the function takes a
-- lease and pings its dead-man check.
select cron.schedule(
  'streak-recompute',
  '40 3 * * 1',
  $cron$select jobs.invoke_edge_function('streak-recompute')$cron$
);
