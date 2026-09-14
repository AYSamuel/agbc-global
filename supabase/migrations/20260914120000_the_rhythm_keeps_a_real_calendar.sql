-- The rhythm keeps a real calendar (W4.16 slice 1, docs/spec/10 §Milestones, `02`).
--
-- WHY. Ayo, 2026-09-14: "4 should not be a month if it isn't actually a month." Every name on
-- the week ladder is a length of calendar time ("A month of Sundays", "A season with us", "Half
-- a year", "A year of Sundays"), and `20260808214722` awarded each one at a COUNT of attended
-- weeks (4, 12, 26, 52). They disagree three ways: November 2026 has five Sundays, so the month
-- landed with one still to come; a branch that meets midweek fits four weeks into 17 days; and
-- grace stretched "four Sundays running" over six weeks. The plan
-- (`docs/spec/plans/W4.16-rhythm-real-calendar.md` §3) carries every decision; the rules are:
--
--   A MONTH OF SUNDAYS  every week of one calendar month holds at least one gathering. A week
--                       belongs to the month its SUNDAY falls in, so a month has exactly as many
--                       weeks as it has Sundays (4 or 5). Any gathering covers its week, not
--                       only a Sunday one. Grace does not apply inside the month, and the month
--                       is not tied to the current run: any fully covered month in the member's
--                       history earns it.
--   A SEASON, HALF A    3, 6 and 12 calendar months from the first gathering of the CURRENT
--   YEAR, A YEAR, AND   run, then every further 12 months without end. Earned at the first
--   EVERY YEAR AFTER    gathering ON OR AFTER the anniversary, never before. A run still breaks
--                       after two missed weeks in a row, and grace still carries one.
--
-- THE KIND STRINGS DO NOT CHANGE, AND THEIR NUMBERS ARE NOT COUNTS ANY MORE. `4_week_rhythm`
-- now MEANS a month of Sundays, `12_week_rhythm` a season, `26_week_rhythm` half a year,
-- `52_week_rhythm` a year and `<52n>_week_rhythm` n years. Renaming them would need a data
-- migration AND would re-celebrate every badge already held, because the app keeps each
-- device's list of kinds it has already told (`celebrated.ts`), so a renamed kind reads as new
-- and throws a party for old news. Read them as identifiers. Do not "fix" the numbers.
--
-- NOTHING IS TAKEN AWAY, AND NOTHING IS BACKFILLED. No milestone row is deleted or rewritten,
-- including badges the old rule gave that this one would not (`10`: never taken away). The new
-- rules award on a member's NEXT check-in, which is a true celebration when it comes. Nobody
-- gains a surprise month either: a fully covered month is at least four consecutive weeks,
-- which the old rule had already rewarded.
--
-- THE PROGRESS NUMBERS MOVE TO THE SERVER. Month progress depends on "today" in the browsed
-- branch's timezone, which `rhythm_state`'s own header says the client must never decide, and
-- "next" must skip the rungs a member already holds. So `rhythm_state()` and
-- `record_attendance()` gain four columns and the app's mirror of the ladder goes away (slice 3).
-- ADDITIVE for the builds already installed: PostgREST returns the new columns as extra JSON
-- fields, which builds 22 and 23 ignore, so they keep drawing the old countdown until they
-- update. That is why this is dispatched to production WITH the build that reads them (§5).
--
-- Rollback (roll forward, per the database standard): a compensating migration restores the
-- previous bodies of `recompute_streak` and `attendance_after_insert`, recreates
-- `rhythm_week_rungs`, and recreates `rhythm_state` / `record_attendance` in their old shape
-- (DROP again, since a RETURNS TABLE cannot shrink under CREATE OR REPLACE) with the same
-- revokes and grants. `streaks.run_started_on` can stay: it is a derived cache nothing else
-- reads. Badges awarded under this rule stay too, for the reason above.

begin;

set local lock_timeout = '3s';

-- --- who may call the new helpers: nobody but their owner ------------------------------------------
--
-- Every helper below is pure, and still none of them keeps Supabase's default EXECUTE for anon,
-- authenticated and service_role. Two of them are sized by their arguments (`rhythm_time_ladder`
-- builds a series as long as the years it is given, `rhythm_time_rungs` as long as the span
-- between two dates), and anything a client can EXECUTE is an RPC on the public API, so a
-- default grant would hand every guest a `generate_series` they choose the length of. Nothing
-- needs one: the trigger that awards runs as its owner, and `rhythm_next_milestone`, the one the
-- read path calls as the member, is SECURITY DEFINER so its own calls need no client grant
-- either. It alone is granted, to `authenticated`, and `056` asserts the whole list.

-- --- the calendar a week belongs to -------------------------------------------------------------

/**
 * The month a service date's week belongs to: the first day of the month its SUNDAY falls in.
 *
 * So Wednesday 30 September 2026, in the week that ends on Sunday 4 October, counts toward
 * October. Pure date arithmetic like `rhythm_week`, and cast to TIMESTAMP before truncating on
 * purpose: `date_trunc` on a bare date resolves to the timestamptz overload, which reads the
 * session's TimeZone, and nothing in this domain may depend on a clock setting.
 */
create function public.rhythm_week_month(service_date date)
returns date
language sql
immutable
set search_path = ''
as $function$
  select date_trunc('month', (public.rhythm_week(service_date) + 6)::timestamp)::date;
$function$;

comment on function public.rhythm_week_month is
  'The first day of the month a date''s rhythm week belongs to, which is the month of that week''s Sunday (docs/spec/10, W4.16). A month therefore has exactly as many weeks as it has Sundays.';

revoke all on function public.rhythm_week_month(date)
  from public, anon, authenticated, service_role;

/**
 * The Mondays of the weeks that belong to a month, in order: four or five of them.
 *
 * Any date in the month names the month. The first week is the one ending on the month's first
 * Sunday, the last is the one ending on its last Sunday.
 */
create function public.rhythm_month_weeks(month date)
returns setof date
language sql
immutable
set search_path = ''
as $function$
  with bounds as (
    select
      first_day,
      -- The month's first Sunday: 0 to 6 days after its first day (isodow 7 is Sunday).
      first_day + (7 - extract(isodow from first_day)::integer) % 7 as first_sunday,
      (first_day + interval '1 month')::date - 1 as last_day
    from (select date_trunc('month', month::timestamp)::date as first_day) m
  )
  select b.first_sunday - 6 + 7 * i
  from bounds b
  cross join generate_series(0, (b.last_day - b.first_sunday) / 7) as i
  order by 1;
$function$;

comment on function public.rhythm_month_weeks is
  'The Mondays of the weeks belonging to a month (the weeks whose Sunday falls in it): four or five (docs/spec/10, W4.16).';

revoke all on function public.rhythm_month_weeks(date)
  from public, anon, authenticated, service_role;

-- --- the month -----------------------------------------------------------------------------------

/**
 * Every month in which each of its weeks holds at least one of these dates.
 *
 * Takes the dates as an ARGUMENT rather than reading `attendance`, so every edge of the rule
 * (a five-Sunday month, a week straddling two months, a Sunday and a Wednesday in one week) is
 * a plain call on fixed dates in pgTAP, with no clock and no member (W3.4's lesson). Several
 * dates in one week count once, because the rule is about weeks.
 */
create function public.rhythm_covered_months(service_dates date[])
returns setof date
language sql
immutable
set search_path = ''
as $function$
  select covered.month
  from (
    select public.rhythm_week_month(w.wk) as month, count(*) as weeks
    from (select distinct public.rhythm_week(d) as wk from unnest(service_dates) as d) w
    group by 1
  ) covered
  where covered.weeks = (select count(*) from public.rhythm_month_weeks(covered.month))
  order by covered.month;
$function$;

comment on function public.rhythm_covered_months is
  'Months in which every week holds at least one of the given dates: a month of Sundays (docs/spec/10, W4.16). Several dates in one week count once.';

revoke all on function public.rhythm_covered_months(date[])
  from public, anon, authenticated, service_role;

-- --- the season, the half year, the years ------------------------------------------------------

-- `rhythm_week_rungs` counted attended weeks, which is the rule this migration exists to end.
-- Dropped rather than left beside its replacement: an unused function with a plausible name is
-- the first thing a later session would reach for. Pure, holds no data, and its only caller is
-- the trigger body replaced below.
drop function public.rhythm_week_rungs(integer);

/**
 * The time ladder: each rung's kind number and how many calendar months of a run it takes.
 *
 * ONE place holds these numbers, read by both the award and the "next" answer. The named tiers
 * are a season (12, 3 months), half a year (26, 6) and a year (52, 12); after that it is one rung
 * per year, forever, `52 * n` at `12 * n` months, for n from 2 to `years`. The kind numbers are
 * identifiers kept from the week ladder (see the header), not a count of anything.
 */
create function public.rhythm_time_ladder(years integer)
returns table (rung integer, months integer)
language sql
immutable
set search_path = ''
as $function$
  select l.rung, l.months
  from (
    select named.rung, named.months
    from (values (12, 3), (26, 6), (52, 12)) as named (rung, months)
    union all
    select 52 * n, 12 * n
    from generate_series(2, years) as n
  ) l
  order by l.rung;
$function$;

comment on function public.rhythm_time_ladder is
  'The time rungs (kind number, calendar months): 12 at 3, 26 at 6, 52 at 12, then 52n at 12n months up to the given year, without end (docs/spec/10, W4.16). Kind numbers are identifiers, not counts.';

revoke all on function public.rhythm_time_ladder(integer)
  from public, anon, authenticated, service_role;

/**
 * Every time rung a run has reached: those whose anniversary of `run_started_on` falls on or
 * before `latest`, the most recent gathering.
 *
 * ON OR AFTER, NEVER BEFORE (Ayo, 2026-09-14). A run from Sunday 6 September 2026 does not reach
 * its year on Sunday 5 September 2027, one day short, and does on the 12th. The Sunday nearest
 * the anniversary would sometimes celebrate a year before a year has passed, which is the
 * untruth this item removes.
 *
 * Calendar arithmetic is Postgres's, which clamps a month end: a run from 31 August reaches its
 * season on 30 November. Arguments rather than a lookup, for the same reason as the month.
 */
create function public.rhythm_time_rungs(run_started_on date, latest date)
returns setof integer
language sql
immutable
set search_path = ''
as $function$
  select l.rung
  -- A year is at least 365 days, so no anniversary beyond this many years can have passed.
  -- The WHERE decides exactly; this only bounds the ladder it looks at.
  from public.rhythm_time_ladder(greatest((latest - run_started_on) / 365, 1)) l
  where (run_started_on + make_interval(months => l.months))::date <= latest
  order by l.rung;
$function$;

comment on function public.rhythm_time_rungs is
  'Time rungs reached by a run: each anniversary (3, 6, 12, then every 12 months) of its first gathering falling on or before its latest gathering (docs/spec/10, W4.16).';

revoke all on function public.rhythm_time_rungs(date, date)
  from public, anon, authenticated, service_role;

-- --- the streak remembers where its run began ------------------------------------------------------

alter table public.streaks add column run_started_on date;

comment on column public.streaks.run_started_on is
  'The first service date of the run the last attendance belongs to, grace-bridged; what a season, half a year and a year are measured from (docs/spec/10, W4.16). A derived cache written by recompute_streak beside current_weeks, and like it not proof the run is still live: rhythm_state decides that. Readable by its owner through the table''s existing SELECT grant, deliberately: it is their own date and says nothing about anyone else.';

comment on column public.milestones.kind is
  'An identifier, not a count. <n>_gatherings is the nth gathering. The week-rhythm kinds kept their names when W4.16 moved them onto the calendar: 4_week_rhythm is a month of Sundays, 12_week_rhythm a season, 26_week_rhythm half a year, 52_week_rhythm a year, <52n>_week_rhythm n years. Renaming them would re-celebrate every badge already held.';

/**
 * Recompute one member's streak from scratch.
 *
 * Reproduced from `20260807120000` with one addition: the run's first service date, beside the
 * weeks already counted, so the time rungs have an anniversary to count from. `create or
 * replace` keeps the ownership and the revokes that migration set.
 */
create or replace function public.recompute_streak(target uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  run_weeks integer := 0;
  best_weeks integer := 0;
  last_date date;
  run_start date;
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
    select run_id, count(*)::integer as weeks, min(wk) as first_wk, max(wk) as last_wk
    from grouped
    group by run_id
  )
  select
    (select r.weeks from runs r order by r.last_wk desc limit 1),
    (select max(r.weeks) from runs r),
    (select max(a.service_date) from public.attendance a where a.profile_id = target),
    -- The current run's first DAY, not its first week's Monday: an anniversary is a date, and
    -- a run that began on a Sunday reaches its season on a Sunday. Every date on or after the
    -- run's first Monday belongs to the run, because it is the latest one.
    (select min(a.service_date)
       from public.attendance a
      where a.profile_id = target
        and a.service_date >= (select r.first_wk from runs r order by r.last_wk desc limit 1))
  into run_weeks, best_weeks, last_date, run_start;

  insert into public.streaks
    (profile_id, current_weeks, longest_weeks, last_service_date, run_started_on, updated_at)
  values (target, coalesce(run_weeks, 0), coalesce(best_weeks, 0), last_date, run_start, now())
  on conflict (profile_id) do update
    set current_weeks = excluded.current_weeks,
        -- Monotonic (`02`). A recompute over deleted history must not take somebody's longest
        -- rhythm away from them.
        longest_weeks = greatest(public.streaks.longest_weeks, excluded.longest_weeks),
        last_service_date = excluded.last_service_date,
        run_started_on = excluded.run_started_on,
        updated_at = now();
end;
$function$;

comment on function public.recompute_streak is
  'Rebuilds one member''s streak from their attendance rows, bridging a single missed week (docs/spec/10, decided 2026-08-07), including where the current run began (W4.16). Idempotent and safe to re-run.';

/**
 * Recompute, then celebrate. Both idempotent, so a replayed insert changes nothing twice.
 *
 * Still a sweep, still self-healing: every rung the history supports is offered on every
 * check-in and `award_milestone` absorbs the ones already held, so a late offline replay that
 * completes a month or bridges two runs awards whatever it made true. `first_service` and the
 * gathering ladder are unchanged from `20260808214722`.
 */
create or replace function public.attendance_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  started date;
  latest date;
  gatherings integer;
  rung integer;
begin
  perform public.recompute_streak(new.profile_id);

  select s.run_started_on, s.last_service_date into started, latest
    from public.streaks s where s.profile_id = new.profile_id;
  select count(*) into gatherings
    from public.attendance a where a.profile_id = new.profile_id;

  perform public.award_milestone(new.profile_id, 'first_service');

  -- A month of Sundays: ANY fully covered month, in any run, ever.
  if exists (
    select 1
    from public.rhythm_covered_months(
      array(select a.service_date from public.attendance a where a.profile_id = new.profile_id))
  ) then
    perform public.award_milestone(new.profile_id, '4_week_rhythm');
  end if;

  -- A season, half a year, the years: only what the CURRENT run has reached.
  for rung in select * from public.rhythm_time_rungs(started, latest) loop
    perform public.award_milestone(new.profile_id, rung || '_week_rhythm');
  end loop;

  for rung in select * from public.rhythm_gathering_rungs(coalesce(gatherings, 0)) loop
    perform public.award_milestone(new.profile_id, rung || '_gatherings');
  end loop;

  return null;
end;
$$;

-- --- what comes next, and how far along it is ------------------------------------------------------

/**
 * The next rhythm milestone for a member, and their progress toward it, as of `today`.
 *
 * Every input is an ARGUMENT, so each shape the screens draw is a call on fixed dates in pgTAP;
 * `rhythm_state()` supplies the real ones. `run_started_on` is null when there is no LIVE run
 * (never attended, or lapsed): the next gathering starts a new one, so time is counted from
 * `today`.
 *
 * TWO SHAPES (plan §3.3):
 *
 *   The month, while it is not held. The target is the month this week belongs to, counting
 *   its weeks covered so far. If one of its weeks has ALREADY ENDED with no gathering, that
 *   month can no longer be complete and the target moves to the next one, with nothing covered
 *   yet. `progress_month` names the month either way.
 *
 *   A time rung, once the month is held: the FIRST rung the member does not hold yet, measured
 *   from the current run's start, in whole weeks (rhythm weeks, Monday to Sunday), with done
 *   capped at total. "Next" skips what is held because `unique(profile_id, kind)` never awards
 *   a badge twice, so pointing at one already held is a countdown to nothing: the dead end W2.8
 *   slice 5 removed once already. The held time rungs are always the bottom of the ladder (a
 *   run that reaches a rung reaches every one below it, and the sweep awards them together), so
 *   "first not held" is exactly one rung. A returning member's next rung can be months away;
 *   the gathering ladder, which never resets, keeps celebrating them meanwhile.
 *
 * The month comes first while it is not held, even for somebody holding a season: gathering
 * every other Sunday for a year reaches a season without ever covering a whole month.
 *
 * SECURITY DEFINER although it reads no table, so the helpers it calls need no client grant
 * (see the note at the top). With `search_path` empty and nothing but its arguments to work
 * from, running as its owner reaches nothing a member could not already compute.
 */
create function public.rhythm_next_milestone(
  today date,
  service_dates date[],
  held_kinds text[],
  run_started_on date
)
returns table (
  next_kind text,
  progress_done integer,
  progress_total integer,
  progress_month date
)
language plpgsql
immutable
security definer
set search_path = ''
as $function$
declare
  held text[] := coalesce(held_kinds, '{}');
  this_week date := public.rhythm_week(today);
  this_month date := public.rhythm_week_month(today);
  weeks_ended integer;
  covered_ended integer;
  covered_so_far integer;
  target_rung integer;
  target_months integer;
  counted_from date;
begin
  if today is null then
    return;
  end if;

  if not ('4_week_rhythm' = any (held)) then
    next_kind := '4_week_rhythm';

    select count(*) into weeks_ended
      from public.rhythm_month_weeks(this_month) as w (wk)
     where w.wk < this_week;

    select count(distinct public.rhythm_week(d)) filter (where public.rhythm_week(d) < this_week),
           count(distinct public.rhythm_week(d))
      into covered_ended, covered_so_far
      from unnest(service_dates) as d
     where d <= today
       and public.rhythm_week_month(d) = this_month;

    if covered_ended < weeks_ended then
      progress_month := (this_month + interval '1 month')::date;
      progress_done := 0;
    else
      progress_month := this_month;
      progress_done := covered_so_far;
    end if;

    select count(*) into progress_total from public.rhythm_month_weeks(progress_month);
    return next;
    return;
  end if;

  -- The ladder is read deep enough to hold one rung past every kind the member holds.
  select l.rung, l.months into target_rung, target_months
    from public.rhythm_time_ladder(cardinality(held) + 1) l
   where not ((l.rung || '_week_rhythm') = any (held))
   order by l.rung
   limit 1;

  counted_from := coalesce(run_started_on, today);
  next_kind := target_rung || '_week_rhythm';
  progress_month := null;
  progress_total := (
    public.rhythm_week((counted_from + make_interval(months => target_months))::date)
    - public.rhythm_week(counted_from)
  ) / 7;
  progress_done := least(
    progress_total,
    greatest(0, (this_week - public.rhythm_week(counted_from)) / 7)
  );
  return next;
end;
$function$;

comment on function public.rhythm_next_milestone is
  'The next rhythm milestone and progress toward it as of a given day, from the member''s dates, held kinds and live run start: the month''s covered weeks until a month of Sundays is held, then weeks toward the first time rung not yet held (docs/spec/10, W4.16). Pure; rhythm_state supplies the inputs.';

-- `rhythm_state` is SECURITY INVOKER, so the member it answers for is who calls this.
revoke all on function public.rhythm_next_milestone(date, date[], text[], date)
  from public, anon, authenticated, service_role;
grant execute on function public.rhythm_next_milestone(date, date[], text[], date) to authenticated;

-- --- the read path, reshaped --------------------------------------------------------------------------
--
-- DROP and recreate: a RETURNS TABLE cannot gain columns under CREATE OR REPLACE. Callers of
-- `rhythm_state` go first so nothing is left pointing at a dropped function mid-migration, and
-- both get back exactly the ACL `20260807120000` gave them: EXECUTE for `authenticated` alone.
-- A new function starts with Supabase's default EXECUTE for anon and service_role, so the
-- revoke is load-bearing, and `056` asserts it.

drop function public.record_attendance(uuid, timestamptz);
drop function public.rhythm_state(uuid);

/**
 * Everything Home's streak strip, RHYTHM's Next card and the next-service card need, in one
 * answer.
 *
 * Unchanged from `20260807120000` in every column it already had (read its header for why this
 * is ONE function and why the server owns "today"); the whole-weeks-away sum is now computed
 * once rather than three times. New: what comes next and how far along it is, from
 * `rhythm_next_milestone`, fed from the member's own rows. Still SECURITY INVOKER and still no
 * profile id: every row it reads comes through the caller's own RLS, so reading `milestones`
 * here adds no reach.
 *
 * `state` is the fact; the copy is the app's:
 *   none    no attendance ever recorded
 *   active  attended this week or last: the rhythm is current
 *   grace   exactly one full week missed, and the run is being carried across it
 *   lapsed  two or more full weeks missed; current_weeks reads 0, longest is untouched
 */
create function public.rhythm_state(p_branch_id uuid default null)
returns table (
  today date,
  checked_in boolean,
  state text,
  current_weeks integer,
  longest_weeks integer,
  last_service_date date,
  next_kind text,
  progress_done integer,
  progress_total integer,
  progress_month date
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
    select
      s.current_weeks,
      s.longest_weeks,
      s.last_service_date,
      s.run_started_on,
      -- Whole weeks between the last attended week and this one. 0 is this week, 1 is last
      -- week and the current one is not missed until it ends, 2 is one full week missed.
      (public.rhythm_week((select day from today)) - public.rhythm_week(s.last_service_date)) / 7
        as weeks_away
    from public.streaks s
    join me on me.id = s.profile_id
  ),
  ahead as (
    select n.next_kind, n.progress_done, n.progress_total, n.progress_month
    from public.rhythm_next_milestone(
      (select day from today),
      array(select a.service_date from public.attendance a join me on me.id = a.profile_id),
      array(select m.kind from public.milestones m join me on me.id = m.profile_id),
      -- Only a LIVE run has a start to count from (active or grace). A lapsed run is over, and
      -- the next gathering begins a new one.
      (select s.run_started_on from streak s where s.weeks_away <= 2)
    ) n
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
      when (select weeks_away from streak) <= 1 then 'active'
      when (select weeks_away from streak) = 2 then 'grace'
      else 'lapsed'
    end,
    case
      when (select last_service_date from streak) is null then 0
      when (select weeks_away from streak) > 2 then 0
      else (select current_weeks from streak)
    end,
    coalesce((select longest_weeks from streak), 0),
    (select last_service_date from streak),
    (select next_kind from ahead),
    (select progress_done from ahead),
    (select progress_total from ahead),
    (select progress_month from ahead);
$function$;

revoke all on function public.rhythm_state(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.rhythm_state(uuid) to authenticated;

comment on function public.rhythm_state is
  'The member''s rhythm as of now, for auth.uid() only: today in the browsed branch''s timezone, whether they are already checked in, the live streak, and the next rhythm milestone with progress toward it (docs/spec/10, W4.16). The server owns "today" so the screen and the write cannot disagree.';

/**
 * "I'm here" (`10`), as one call.
 *
 * Unchanged from `20260807120000` except that it carries `rhythm_state`'s new columns, so the
 * tap that completes a month hands back the next milestone in the same answer.
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
  last_service_date date,
  next_kind text,
  progress_done integer,
  progress_total integer,
  progress_month date
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
           r.current_weeks, r.longest_weeks, r.last_service_date,
           r.next_kind, r.progress_done, r.progress_total, r.progress_month
    from public.rhythm_state(p_branch_id) r;
end;
$function$;

revoke all on function public.record_attendance(uuid, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.record_attendance(uuid, timestamptz) to authenticated;

comment on function public.record_attendance is
  'Records "I''m here" for the browsed branch and answers with the resulting rhythm, including the next milestone (docs/spec/10, W4.16). Idempotent: a second tap the same day records nothing and says so.';

-- --- the new column, filled ------------------------------------------------------------------------
--
-- Without this, every existing streak reads `run_started_on` null until its member's next tap or
-- Monday's `streak-recompute` pass, and a member mid-run would be told their season counts from
-- today. The weekly pass itself, run once now: idempotent, bounded by the members with any
-- attendance (one church's members, so one statement rather than the standard's batches), and
-- it changes no other column's value. It awards nothing, which is the "no backfill" decision
-- above.
select public.recompute_all_streaks();

commit;
