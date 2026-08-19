-- W3.4 slice 3: the nightly recount and the monthly forgetting (`21` §5, `02`, `20`).
--
-- The two housekeeping jobs of `21` §5's table, and neither sends anything, which makes
-- them the quietest and the easiest to get subtly wrong.
--
-- 1. COUNTER RECONCILIATION. `02` specifies the denormalised counters (`glory_count`,
--    `praying_count`, `prayed_count`) as trigger-maintained with the reaction tables as the
--    source of truth, and names "a nightly reconciliation job recounts and fixes drift",
--    with account-deletion cascades called out as the known drift source. That is precise
--    about the cause: a member's deletion cascades their reactions away, and a cascade
--    fires the row triggers, but a restored backup, a repaired row or a bug in a future
--    write path does not. Recomputing from the reaction tables is total, so it is right
--    whatever went wrong, and it is idempotent by construction because it recomputes rather
--    than adjusting.
--
--    IT WRITES THROUGH THE SAME DOOR THE TRIGGERS USE. `agbc.counter_write` is the
--    transaction-local flag the counter triggers already raise so the content guards step
--    aside (20260720220000), and raising it here does two things: the "counters are
--    maintained by triggers" guard lets the write through, and `updated_at` is deliberately
--    NOT bumped, exactly as a Glory tap does not bump it. A reconcile that touched
--    `updated_at` would invalidate every leader's in-flight review token overnight.
--
--    It also rides the EXISTING broadcast trigger, which is the pleasant part: a corrected
--    count reaches open apps as an ordinary `updated` family event, so a screen showing the
--    wrong number fixes itself rather than waiting for a refetch.
--
-- 2. RETENTION PURGES. `21` §5's monthly row lists eight things; four of their tables exist
--    today and four arrive with W3.5 (`broadcast_deliveries`) and W4.1 (`payhip_events`,
--    `unmatched_purchases`). The four that exist are done here and the rest are named in the
--    function's comment so the next item extends one function rather than inventing a
--    second job.
--
--    OPEN REPORTS ARE KEPT PAST THEIR WINDOW, and this is a deliberate carve-out from `20`'s
--    retention schedule (decided with Ayo 2026-08-19). `20` gives moderation reports 24
--    months as safeguarding evidence and does not say what an OPEN report at 24 months is.
--    It is a process failure rather than stale data, and deleting it would destroy the
--    evidence and the outstanding task in one statement. The job leaves them, counts them,
--    and says so out loud; retention is a maximum for data no longer needed, and an
--    unactioned safeguarding report is still needed.
--
--    ONLY THE NOTIFICATIONS PURGE IS BATCHED, because only it can be big: twelve months of
--    every notification the ministry has ever sent, against a table whose 12-month purge
--    ADR 0022 chose over partitioning. `push_tickets` past 7 days is one week of sends,
--    `devices` past 180 days is a handful of uninstalls, and settled reports past 24 months
--    are counted in tens. Naming the ceiling rather than batching by reflex: if push volume
--    ever makes a monthly tickets purge exceed a few tens of thousands of rows, give it the
--    same loop `purge_old_notifications` has.
--
-- Rollback (roll forward): a compensating migration unschedules both jobs and drops the two
-- functions. Neither has any state of its own.

begin;

set local lock_timeout = '3s';

-- --- 1. the nightly recount ---------------------------------------------------------

/**
 * Recount the denormalised counters from the reaction tables and fix any that drifted.
 *
 * Returns one row per counter family with how many CONTENT ROWS it corrected, so the job
 * can log a number that means something: zero is the healthy answer every night, and a
 * non-zero one is worth reading the account-deletion job for.
 *
 * Only rows that are actually wrong are written (`is distinct from`), which keeps a healthy
 * night to zero updates, zero broadcasts and zero WAL rather than rewriting the whole feed
 * every night to the values it already had.
 */
create function public.reconcile_content_counters()
returns table (metric text, corrected integer)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  glory_fixed integer := 0;
  prayer_fixed integer := 0;
begin
  -- The same flag the counter triggers raise: the content guards read it and step aside,
  -- and updated_at stays where it is (see the header).
  perform set_config('agbc.counter_write', 'on', true);

  with truth as (
    select t.id, count(g.id)::integer as actual
    from public.testimonies t
    left join public.glory_reactions g on g.testimony_id = t.id
    group by t.id
  ),
  fixed as (
    update public.testimonies t
      set glory_count = truth.actual
      from truth
      where truth.id = t.id
        and t.glory_count is distinct from truth.actual
      returning 1
  )
  select count(*)::integer into glory_fixed from fixed;

  with truth as (
    select
      p.id,
      count(*) filter (where pi.state = 'committed')::integer as praying,
      count(*) filter (where pi.state = 'prayed')::integer as prayed
    from public.prayers p
    left join public.prayer_intercessions pi on pi.prayer_id = p.id
    group by p.id
  ),
  fixed as (
    update public.prayers p
      set praying_count = truth.praying,
          prayed_count = truth.prayed
      from truth
      where truth.id = p.id
        and (p.praying_count is distinct from truth.praying
             or p.prayed_count is distinct from truth.prayed)
      returning 1
  )
  select count(*)::integer into prayer_fixed from fixed;

  perform set_config('agbc.counter_write', 'off', true);

  return query
    select 'testimony_glory'::text, glory_fixed
    union all
    select 'prayer_counts'::text, prayer_fixed;
