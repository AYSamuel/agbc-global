-- The staff read path for branch requests (ADR 0015, W2.7 people slice).
--
-- `022` proved the base table's policies. This file proves the VIEW does not become a way
-- around them, which is the only real risk a security-definer object carries: its owner has
-- BYPASSRLS, so every policy `022` tested is switched off inside it and the WHERE clause is
-- the whole boundary. Every test below is therefore about who does NOT see a row, with one
-- exception: test 5, the name the view exists to disclose.
--
-- Fixtures namespaced t024- and every assertion scoped to this file's ids, because the dev
-- seeds and the dashboard's Vitest project both leave real rows in this database.
--
-- VERIFIED NON-VACUOUS, 2026-08-01, by weakening one rule at a time on the live stack:
--
--   source clause relaxed to `can_moderate_branch(from_branch_id)`  -> tests 6, 14 red
--   destination clause dropped                                     -> tests 5, 12, 15 red
--   `display_name` removed from the select list                    -> test 2 red, file aborts
--   view recreated with security_invoker = true                    -> tests 3, 5, 12, 13 red
--
-- The last one taught something worth writing down, because the guess was wrong. The expected
-- failure was "the row comes back with a null name": the request itself IS readable under
-- `022`'s destination policy, and only the joined profile is not. What actually happens is
-- that the whole row disappears, because the profile join is an INNER join and RLS removes
-- the row it needs. So an invoker-rights version of this view does not show a decision about
-- nobody; it shows an EMPTY QUEUE while requests are waiting, which is the failure a leader
-- would never think to report.
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

insert into auth.users (id, email) values
  ('e0000000-0000-4000-8000-0000000000a1', 't024-mover@test.local'),
  ('e0000000-0000-4000-8000-0000000000a2', 't024-berlin-leader@test.local'),
  ('e0000000-0000-4000-8000-0000000000a3', 't024-glasgow-leader@test.local'),
  ('e0000000-0000-4000-8000-0000000000a4', 't024-emmen-leader@test.local'),
  ('e0000000-0000-4000-8000-0000000000a5', 't024-admin@test.local'),
  ('e0000000-0000-4000-8000-0000000000a6', 't024-refused@test.local');

insert into public.profiles (id, email, display_name, branch_id, role, onboarded_at) values
  ('e0000000-0000-4000-8000-0000000000a1', 't024-mover@test.local', 'T024 Mover',
   '00000000-0000-4000-8000-000000000001', 'member', now()),
  ('e0000000-0000-4000-8000-0000000000a2', 't024-berlin-leader@test.local', 'T024 Berlin Leader',
   '00000000-0000-4000-8000-000000000002', 'leader', now()),
  ('e0000000-0000-4000-8000-0000000000a3', 't024-glasgow-leader@test.local', 'T024 Glasgow Leader',
   '00000000-0000-4000-8000-000000000001', 'leader', now()),
  ('e0000000-0000-4000-8000-0000000000a4', 't024-emmen-leader@test.local', 'T024 Emmen Leader',
   '00000000-0000-4000-8000-000000000003', 'leader', now()),
  ('e0000000-0000-4000-8000-0000000000a5', 't024-admin@test.local', 'T024 Admin',
   '00000000-0000-4000-8000-000000000001', 'admin', now()),
  ('e0000000-0000-4000-8000-0000000000a6', 't024-refused@test.local', 'T024 Refused',
   '00000000-0000-4000-8000-000000000001', 'member', now());

-- Two requests, both Glasgow -> Berlin: one that will be approved, one that will be refused.
-- Inserted on this direct connection, where the guard leaves profile_id alone because there
-- is no auth.uid(); `022` is where the forcing itself is proven.
insert into public.branch_change_requests (id, profile_id, from_branch_id, to_branch_id) values
  ('e0000000-0000-4000-8000-0000000000b1', 'e0000000-0000-4000-8000-0000000000a1',
   '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'),
  ('e0000000-0000-4000-8000-0000000000b2', 'e0000000-0000-4000-8000-0000000000a6',
   '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002');

-- --- hygiene --------------------------------------------------------------------------------

select is(
  (select string_agg(privilege_type || ':' || grantee, ',' order by privilege_type || ':' || grantee)
     from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'branch_request_queue'
      and grantee in ('anon', 'authenticated', 'service_role')),
  'SELECT:authenticated',
  'exactly SELECT to authenticated: nothing for anon, nothing for service_role');

-- The column inventory, the same guarantee `022` makes for the base table. A definer view is
-- a disclosure surface, so what it carries is pinned by construction rather than by anybody
-- remembering: no email, no note, no decider, and no profile_id it does not need.
select is(
  (select string_agg(column_name, ',' order by column_name)
     from information_schema.columns
    where table_schema = 'public' and table_name = 'branch_request_queue'),
  'created_at,decided_at,display_name,from_branch_id,from_branch_name,id,status,to_branch_id,to_branch_name',
  'the view carries exactly the columns a decider needs, and nothing that identifies a decider');

select is(
  (select 'security_invoker=true' = any(coalesce(c.reloptions, array[]::text[]))
     from pg_class c where c.oid = 'public.branch_request_queue'::regclass),
  false, 'the view runs as its owner: its WHERE clause is the whole boundary');

