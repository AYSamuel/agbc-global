-- public.moderation_queue (docs/spec/17 §1, W2.7 slice 2): the branch boundary is the
-- DATABASE's, not the dashboard's. Every assertion here is the probe that `21` §4 asks
-- for, made against the read path itself rather than against a screen that could simply
-- forget to filter.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

-- --- cast -----------------------------------------------------------------------
-- Glasgow and Berlin come from the versioned seed; the people are made here. Emails are
-- namespaced to this file (t016-) because bare ones collide with whatever a developer
-- has created while clicking through the app locally, and the failure then looks like a
-- product bug rather than a fixture clash.

insert into auth.users (id, email) values
  ('30000000-0000-4000-8000-0000000000a1', 't016-glasgow-member@test.local'),
  ('30000000-0000-4000-8000-0000000000a2', 't016-berlin-member@test.local'),
  ('30000000-0000-4000-8000-0000000000b1', 't016-berlin-leader@test.local'),
  ('30000000-0000-4000-8000-0000000000c1', 't016-ministry-admin@test.local');

insert into public.profiles (id, email, display_name, branch_id, role, onboarded_at) values
  ('30000000-0000-4000-8000-0000000000a1', 't016-glasgow-member@test.local', 'Glasgow Member',
   '00000000-0000-4000-8000-000000000001', 'member', now()),
  ('30000000-0000-4000-8000-0000000000a2', 't016-berlin-member@test.local', 'Berlin Member',
   '00000000-0000-4000-8000-000000000002', 'member', now()),
  ('30000000-0000-4000-8000-0000000000b1', 't016-berlin-leader@test.local', 'Berlin Leader',
   '00000000-0000-4000-8000-000000000002', 'leader', now()),
  ('30000000-0000-4000-8000-0000000000c1', 't016-ministry-admin@test.local', 'Ministry Admin',
   '00000000-0000-4000-8000-000000000001', 'admin', now());

-- --- content --------------------------------------------------------------------
-- One pending item per branch, one anonymous prayer, and one already-approved
-- testimony that must NOT appear (the queue is work to do, not an archive).

insert into public.testimonies
  (id, author_id, branch_id, body, language, status, consent_version)
values
  ('31000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-0000000000a1',
   '00000000-0000-4000-8000-000000000001', 'Glasgow pending testimony', 'en', 'pending',
   'content-share-v1'),
  ('31000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-0000000000a2',
   '00000000-0000-4000-8000-000000000002', 'Berlin pending testimony', 'de', 'pending',
   'content-share-v1'),
  ('31000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-0000000000a2',
   '00000000-0000-4000-8000-000000000002', 'Berlin APPROVED testimony', 'en', 'approved',
   'content-share-v1');

insert into public.prayers
  (id, author_id, branch_id, body, language, is_anonymous, status, consent_version)
values
  ('32000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-0000000000a2',
   '00000000-0000-4000-8000-000000000002', 'Berlin anonymous prayer', 'en', true, 'pending',
   'content-share-v1');

-- The ids this test owns. Everything below counts these and ignores whatever else the
-- seed happens to have left in the queue.
create function pg_temp.fixture_ids() returns uuid[] language sql immutable as $$
  select array[
    '31000000-0000-4000-8000-000000000001'::uuid,
    '31000000-0000-4000-8000-000000000002'::uuid,
    '32000000-0000-4000-8000-000000000001'::uuid
  ];
$$;

-- --- a leader sees their branch, and only their branch ---------------------------

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "30000000-0000-4000-8000-0000000000b1", "role": "authenticated", "user_role": "leader", "branch_id": "00000000-0000-4000-8000-000000000002"}';

-- Scoped to the rows this test created, never a raw total: the dev seed carries its
-- own pending content, and a test that counts everything breaks the day someone adds a
-- seed row (it did, on the first run of this file).
select is(
  (select count(*) from public.moderation_queue where id = any(pg_temp.fixture_ids()))::int,
  2, 'a leader sees exactly the two pending items in their own branch');

select is(
  (select count(*) from public.moderation_queue
    where branch_id = '00000000-0000-4000-8000-000000000001')::int,
  0, 'IDOR: a leader sees NOTHING from another branch, at the database boundary');

select is(
  (select count(*) from public.moderation_queue
    where id = '31000000-0000-4000-8000-000000000003')::int,
  0, 'an already-approved item is not in the queue');

select is(
  (select kind from public.moderation_queue
    where id = '32000000-0000-4000-8000-000000000001'),
  'prayer', 'prayers and testimonies arrive in one shape, tagged by kind');

-- The anonymity promise reaches the dashboard (decided 2026-07-29).
select is(
  (select author_id from public.moderation_queue
    where id = '32000000-0000-4000-8000-000000000001'),
  null, 'an anonymous prayer exposes no author to the moderator');

select is(
  (select author_id from public.moderation_queue
    where id = '31000000-0000-4000-8000-000000000002'),
  '30000000-0000-4000-8000-0000000000a2'::uuid,
  'a signed testimony still shows its author: only anonymity is protected');

select is(
  (select language from public.moderation_queue
    where id = '31000000-0000-4000-8000-000000000002'),
  'de', 'language travels with the item, so nobody approves what they cannot read');

-- --- an ordinary member sees only their own work ---------------------------------
-- NOT "a member sees nothing": authors can read their own pending posts (MY-POSTS in
-- the app is built on exactly that), and a security_invoker view inherits it. So this
-- view is a SHAPE, not an audience. Nobody may assume "it came from moderation_queue,
-- therefore the caller moderates it"; the dashboard is safe because authorize() refuses
-- a member at the door, not because this view filters them out.

set local request.jwt.claims to
  '{"sub": "30000000-0000-4000-8000-0000000000a2", "role": "authenticated", "user_role": "member", "branch_id": "00000000-0000-4000-8000-000000000002"}';

select is(
  (select count(*) from public.moderation_queue
    where id = '31000000-0000-4000-8000-000000000001')::int,
  0, 'a member cannot see another member''s pending post through the view');

-- --- an admin sees every branch ---------------------------------------------------

set local request.jwt.claims to
  '{"sub": "30000000-0000-4000-8000-0000000000c1", "role": "authenticated", "user_role": "admin", "branch_id": "00000000-0000-4000-8000-000000000001"}';

select is(
  (select count(*) from public.moderation_queue where id = any(pg_temp.fixture_ids()))::int,
  3, 'an admin sees pending work across every branch');

select is(
  (select count(distinct branch_id) from public.moderation_queue
    where id = any(pg_temp.fixture_ids()))::int,
  2, 'and it spans more than one branch');

-- --- the view grants no authority of its own --------------------------------------
-- security_invoker is the whole safety argument: if this ever flipped to definer, every
-- assertion above would keep passing while the boundary quietly disappeared.

reset role;
reset request.jwt.claims;

select is(
  (select reloptions::text[] @> array['security_invoker=true']
     from pg_class where relname = 'moderation_queue'),
  true, 'the view is security_invoker, so the base-table policies still decide');

select * from finish();
rollback;
