-- W3.3 slice 3: what the receipts sweep needs that the tables did not already have
-- (docs/spec/15, `21` §5, ADR 0016).
--
-- Three small things, and one of them corrects `02`.
--
-- 1. `push_tickets.error`. `02` gave this table four columns and `21` §5 asks the sweep to
--    "alert if > 10% of a day's automated tickets error". Those cannot both be true: a
--    rate over a DAY cannot be computed from a single run's memory, so the outcome has to
--    be persisted. The column mirrors `broadcast_deliveries.error`, which `02` already
--    specifies for the fan-out side of the same problem. `02` is corrected in this PR.
--
-- 2. A new `job_alerts` kind. The error-rate alarm is a staff alert like the moderation
--    and verse ones, so it reuses that ledger and its once-per-recipient-per-subject
--    index rather than inventing a second mechanism (ADR 0016's "scheduled work is one
--    pattern"). Subject is the DATE, so the alarm fires at most once a day per admin
--    however many times the sweep runs.
--
-- 3. The schedule itself: every 15 minutes, matching `21` §5 and Expo's own guidance that
--    receipts appear ~15 minutes after a send and are cleared after 24 hours. A sweep
--    slower than that would ask about receipts Expo has already thrown away, which is the
--    quiet way to accumulate dead tokens forever.
--
-- Rollback (roll forward): a compensating migration unschedules the job, drops the column
-- and restores the old CHECK. No data moves.

begin;

set local lock_timeout = '3s';

-- --- 1. The outcome, kept ----------------------------------------------------------

alter table public.push_tickets add column error text;

comment on column public.push_tickets.error is
  'Expo''s machine code from the RECEIPT (DeviceNotRegistered, MessageTooBig, MessageRateExceeded, MismatchSenderId, InvalidCredentials), or null when the push landed. Persisted because the alert in docs/spec/21 §5 is a rate over a DAY, which no single run can know (20260816140000).';

-- The alert's own query: yesterday's tickets, split by whether they errored. Partial on
-- `error is not null` would answer only half the ratio, so this one is not partial.
create index push_tickets_sent_at_idx on public.push_tickets (sent_at);

-- --- 2. The alarm joins the existing ledger ----------------------------------------

alter table public.job_alerts drop constraint job_alerts_kind_known;
alter table public.job_alerts add constraint job_alerts_kind_known check (
  kind in (
    'queue_new', 'queue_overdue', 'report_new', 'report_overdue', 'verse_depth',
    -- W3.3: the day's push error rate crossed its floor. Subject is the date.
    'push_error_rate'
  )
);

/**
 * The day's push health, as one row.
 *
 * A function rather than a query in the job, for the reason `21` §5 gives about the verse
 * monitor: the threshold is a product decision and belongs where it can be tested in
 * pgTAP, not spelled out in TypeScript that only runs when something is already wrong.
 *
 * Returns zero rows when nothing was sent, so "no traffic" can never be mistaken for
 * "100% failure" by a caller doing its own division.
 */
create function public.push_error_rate(window_hours integer default 24)
returns table (sent bigint, errored bigint, error_ratio numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select
    count(*) as sent,
    count(*) filter (where t.error is not null) as errored,
    round(
      count(*) filter (where t.error is not null)::numeric / greatest(count(*), 1),
      4
    ) as error_ratio
  from public.push_tickets t
  where t.sent_at > now() - make_interval(hours => window_hours)
  having count(*) > 0;
$$;

revoke all on function public.push_error_rate(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.push_error_rate(integer) to service_role;

comment on function public.push_error_rate is
  'Sent / errored / ratio over the last window_hours of push tickets (docs/spec/21 §5: alert above 10%). No rows when nothing was sent, so silence is never read as total failure.';

/**
 * Stamp a batch of tickets as answered, each with its own outcome.
 *
 * One statement rather than a loop of updates from the function, for the same reason
 * `record_job_alerts` is one statement: a sweep that answers 400 tickets should not make
 * 400 round trips through PostgREST, and a partial application halfway through a loop
 * would leave tickets that were acted on (device deleted) but not marked, so the next run
 * would act on them again.
 *
 * `error` is null for a delivered push and Expo's machine code otherwise.
 */
create function public.mark_push_tickets_processed(results jsonb)
returns integer
language sql
volatile
security definer
set search_path = ''
as $$
  with answered as (
    select
      r ->> 'ticketId' as ticket_id,
      nullif(r ->> 'error', '') as error
    from jsonb_array_elements(coalesce(results, '[]'::jsonb)) r
  ),
  stamped as (
    update public.push_tickets t
      set processed_at = now(), error = a.error
      from answered a
      where t.ticket_id = a.ticket_id and t.processed_at is null
      returning 1
  )
  select count(*)::integer from stamped;
$$;

revoke all on function public.mark_push_tickets_processed(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.mark_push_tickets_processed(jsonb) to service_role;

comment on function public.mark_push_tickets_processed is
  'Marks answered tickets processed with their receipt outcome, in one statement (docs/spec/21 §5). Only touches rows still unprocessed, so a re-run is a no-op rather than a re-stamp.';

-- --- 3. The schedule ---------------------------------------------------------------

-- Every 15 minutes, offset off the hour so it does not contend with the hourly
-- moderation digest. cron.schedule() upserts by name (see 20260806130000).
select cron.schedule(
  'push-receipts',
  '3,18,33,48 * * * *',
  $cron$select jobs.invoke_edge_function('push-receipts')$cron$
);

commit;