-- Same assertion `020` makes about the definer functions, for the same reason: the owner's
-- BYPASSRLS is what lets the view read a profile the caller cannot, so a future migration
-- that recreates it under a different owner fails here rather than silently returning
-- nothing.
select is(
  (select pg_get_userbyid(c.relowner) from pg_class c
    where c.oid = 'public.branch_request_queue'::regclass),
  'postgres', 'and is owned by the role that holds BYPASSRLS');

-- --- who sees a request that is still pending -----------------------------------------------

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "e0000000-0000-4000-8000-0000000000a2", "role": "authenticated", "user_role": "leader", "branch_id": "00000000-0000-4000-8000-000000000002"}';

-- THE ONE THE VIEW EXISTS FOR. The requester is still in Glasgow, so `profiles` refuses this
-- leader the name; the view supplies it, and only it.
select is(
  (select display_name || ' / ' || from_branch_name || ' -> ' || to_branch_name
     from public.branch_request_queue
    where id = 'e0000000-0000-4000-8000-0000000000b1'),
  'T024 Mover / AGBC Glasgow -> AGBC Lighthouse Berlin',
  'the DESTINATION leader can name the person asking to join them');

set local request.jwt.claims to
  '{"sub": "e0000000-0000-4000-8000-0000000000a3", "role": "authenticated", "user_role": "leader", "branch_id": "00000000-0000-4000-8000-000000000001"}';
select is(
  (select count(*)::int from public.branch_request_queue
    where id in ('e0000000-0000-4000-8000-0000000000b1', 'e0000000-0000-4000-8000-0000000000b2')),
  0, 'the SOURCE leader sees nothing while it is pending, through the view as through the table');

set local request.jwt.claims to
  '{"sub": "e0000000-0000-4000-8000-0000000000a4", "role": "authenticated", "user_role": "leader", "branch_id": "00000000-0000-4000-8000-000000000003"}';
-- Scoped to this file's two requests, like every other count here. An unscoped one passed
-- on a fresh stack and failed the moment a developer had ANY Emmen move in their local
-- database, which is the ambient-data lesson this suite already carries in its header and
-- which this line got wrong first time (2026-08-01).
select is(
  (select count(*)::int from public.branch_request_queue
    where id in ('e0000000-0000-4000-8000-0000000000b1', 'e0000000-0000-4000-8000-0000000000b2')),
  0, 'a leader of neither branch sees nothing at all');

-- The member reads their own request from the BASE TABLE (`022`), never from here. Two
-- readers, two paths, and only the staff one carries a name.
set local request.jwt.claims to
  '{"sub": "e0000000-0000-4000-8000-0000000000a1", "role": "authenticated", "user_role": "member", "branch_id": "00000000-0000-4000-8000-000000000001"}';
select is(
  (select count(*)::int from public.branch_request_queue
    where id in ('e0000000-0000-4000-8000-0000000000b1', 'e0000000-0000-4000-8000-0000000000b2')),
  0, 'and the requester themselves sees nothing here, not even their own request');

select is(
  has_table_privilege('anon', 'public.branch_request_queue', 'SELECT'),
  false, 'anon cannot read the view at all: this is staff data');

-- --- the decisions ---------------------------------------------------------------------------

set local request.jwt.claims to
  '{"sub": "e0000000-0000-4000-8000-0000000000a2", "role": "authenticated", "user_role": "leader", "branch_id": "00000000-0000-4000-8000-000000000002"}';

select lives_ok(
  $$select public.decide_branch_request('e0000000-0000-4000-8000-0000000000b1', true)$$,
  'the destination leader approves the first request');

select lives_ok(
  $$select public.decide_branch_request('e0000000-0000-4000-8000-0000000000b2', false,
      'T024 note for the ministry record')$$,
  'and refuses the second, with the note that only an admin will ever read');

select is(
  (select count(*)::int from public.branch_request_queue
    where id in ('e0000000-0000-4000-8000-0000000000b1', 'e0000000-0000-4000-8000-0000000000b2')),
  2, 'the destination still sees both after deciding them');

-- --- what the source branch is told, and what it is not ---------------------------------------

set local request.jwt.claims to
  '{"sub": "e0000000-0000-4000-8000-0000000000a3", "role": "authenticated", "user_role": "leader", "branch_id": "00000000-0000-4000-8000-000000000001"}';

select is(
  (select display_name || ' -> ' || to_branch_name from public.branch_request_queue
    where id = 'e0000000-0000-4000-8000-0000000000b1'),
  'T024 Mover -> AGBC Lighthouse Berlin',
  'the SOURCE leader is told about the completed move out, after the fact, and can name them');

-- THE ONE THAT MATTERS MOST HERE. "Tried to leave you and did not" is a different disclosure
-- from "left you", and it is worst in the safeguarding cases (decision 14). `022` test 21
-- pins it on the base table; this pins that the view did not quietly widen it.
select is(
  (select count(*)::int from public.branch_request_queue
    where id = 'e0000000-0000-4000-8000-0000000000b2'),
  0, 'but never about the refused one, which is a disclosure the source has no business with');

-- --- the admin fallback ------------------------------------------------------------------------

set local request.jwt.claims to
  '{"sub": "e0000000-0000-4000-8000-0000000000a5", "role": "authenticated", "user_role": "admin", "branch_id": "00000000-0000-4000-8000-000000000001"}';
select is(
  (select count(*)::int from public.branch_request_queue
    where id in ('e0000000-0000-4000-8000-0000000000b1', 'e0000000-0000-4000-8000-0000000000b2')),
  2, 'an admin moderates every branch, so both clauses answer true and they see both');

select * from finish();
rollback;
