-- W3.5 slice 2: the fan-out's database half (20260819200000).
--
-- The claim under test is the one the work item's Done criteria name: a halted fan-out
-- resumes EXACTLY ONCE per recipient, proven by delivery rows. So the shape of this file is
-- "do half the work, interrupt it, do it again, and count".
--
-- TRAP (see 019): never CALL a function the current role lacks EXECUTE on; the backend
-- segfaults. The ACL assertions read the catalogue and never probe by invoking.
--
-- TRAP (see 041/042): these functions read LIVE STATE, so every count is scoped to this
-- file's own broadcast rather than to the tables.
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

insert into auth.users (id, email) values
  ('92000000-0000-4000-8000-00000000000a', 'fan-author@test.local'),
  ('92000000-0000-4000-8000-00000000000b', 'fan-admin@test.local'),
  ('92000000-0000-4000-8000-00000000000c', 'fan-de@test.local'),
  ('92000000-0000-4000-8000-00000000000d', 'fan-en@test.local');
insert into public.profiles
  (id, email, display_name, branch_id, role, language, onboarded_at, age_confirmed_at)
values
  ('92000000-0000-4000-8000-00000000000a', 'fan-author@test.local', 'Fan Author',
   '00000000-0000-4000-8000-000000000002', 'leader', 'en', now(), now()),
  ('92000000-0000-4000-8000-00000000000b', 'fan-admin@test.local', 'Fan Admin',
   '00000000-0000-4000-8000-000000000002', 'admin', 'en', now(), now()),
  -- A German reader and an English one in the same branch, so the localized body is visible.
  ('92000000-0000-4000-8000-00000000000c', 'fan-de@test.local', 'Fan DE',
   '00000000-0000-4000-8000-000000000002', 'member', 'de', now(), now()),
  ('92000000-0000-4000-8000-00000000000d', 'fan-en@test.local', 'Fan EN',
   '00000000-0000-4000-8000-000000000002', 'member', 'en', now(), now());

-- Two devices for the German reader, one for the English: the push rows are per DEVICE and
-- the in-app row is per member, which is the pair of shapes the ledger's two uniques hold.
insert into public.devices (id, profile_id, expo_push_token, platform) values
  ('92000000-0000-4000-8000-0000000000e1',
   '92000000-0000-4000-8000-00000000000c', 'ExponentPushToken[fan-de-1]', 'android'),
  ('92000000-0000-4000-8000-0000000000e2',
   '92000000-0000-4000-8000-00000000000c', 'ExponentPushToken[fan-de-2]', 'ios'),
  ('92000000-0000-4000-8000-0000000000e3',
   '92000000-0000-4000-8000-00000000000d', 'ExponentPushToken[fan-en-1]', 'android');

insert into public.broadcasts
  (id, author_id, scope, branch_id, title, body, body_de, status, approved_by, sent_at)
values
  ('92000000-0000-4000-8000-0000000000c1',
   '92000000-0000-4000-8000-00000000000a', 'branch',
   '00000000-0000-4000-8000-000000000002',
   'Night of Worship', 'We gather at seven.', 'Wir treffen uns um sieben.',
   'sending', '92000000-0000-4000-8000-00000000000b', now());

-- ===========================================================================
-- 1. The scan's work list.
-- ===========================================================================

select is(
  (select count(*)::int from public.broadcasts_in_flight()
   where id = '92000000-0000-4000-8000-0000000000c1'),
  1,
  'a broadcast in `sending` is work, before it has a single delivery row');

-- ===========================================================================
-- 2. Preparing: one notification each, in each reader's own language.
-- ===========================================================================

select is(
  public.broadcast_prepare_deliveries('92000000-0000-4000-8000-0000000000c1') >= 4,
  true,
  'every member of the branch is prepared');

select is(
  (select body from public.notifications
   where broadcast_id = '92000000-0000-4000-8000-0000000000c1'
     and profile_id = '92000000-0000-4000-8000-00000000000c'),
  'Wir treffen uns um sieben.',
  'the German reader gets the German body, pre-rendered at fan-out (docs/spec/02)');
