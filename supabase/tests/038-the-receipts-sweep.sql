-- W3.3 slice 3: the receipts sweep's own SQL (20260816140000).
--
-- The TypeScript half is covered by deno tests, which is where the judgement lives
-- (which errors prune a device, when the alarm fires). What is asserted here is the
-- part TypeScript cannot: that the two functions are reachable by exactly the service
-- role, that stamping is idempotent, and that the rate function refuses to turn silence
-- into a 100% failure.
--
-- TRAP (see 019): never CALL a function the current role lacks EXECUTE on; the backend
-- segfaults. The ACL assertions below read the catalogue and never probe by invoking.
--
-- TRAP (see 041/042/044, and section 5 below): these functions read LIVE STATE, and the
-- dev seed now carries broadcast rows of its own. Every count over both ledgers is scoped
-- to this file's own fixtures.
--
-- Section 5 was added on 2026-08-20, when the sweep finally read the second ledger `21` §5
-- always said it read.
begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

insert into auth.users (id, email) values
  ('98000000-0000-4000-8000-00000000000a', 'sweep-a@test.local');
insert into public.profiles (id, email, display_name, branch_id) values
  ('98000000-0000-4000-8000-00000000000a', 'sweep-a@test.local', 'Sweep A',
   '00000000-0000-4000-8000-000000000001');
insert into public.devices (id, profile_id, expo_push_token, platform) values
  ('98000000-0000-4000-8000-0000000000d1',
   '98000000-0000-4000-8000-00000000000a', 'ExponentPushToken[sweep-1]', 'android'),
  ('98000000-0000-4000-8000-0000000000d2',
   '98000000-0000-4000-8000-00000000000a', 'ExponentPushToken[sweep-2]', 'android');

-- ===========================================================================
-- 1. Shape.
-- ===========================================================================

select has_column('public', 'push_tickets', 'error',
  'push_tickets records the receipt outcome (21 §5 needs a rate over a DAY)');
select col_is_null('public', 'push_tickets', 'error',
  'null is "delivered", so an unanswered ticket is not mistaken for a failure');
select has_index('public', 'push_tickets', 'push_tickets_sent_at_idx',
  'the day-window query has its index');

select is(
  (select count(*)::int from cron.job where jobname = 'push-receipts'),
  1,
  'the sweep is scheduled exactly once (cron.schedule upserts by name)');

select is(
  (select command from cron.job where jobname = 'push-receipts'),
  'select jobs.invoke_edge_function(''push-receipts'')',
  'and it goes through the vault-reading invoker, not a hardcoded URL (ADR 0016)');

-- ===========================================================================
-- 2. Stamping is idempotent and scoped.
-- ===========================================================================

-- Clear the table first, inside this transaction and rolled back with it. `push_error_rate`
-- is a rate over EVERY ticket in the window, so section 3's ratio depends on nothing else
-- having sent today. That was true when this file was written, because nothing in the repo
-- called the sender; W3.4 gave it callers, and the first live run of `service-reminders` on
-- a laptop turned this file red with a real ticket of its own (2026-08-19). A test whose
-- result depends on what the machine did this morning is not a test.
delete from public.push_tickets;

insert into public.push_tickets (ticket_id, device_id, sent_at) values
  ('tk-ok',   '98000000-0000-4000-8000-0000000000d1', now() - interval '20 minutes'),
  ('tk-dead', '98000000-0000-4000-8000-0000000000d2', now() - interval '20 minutes'),
  ('tk-wait', '98000000-0000-4000-8000-0000000000d1', now() - interval '2 minutes');

select is(
  public.mark_push_tickets_processed(
    '[{"ticketId":"tk-ok","error":""},
      {"ticketId":"tk-dead","error":"DeviceNotRegistered"}]'::jsonb),
  2,
  'both answered tickets are stamped in one statement');

select is(
  (select error from public.push_tickets where ticket_id = 'tk-ok'),
  null,
  'an empty error string is stored as NULL, i.e. delivered');
select is(
  (select error from public.push_tickets where ticket_id = 'tk-dead'),
  'DeviceNotRegistered',
  'and a failure keeps Expo''s machine code for the operator');

select isnt(
  (select processed_at from public.push_tickets where ticket_id = 'tk-dead'),
  null,
  'a stamped ticket leaves the sweep''s work queue');
select is(
  (select processed_at from public.push_tickets where ticket_id = 'tk-wait'),
  null,
  'a ticket Expo has not answered stays in the queue for the next tick');

select is(
  public.mark_push_tickets_processed(
    '[{"ticketId":"tk-ok","error":"DeviceNotRegistered"}]'::jsonb),
  0,
  're-running stamps nothing: already-processed rows are untouched');
select is(
  (select error from public.push_tickets where ticket_id = 'tk-ok'),
  null,
  'and a re-run cannot overwrite a recorded outcome');

select is(
  public.mark_push_tickets_processed('[]'::jsonb),
  0,
  'an empty batch is a no-op rather than an error');

-- ===========================================================================
-- 3. The rate, and its refusal to invent one.
-- ===========================================================================

select is(
  (select count(*)::int from public.push_error_rate(24)),
  1,
  'with traffic in the window, the rate function answers');

