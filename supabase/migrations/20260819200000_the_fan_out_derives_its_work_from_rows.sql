-- W3.5 slice 2: the fan-out's half of the database (docs/spec/15, `17` §2, `02`, ADR 0016).
--
-- The edge function renders and sends. Everything about WHO IS LEFT lives here, in rows,
-- because that is what makes a fan-out resumable: a run that dies mid-send leaves the
-- database saying exactly what it still owes, and the next run reads it rather than
-- remembering it.
--
-- THE DELIVERY ROWS ARE THE CURSOR. `broadcast_prepare_deliveries()` materialises one row
-- per recipient (and one per device) the first time a broadcast is processed, and every
-- later call is a no-op through the two partial uniques. After that, "what is left" is
-- literally `status = 'pending'`, so a halt, a crash, a redeploy and an operator re-running
-- the job by hand all resume from the same place, and none of them re-sends to anyone.
--
-- MATERIALISE ALL, SEND IN CHUNKS, and the split is deliberate. `02` says the fan-out is
-- "chunked via broadcast_deliveries rows with cursor resume ... batches of 100 per Expo
-- call", and the chunking it means is the EXPO call limit, not the row writes. Writing a few
-- hundred rows in one statement is nothing; splitting that write into pages would give the
-- job two cursors to keep in step, and the second one exists only to make the first look
-- tidy. So: one write, then pages of 100 sends.
--
-- THE IN-APP ROW IS DELIVERED BY BEING WRITTEN. `15` calls the notification centre "a
-- durable log; every notification also lands here, so a member who has push turned off still
-- sees everything the next time they open the app". There is no send to attempt, so its
-- delivery row is born `sent`. Only push rows start `pending`, which keeps the pending set
-- exactly equal to the work outstanding.
--
-- WHY A SCAN AND NOT A CALL FROM `approve_broadcast()`. The approval could fire pg_net
-- directly, and ADR 0016 already answered why it should not: an outbox or a trigger-fired
-- call is silence when it fails, and this job's failure mode is a message the ministry
-- believes went out. A one-minute scan derives the work from live state, so an approval that
-- raced a deploy, a halted broadcast that was un-halted, and a retry all come out right on
-- the next tick.
--
-- Rollback (roll forward): a compensating migration unschedules the job and drops these
-- functions and the column. Delivery rows already written stay, and stay meaningful.

begin;

set local lock_timeout = '3s';

-- `02`: "`failed` is set when fan-out exhausts 3 retries". A run that cannot deliver leaves
-- the broadcast in `sending` and increments this; the fourth attempt gives up rather than
-- pinning a dead broadcast to the scan forever.
alter table public.broadcasts
  add column attempts integer not null default 0
  constraint broadcasts_attempts_non_negative check (attempts >= 0);

comment on column public.broadcasts.attempts is
  'Fan-out runs started for this broadcast. At 3 the job stops trying and sets status = failed (docs/spec/02); "Retry delivery" resets it.';

/**
 * Which broadcasts the scan owes work to.
 *
 * Deliberately not "and has pending deliveries": a broadcast that has just been approved has
 * no delivery rows at all yet, and one whose rows are all sent still needs the run that
 * moves it to `sent`. `sending` IS the work list, which is the whole point of the status.
 */
create function public.broadcasts_in_flight()
returns table (id uuid, attempts integer)
language sql
stable
security definer
set search_path = ''
as $function$
  select b.id, b.attempts
  from public.broadcasts b
  where b.status = 'sending'
  order by b.sent_at;
$function$;

revoke all on function public.broadcasts_in_flight()
  from public, anon, authenticated, service_role;
grant execute on function public.broadcasts_in_flight() to service_role;