end;
$function$;

revoke all on function public.reconcile_content_counters()
  from public, anon, authenticated, service_role;
grant execute on function public.reconcile_content_counters() to service_role;

comment on function public.reconcile_content_counters is
  'Recomputes glory_count, praying_count and prayed_count from the reaction tables and writes back only what drifted (docs/spec/02, `21` §5). Idempotent by construction; writes through the counter_write flag so updated_at is not bumped and the family broadcast still fires.';

-- --- 2. the monthly forgetting ------------------------------------------------------

/**
 * Delete what we have promised not to keep (`20`'s retention schedule, `21` §5).
 *
 * Returns a row per item: what it is, how many rows went, and how many were deliberately
 * left. Only `reports` ever leaves anything, and only when a report is still open past its
 * window, which is a thing somebody needs to hear about rather than a thing to delete.
 *
 * STILL TO JOIN THIS FUNCTION as their tables land, per `21` §5's row: `broadcast_deliveries`
 * past 30 days (W3.5), `payhip_events` payload redaction plus a 12-month purge, and
 * unclaimed `unmatched_purchases` past 12 months (both W4.1). Extend this; do not add a
 * second retention job.
 *
 * DELIBERATELY NOT HERE, and both are `20`'s decisions rather than omissions: `donations`
 * and `course_registrations` survive account deletion and have no purge at all until the
 * church's accountant confirms the statutory period, and `privileged_actions` is a 7-year
 * governance record whose purge waits until the first rows approach it.
 */
create function public.run_retention_purges()
returns table (item text, removed integer, kept integer)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  gone_notifications integer;
  gone_tickets integer;
  gone_devices integer;
  gone_reports integer;
  open_past_window integer;
begin
  -- Batched inside itself (ADR 0022): the one table here big enough to need it.
  gone_notifications := public.purge_old_notifications();

  -- Expo clears receipts after ~24 hours, so a ticket older than a week is unanswerable
  -- and the sweep will never look at it again (20260816120000).
  delete from public.push_tickets where sent_at < now() - interval '7 days';
  get diagnostics gone_tickets = row_count;

  -- The pruning backstop for tokens the receipts sweep never got to answer for (`21` §5).
  -- Harmless when wrong: the token re-registers on the next app open.
  delete from public.devices where last_seen_at < now() - interval '180 days';
  get diagnostics gone_devices = row_count;

  -- 24 months, SETTLED ONLY. See the header: an open report past its window is a process
  -- failure, and deleting it would destroy the safeguarding evidence and the task together.
  delete from public.reports
    where created_at < now() - interval '24 months'
      and status <> 'open';
  get diagnostics gone_reports = row_count;

  select count(*)::integer into open_past_window
  from public.reports
  where created_at < now() - interval '24 months'
    and status = 'open';

  return query
    select 'notifications'::text, gone_notifications, 0
    union all select 'push_tickets'::text, gone_tickets, 0
    union all select 'devices'::text, gone_devices, 0
    union all select 'reports'::text, gone_reports, open_past_window;
end;
$function$;

revoke all on function public.run_retention_purges()
  from public, anon, authenticated, service_role;
grant execute on function public.run_retention_purges() to service_role;

comment on function public.run_retention_purges is
  'The monthly retention purge (docs/spec/20 schedule, `21` §5): notifications at 12 months, push_tickets at 7 days, devices at 180 days of silence, SETTLED reports at 24 months. An open report past its window is kept and counted rather than deleted. Extend this function as broadcast_deliveries and the Payhip tables land.';

-- --- 3. the schedules ---------------------------------------------------------------

-- Nightly, after the day's traffic and before the YouTube sync's 03:00 slot.
select cron.schedule(
  'counter-reconcile',
  '50 2 * * *',
  $cron$select jobs.invoke_edge_function('counter-reconcile')$cron$
);

-- Monthly, on the 1st, at an hour nothing else uses. Deleting is the one thing here that
-- cannot be undone, so it runs when a person is most likely to be asleep and least likely
-- to be mid-restore.
select cron.schedule(
  'retention-purge',
  '30 4 1 * *',
  $cron$select jobs.invoke_edge_function('retention-purge')$cron$
);

commit;
