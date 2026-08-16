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
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

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

select * from finish();
rollback;