select is(
  (select body from public.notifications
   where broadcast_id = '92000000-0000-4000-8000-0000000000c1'
     and profile_id = '92000000-0000-4000-8000-00000000000d'),
  'We gather at seven.',
  'and everyone else falls back to the body as written');
select is(
  (select template_key from public.notifications
   where broadcast_id = '92000000-0000-4000-8000-0000000000c1'
     and profile_id = '92000000-0000-4000-8000-00000000000d'),
  null,
  'a broadcast row carries words, not a template key: nobody typed a template');
select is(
  (select type from public.notifications
   where broadcast_id = '92000000-0000-4000-8000-0000000000c1'
     and profile_id = '92000000-0000-4000-8000-00000000000d'),
  'branch',
  'and its type is the scope, which is what picks the Android channel');

select is(
  (select count(*)::int from public.broadcast_deliveries
   where broadcast_id = '92000000-0000-4000-8000-0000000000c1' and channel = 'in_app'
     and status = 'sent'),
  (select count(*)::int from public.broadcast_recipients(
    '92000000-0000-4000-8000-0000000000c1')),
  'the in-app row is born SENT: writing it is the delivery (docs/spec/15)');

select is(
  (select count(*)::int from public.broadcast_deliveries
   where broadcast_id = '92000000-0000-4000-8000-0000000000c1' and channel = 'push'),
  3,
  'and one push row per DEVICE: two for the member with two, one for the other');

-- ===========================================================================
-- 3. Preparing again changes nothing. This is the whole resume story.
-- ===========================================================================

select lives_ok(
  $$select public.broadcast_prepare_deliveries('92000000-0000-4000-8000-0000000000c1')$$,
  'a second run prepares again without complaint');

select is(
  (select count(*)::int from public.notifications
   where broadcast_id = '92000000-0000-4000-8000-0000000000c1'),
  (select count(*)::int from public.broadcast_recipients(
    '92000000-0000-4000-8000-0000000000c1')),
  'and writes not one extra notification (ADR 0022''s unique index)');
select is(
  (select count(*)::int from public.broadcast_deliveries
   where broadcast_id = '92000000-0000-4000-8000-0000000000c1'),
  (select count(*)::int from public.broadcast_recipients(
     '92000000-0000-4000-8000-0000000000c1')) + 3,
  'nor one extra delivery row');

-- ===========================================================================
-- 4. Pages, and what a page leaves behind.
-- ===========================================================================

select is(
  (select count(*)::int from public.broadcast_next_push_chunk(
    '92000000-0000-4000-8000-0000000000c1', 100)),
  3,
  'the first page offers every pending push');
select is(
  (select count(*)::int from public.broadcast_next_push_chunk(
    '92000000-0000-4000-8000-0000000000c1', 2)),
  2,
  'and honours its page size');

select is(
  (select count(distinct title)::int from public.broadcast_next_push_chunk(
    '92000000-0000-4000-8000-0000000000c1', 100)),
  1,
  'every page carries the words from the notification row rather than re-deriving them');

-- Answer two of the three, as a run that died partway would leave things.
select is(
  public.mark_broadcast_deliveries(
    (select jsonb_agg(jsonb_build_object('deliveryId', bd.id, 'ticketId', 'tk-' || bd.id))
     from (select id from public.broadcast_deliveries
           where broadcast_id = '92000000-0000-4000-8000-0000000000c1'
             and channel = 'push' and status = 'pending'
           order by created_at limit 2) bd)),
  2,
  'two of the three are recorded as sent');

select is(
  (select count(*)::int from public.broadcast_next_push_chunk(
    '92000000-0000-4000-8000-0000000000c1', 100)),
  1,
  'THE RESUME: the next page offers only what is still owed, never the two already sent');