/**
 * Write every row this broadcast owes: one notification per recipient, one in-app delivery,
 * one push delivery per device. Idempotent, and called at the top of every run.
 *
 * The notification is written with a PRE-RENDERED title and body in the recipient's own
 * language (`02`: "manual broadcasts only, pre-rendered per recipient language at fan-out"),
 * which is the opposite of every automated notification, where a template key is stored and
 * rendered late. The reason is that a broadcast's words are a human's, typed once per
 * locale, and there is no template to name them.
 *
 * `on conflict do nothing` against `notifications_broadcast_once` (ADR 0022) is what makes a
 * re-run free. Note it is the same guarantee from the other side: the automated jobs dedupe
 * on `dedupe_key`, the fan-out on `(profile_id, broadcast_id)`, and both indexes are global
 * rather than per-partition precisely so a run crossing midnight cannot double-write.
 *
 * Returns how many recipients it prepared, which is a number worth logging: it should equal
 * `recipient_count` on the row, and a difference means the audience changed between approval
 * and delivery (someone joined the branch, someone turned the category off).
 */
create function public.broadcast_prepare_deliveries(broadcast uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  prepared integer;
begin
  -- The notification row first: it is the durable half, and the delivery rows are
  -- bookkeeping about pushing it.
  insert into public.notifications
    (profile_id, type, title, body, broadcast_id, deep_link)
  select
    r.profile_id,
    case b.scope when 'ministry' then 'ministry' else 'branch' end,
    b.title,
    case r.language
      when 'de' then coalesce(b.body_de, b.body)
      when 'nl' then coalesce(b.body_nl, b.body)
      when 'fr' then coalesce(b.body_fr, b.body)
      else b.body
    end,
    b.id,
    -- An https link cannot be a deep link: `notifications.deep_link` must be a path
    -- (20260816120000's CHECK) and the app resolves it against an allowlist. A broadcast
    -- whose link points at the website therefore opens the notification centre, where the
    -- body carries the address, which is `15`'s own "Broadcast -> in-app content or NC
    -- detail" rather than a compromise.
    coalesce(nullif(b.link, ''), '/notifications')
  from public.broadcasts b
  cross join lateral public.broadcast_recipients(b.id) r
  where b.id = broadcast
  -- The index is PARTIAL (`where broadcast_id is not null`), so the inference has to
  -- carry the same predicate or Postgres cannot match it to a constraint.
  on conflict (profile_id, broadcast_id) where broadcast_id is not null do nothing;

  -- One in-app row per recipient, born `sent`: writing it IS the delivery.
  insert into public.broadcast_deliveries (broadcast_id, profile_id, channel, status)
  select broadcast, r.profile_id,
         'in_app'::public.delivery_channel, 'sent'::public.delivery_status
  from public.broadcast_recipients(broadcast) r
  on conflict do nothing;

  get diagnostics prepared = row_count;

  -- And one push row per device those recipients have registered.
  insert into public.broadcast_deliveries
    (broadcast_id, profile_id, device_id, channel, status)
  select broadcast, r.profile_id, d.id,
         'push'::public.delivery_channel, 'pending'::public.delivery_status
  from public.broadcast_recipients(broadcast) r
  join public.devices d on d.profile_id = r.profile_id
  on conflict do nothing;

  return prepared;
end;
$function$;

revoke all on function public.broadcast_prepare_deliveries(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.broadcast_prepare_deliveries(uuid) to service_role;

/**
 * The next page of pushes to attempt, with everything needed to send them.
 *
 * Reads the notification row rather than re-deriving the words, so what is pushed and what
 * the notification centre shows are the same string by construction rather than by two
 * expressions agreeing.
 */
create function public.broadcast_next_push_chunk(
  broadcast uuid,
  chunk_size integer default 100
)
returns table (
  delivery_id uuid,
  notification_id uuid,
  device_id uuid,
  expo_push_token text,
  type text,
  title text,
  body text,
  deep_link text
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    bd.id,
    n.id,
    bd.device_id,
    d.expo_push_token,
    n.type,
    n.title,
    n.body,
    n.deep_link
  from public.broadcast_deliveries bd
  join public.devices d on d.id = bd.device_id
  join public.notifications n
    on n.broadcast_id = bd.broadcast_id and n.profile_id = bd.profile_id
  where bd.broadcast_id = broadcast
    and bd.channel = 'push'
    and bd.status = 'pending'
  order by bd.created_at
  limit chunk_size;
$function$;

revoke all on function public.broadcast_next_push_chunk(uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.broadcast_next_push_chunk(uuid, integer) to service_role;

/**
 * Stamp a page of deliveries with what Expo said, in one statement.
 *
 * Same shape and the same reason as `mark_push_tickets_processed`: a page of 100 should not
 * be 100 round trips, and a loop that fails halfway would leave rows that were sent but not
 * recorded, which the next run would send again.
 */
create function public.mark_broadcast_deliveries(results jsonb)
returns integer
language sql
volatile
security definer
set search_path = ''
as $function$
  with answered as (
    select
      (r ->> 'deliveryId')::uuid as delivery_id,
      nullif(r ->> 'ticketId', '') as ticket_id,
      nullif(r ->> 'error', '') as error
    from jsonb_array_elements(coalesce(results, '[]'::jsonb)) r
  ),
  stamped as (
    update public.broadcast_deliveries bd
      set status = (case when a.error is null then 'sent' else 'failed' end)
                     ::public.delivery_status,
          ticket_id = a.ticket_id,
          error = a.error
      from answered a
      where bd.id = a.delivery_id and bd.status = 'pending'
      returning 1
  )
  select count(*)::integer from stamped;
$function$;

revoke all on function public.mark_broadcast_deliveries(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.mark_broadcast_deliveries(jsonb) to service_role;

/**
 * Close the broadcast, or give up on it.
 *
 * Called at the end of every run. Nothing pending means `sent`, whatever the individual
 * outcomes were: a delivery that failed is recorded on its own row, and a broadcast is not
 * "failed" because one member's token was stale. `failed` is reserved for the case `02`
 * names, a fan-out that could not finish after three attempts, and it is deliberately a
 * dead end that a human restarts rather than a state the scan keeps retrying forever.
 */
create function public.finish_broadcast(broadcast uuid, max_attempts integer default 3)
returns public.broadcast_status
language plpgsql
security definer
set search_path = ''
as $function$
declare
  still_pending integer;
  tried integer;
  outcome public.broadcast_status;
begin
  select count(*)::integer into still_pending
  from public.broadcast_deliveries
  where broadcast_id = broadcast and status = 'pending';

  select attempts, status into tried, outcome
  from public.broadcasts where id = broadcast;

  -- A halt landed mid-run: leave it alone. Halted is terminal (`02`), and the pending rows
  -- are the record of what was never sent.
  if outcome is distinct from 'sending' then
    return outcome;
  end if;

  if still_pending = 0 then
    update public.broadcasts set status = 'sent' where id = broadcast;
    return 'sent';
  end if;

  if tried >= max_attempts then
    update public.broadcasts set status = 'failed' where id = broadcast;
    return 'failed';
  end if;

  return 'sending';
end;
$function$;

revoke all on function public.finish_broadcast(uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.finish_broadcast(uuid, integer) to service_role;

/** Counts one run against the give-up budget. Called before the work, not after. */
create function public.count_broadcast_attempt(broadcast uuid)
returns integer
language sql
volatile
security definer
set search_path = ''
as $function$
  update public.broadcasts set attempts = attempts + 1
  where id = broadcast
  returning attempts;
$function$;

revoke all on function public.count_broadcast_attempt(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.count_broadcast_attempt(uuid) to service_role;

-- --- the schedule ------------------------------------------------------------------

-- Every minute, which is the shortest tick in this project and the only job that earns it: a
-- leader who has just been approved is watching for the message to land, and every other
-- schedule here is measured against a clock rather than against someone waiting. It costs
-- nothing when idle, because `broadcasts_in_flight()` returns no rows and the run ends.
select cron.schedule(
  'broadcast-fanout',
  '* * * * *',
  $cron$select jobs.invoke_edge_function('broadcast-fanout')$cron$
);

commit;