select is(
  (select errored from public.push_error_rate(24)),
  1::bigint,
  'one of the three tickets errored');

select is(
  (select error_ratio from public.push_error_rate(24)),
  0.3333::numeric,
  'and the ratio is errored over sent, rounded');

-- Nothing sent in the last second: the function must return NO ROW rather than 0/0.
select is(
  (select count(*)::int from public.push_error_rate(0)),
  0,
  'no traffic returns no rows, so silence can never be read as 100% failure');

-- ===========================================================================
-- 4. Who may run them.
-- ===========================================================================

select is(has_function_privilege('authenticated',
  'public.mark_push_tickets_processed(jsonb)', 'execute'), false,
  'a member cannot stamp push tickets');
select is(has_function_privilege('authenticated',
  'public.push_error_rate(integer)', 'execute'), false,
  'a member cannot read the ministry''s push failure rate');

-- ===========================================================================
-- 5. The other ledger (20260820140000).
-- ===========================================================================

select has_column('public', 'broadcast_deliveries', 'processed_at',
  'a broadcast delivery records that its receipt was asked about');

-- A broadcast whose push Expo accepted: exactly the shape the sweep must now find.
insert into auth.users (id, email) values
  ('98000000-0000-4000-8000-00000000000b', 'sweep-author@test.local'),
  ('98000000-0000-4000-8000-00000000000c', 'sweep-approver@test.local');
insert into public.profiles (id, email, display_name, branch_id, role) values
  ('98000000-0000-4000-8000-00000000000b', 'sweep-author@test.local', 'Sweep Author',
   '00000000-0000-4000-8000-000000000001', 'leader'),
  ('98000000-0000-4000-8000-00000000000c', 'sweep-approver@test.local', 'Sweep Approver',
   '00000000-0000-4000-8000-000000000001', 'admin');
-- `approved_by` is not optional on a sent row: the four-eyes CHECK ties the two together
-- (20260819180000), so a fixture that skips it is refused rather than merely unrealistic.
insert into public.broadcasts
  (id, author_id, approved_by, scope, branch_id, title, body, status)
values ('98000000-0000-4000-8000-0000000000b1',
        '98000000-0000-4000-8000-00000000000b',
        '98000000-0000-4000-8000-00000000000c', 'branch',
        '00000000-0000-4000-8000-000000000001', 'Sweep Broadcast', 'Body', 'sent');
insert into public.broadcast_deliveries
  (id, broadcast_id, profile_id, device_id, channel, status, ticket_id)
values
  ('98000000-0000-4000-8000-0000000000c1', '98000000-0000-4000-8000-0000000000b1',
   '98000000-0000-4000-8000-00000000000a', '98000000-0000-4000-8000-0000000000d1',
   'push', 'sent', 'sweep-broadcast-ticket-1'),
  -- An in-app row: never had a ticket and must never be asked about.
  ('98000000-0000-4000-8000-0000000000c2', '98000000-0000-4000-8000-0000000000b1',
   '98000000-0000-4000-8000-00000000000a', null, 'in_app', 'sent', null);

select is(
  (select count(*)::int from public.unprocessed_push_tickets(1000)
   where ticket_id = 'sweep-broadcast-ticket-1' and source = 'broadcast'),
  1,
  'a broadcast ticket appears in the work list, tagged with the ledger it lives in');

select is(
  (select count(*)::int from public.unprocessed_push_tickets(1000)
   where ticket_id is null),
  0,
  'and the in-app row never does: it was never a push and has nothing to answer');

select is(
  (select public.mark_broadcast_receipts(
     '[{"ticketId": "sweep-broadcast-ticket-1", "error": "DeviceNotRegistered"}]'::jsonb)),
  1,
  'a failing receipt is recorded against the delivery row');

select is(
  (select status::text from public.broadcast_deliveries
   where id = '98000000-0000-4000-8000-0000000000c1'),
  'failed',
  'which flips it to failed: a receipt is delivery truth, and the row claimed success');

select is(
  (select count(*)::int from public.unprocessed_push_tickets(1000)
   where ticket_id = 'sweep-broadcast-ticket-1'),
  0,
  'and it leaves the work list, so the next tick does not ask Expo again');

select is(
  (select public.mark_broadcast_receipts(
     '[{"ticketId": "sweep-broadcast-ticket-1", "error": "DeviceNotRegistered"}]'::jsonb)),
  0,
  'stamping twice changes nothing, exactly as it does for the other ledger');

-- The whole point of the change: the alarm can see the biggest sends this project makes.
select cmp_ok(
  (select sent from public.push_error_rate(24)),
  '>=',
  (select count(*)::bigint from public.broadcast_deliveries
   where channel = 'push' and status <> 'pending'
     and created_at > now() - interval '24 hours'),
  'the error rate counts broadcast pushes as well as automated ones');

select is(
  has_function_privilege('service_role',
    'public.unprocessed_push_tickets(integer)', 'execute'),
  true,
  'the sweep may read the work list');
select is(
  has_function_privilege('authenticated',
    'public.mark_broadcast_receipts(jsonb)', 'execute'),
  false,
  'and a member cannot stamp a broadcast delivery as answered');

select * from finish();
rollback;
