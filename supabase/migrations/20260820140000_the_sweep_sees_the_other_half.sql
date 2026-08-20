-- W3.5 slice 4 follow-up: the receipts sweep reads BOTH ledgers (docs/spec/15, `21` §5,
-- `02` §broadcast_deliveries).
--
-- `21` §5 has said since W3.3 that the sweep covers "ALL unprocessed tickets (`push_tickets`
-- + `broadcast_deliveries`)". Only the first half was ever built, because when it was built
-- the second table did not exist. W3.5 slice 2 then gave broadcasts their own `ticket_id`
-- column and nothing ever asked Expo what became of those tickets, which cost two things
-- that are easy to miss and expensive to keep:
--
--   * A BROADCAST'S DEAD TOKEN NEVER PRUNED A DEVICE. `DeviceNotRegistered` arrives in a
--     RECEIPT, not at send time, so a member who uninstalled the app kept a registration
--     for ever if the only push they were ever sent was a broadcast. Expo throttles senders
--     who ignore receipts (`15` calls the sweep a launch requirement for exactly this).
--   * THE ERROR-RATE ALARM WAS BLIND TO THE BIGGEST SENDS WE MAKE. `21` §5 alerts above 10%
--     of a day's tickets, and a ministry-wide broadcast is the largest batch this project
--     ever posts. A rate computed from reminders alone would stay green through a broadcast
--     that reached nobody.
--
-- WHY A `processed_at` COLUMN RATHER THAN READING THE STATUS. A delivery row goes
-- `pending` -> `sent` when Expo ACCEPTS the ticket, which is not the same as delivered, and
-- there is no state that means "we have since asked what happened to it". Without a marker
-- an answered row is indistinguishable from an unanswered one and the sweep would re-ask
-- about every broadcast ticket for ever. The column mirrors `push_tickets.processed_at`
-- exactly, which is also what lets one function serve both tables' reads.
--
-- WHAT A FAILING RECEIPT DOES TO A DELIVERY ROW: flips it to `failed` and records Expo's
-- code, which is `15`'s "receipts (delivery truth)" applied to the row that claimed
-- success. `finish_broadcast` counts only `pending`, so a broadcast already closed as
-- `sent` is not reopened by a late receipt; what changes is the per-recipient truth the
-- dashboard shows and the denominator the alarm reads.
--
-- Rollback (roll forward): a compensating migration drops the two new functions, restores
-- the single-table `push_error_rate`, and drops the column. Nothing else moves.

begin;

set local lock_timeout = '3s';

-- --- 1. the marker the other ledger was missing --------------------------------------

alter table public.broadcast_deliveries add column processed_at timestamptz;

comment on column public.broadcast_deliveries.processed_at is
  'When the receipts sweep learned what became of this push (docs/spec/21 §5). NULL means Expo has accepted the ticket and nobody has asked yet; the same meaning push_tickets.processed_at carries, which is what lets one query serve both ledgers.';

-- The sweep's work list, and nothing else reads this shape: push rows that were accepted
-- and never answered, oldest first.
create index broadcast_deliveries_unanswered_idx
  on public.broadcast_deliveries (created_at)
  where channel = 'push' and status = 'sent' and processed_at is null;

-- --- 2. one work list, two sources ----------------------------------------------------

/**
 * Every ticket still waiting on a receipt, whichever ledger it lives in.
 *
 * ONE function rather than two client reads, because the batch cap has to be shared: Expo
 * accepts 1000 ticket ids per request, and two independent reads of 1000 would either
 * exceed that or silently starve one table while the other drained. Ordering by age across
 * both is also what makes the deadline real, since Expo discards receipts after ~24 hours
 * and the oldest ticket is always the one closest to being unanswerable.
 *
 * `source` comes back with each row because the answer is written to a different table, and
 * a caller that had to guess would eventually guess wrong. Its values are the two table
 * names in miniature and are matched by the sweep's own core.
 */