select is(
  public.finish_broadcast('92000000-0000-4000-8000-0000000000c1'),
  'sending'::public.broadcast_status,
  'and the broadcast stays open while anything is pending');

-- ===========================================================================
-- 5. A halt lands mid-run.
-- ===========================================================================

update public.broadcasts set status = 'halted'
  where id = '92000000-0000-4000-8000-0000000000c1';

select is(
  public.finish_broadcast('92000000-0000-4000-8000-0000000000c1'),
  'halted'::public.broadcast_status,
  'a halt survives the run that was in flight when it landed');
select is(
  (select count(*)::int from public.broadcast_deliveries
   where broadcast_id = '92000000-0000-4000-8000-0000000000c1' and status = 'pending'),
  1,
  'and what was never sent stays pending, as the record of what the halt stopped');

-- ===========================================================================
-- 6. Finishing, and giving up.
-- ===========================================================================

insert into public.broadcasts
  (id, author_id, scope, branch_id, title, body, status, approved_by, sent_at)
values
  ('92000000-0000-4000-8000-0000000000c2',
   '92000000-0000-4000-8000-00000000000a', 'branch',
   '00000000-0000-4000-8000-000000000002', 'Nobody has a phone', 'Body.',
   'sending', '92000000-0000-4000-8000-00000000000b', now());

-- Its recipients have devices, so give it pending rows and then answer them all.
select public.broadcast_prepare_deliveries('92000000-0000-4000-8000-0000000000c2');
select public.mark_broadcast_deliveries(
  (select jsonb_agg(jsonb_build_object('deliveryId', bd.id, 'ticketId', 'tk2-' || bd.id))
   from public.broadcast_deliveries bd
   where bd.broadcast_id = '92000000-0000-4000-8000-0000000000c2'
     and bd.status = 'pending'));

select is(
  public.finish_broadcast('92000000-0000-4000-8000-0000000000c2'),
  'sent'::public.broadcast_status,
  'nothing pending closes the broadcast');

select is(
  (select count(*)::int from public.broadcasts_in_flight()
   where id = '92000000-0000-4000-8000-0000000000c2'),
  0,
  'and takes it off the scan''s list');

-- A broadcast that cannot be delivered, three attempts in.
insert into public.broadcasts
  (id, author_id, scope, branch_id, title, body, status, approved_by, sent_at)
values
  ('92000000-0000-4000-8000-0000000000c3',
   '92000000-0000-4000-8000-00000000000a', 'branch',
   '00000000-0000-4000-8000-000000000002', 'Doomed', 'Body.',
   'sending', '92000000-0000-4000-8000-00000000000b', now());
select public.broadcast_prepare_deliveries('92000000-0000-4000-8000-0000000000c3');

select is(
  public.count_broadcast_attempt('92000000-0000-4000-8000-0000000000c3'), 1,
  'each run counts against the give-up budget');
select is(
  public.finish_broadcast('92000000-0000-4000-8000-0000000000c3'),
  'sending'::public.broadcast_status,
  'one failed attempt is not giving up');

select public.count_broadcast_attempt('92000000-0000-4000-8000-0000000000c3');
select public.count_broadcast_attempt('92000000-0000-4000-8000-0000000000c3');

select is(
  public.finish_broadcast('92000000-0000-4000-8000-0000000000c3'),
  'failed'::public.broadcast_status,
  'three is (docs/spec/02), and a dead end a human restarts beats a job retrying for ever');

-- ===========================================================================
-- 7. Who may run any of this.
-- ===========================================================================

select is(has_function_privilege('authenticated',
  'public.broadcast_prepare_deliveries(uuid)', 'execute'), false,
  'no client can make the ministry''s notifications appear');
select is(has_function_privilege('authenticated',
  'public.mark_broadcast_deliveries(jsonb)', 'execute'), false,
  'nor mark a delivery as something it was not');
select is(
  (select count(*)::int from cron.job where jobname = 'broadcast-fanout'),
  1,
  'the fan-out is scheduled exactly once');

select * from finish();
rollback;