create function public.unprocessed_push_tickets(batch integer default 1000)
returns table (ticket_id text, device_id uuid, source text, sent_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $function$
  select * from (
    select t.ticket_id, t.device_id, 'ticket'::text as source, t.sent_at
    from public.push_tickets t
    where t.processed_at is null

    union all

    -- `created_at` is when the fan-out materialised the row, minutes before the send, and
    -- it is used here rather than `updated_at` for one reason: this very sweep updates the
    -- row, so ordering by `updated_at` would let an answered row jump the queue it is
    -- leaving.
    select bd.ticket_id, bd.device_id, 'broadcast'::text, bd.created_at
    from public.broadcast_deliveries bd
    where bd.channel = 'push'
      and bd.status = 'sent'
      and bd.ticket_id is not null
      and bd.device_id is not null
      and bd.processed_at is null
  ) outstanding
  order by sent_at
  limit batch;
$function$;

revoke all on function public.unprocessed_push_tickets(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.unprocessed_push_tickets(integer) to service_role;

comment on function public.unprocessed_push_tickets is
  'Tickets awaiting a receipt from either ledger, oldest first, capped to one Expo request (docs/spec/21 §5). Expo discards receipts after ~24h, so the age order is a deadline rather than a preference.';

-- --- 3. the answer, written where the ticket lives -------------------------------------

/**
 * Stamp broadcast deliveries with what their receipts said.
 *
 * The mirror of `mark_push_tickets_processed`, one statement for the same reason: a sweep
 * answering hundreds of tickets must not make hundreds of round trips, and a loop that died
 * halfway would leave rows acted on (device pruned) but unmarked, so the next run would act
 * again.
 *
 * `status` moves to `failed` only when the receipt carried an error. A delivered push keeps
 * `sent` and simply gains its `processed_at`, so "we asked" and "it worked" stay separable.
 */
create function public.mark_broadcast_receipts(results jsonb)
returns integer
language sql
volatile
security definer
set search_path = ''
as $function$
  with answered as (
    select
      r ->> 'ticketId' as ticket_id,
      nullif(r ->> 'error', '') as error
    from jsonb_array_elements(coalesce(results, '[]'::jsonb)) r
  ),
  stamped as (
    update public.broadcast_deliveries bd
      set processed_at = now(),
          error = coalesce(a.error, bd.error),
          status = case
            when a.error is not null then 'failed'::public.delivery_status
            else bd.status
          end
      from answered a
      where bd.ticket_id = a.ticket_id
        and bd.channel = 'push'
        and bd.processed_at is null
      returning 1
  )
  select count(*)::integer from stamped;
$function$;

revoke all on function public.mark_broadcast_receipts(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.mark_broadcast_receipts(jsonb) to service_role;

comment on function public.mark_broadcast_receipts is
  'Records receipt outcomes against broadcast deliveries (docs/spec/15 "receipts are delivery truth"). Only touches rows not yet answered, so a re-run is a no-op; an errored receipt flips the row to failed, which is the per-recipient truth the dashboard shows.';

-- --- 4. the alarm can finally see a broadcast ------------------------------------------

/**
 * The day's push health across BOTH ledgers.
 *
 * Same contract as before (no rows when nothing was sent, so silence is never read as total
 * failure) over a bigger denominator. The window is measured on when each push went OUT,
 * which is `sent_at` for a ticket and `created_at` for a delivery row: neither moves when
 * this sweep writes its answer, and a window that shifted under the alarm would make the
 * ratio depend on how recently the sweep ran.
 *
 * A send-time failure on a delivery row (never accepted, so it never had a ticket) counts
 * too, deliberately: from a member's point of view a push that Expo refused outright and a
 * push that a receipt later failed are the same missing notification.
 */
create or replace function public.push_error_rate(window_hours integer default 24)
returns table (sent bigint, errored bigint, error_ratio numeric)
language sql
stable
security definer
set search_path = ''
as $function$
  with pushes as (
    select t.error
    from public.push_tickets t
    where t.sent_at > now() - make_interval(hours => window_hours)

    union all

    select bd.error
    from public.broadcast_deliveries bd
    where bd.channel = 'push'
      and bd.created_at > now() - make_interval(hours => window_hours)
      and bd.status <> 'pending'
  )
  select
    count(*) as sent,
    count(*) filter (where error is not null) as errored,
    round(
      count(*) filter (where error is not null)::numeric / greatest(count(*), 1),
      4
    ) as error_ratio
  from pushes
  having count(*) > 0;
$function$;

comment on function public.push_error_rate is
  'Sent / errored / ratio over the last window_hours across BOTH push ledgers, automated and broadcast (docs/spec/21 §5: alert above 10%). Broadcasts joined it in 20260820140000; before that the alarm was blind to the largest sends this project makes.';

commit;
