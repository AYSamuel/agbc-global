-- Branch change requests (ADR 0015, W2.7 people slice).
--
-- The tests that matter most here are the ones a happy-path suite would skip: a SOURCE
-- leader selecting the base table directly across every status, a member selecting their own
-- refused row and finding no way to learn who refused them, and the column inventory that
-- makes those two true by construction rather than by policy cleverness.
--
-- Fixtures namespaced t022- and every count scoped to this file's ids: the dev seeds and the
-- dashboard's Vitest project both leave real rows in this database.
--
-- VERIFIED NON-VACUOUS, 2026-07-30, by weakening one rule at a time on the live stack:
--
--   source policy widened to the plan's `status <> 'pending'`  -> test 21 red
--   cooldown counts any decided request, not only approved     -> test 20 red
--   guard stops forcing profile_id to auth.uid()               -> file ABORTS at the fixture
--   an UPDATE policy added for the source branch               -> file ABORTS at test 16
--
-- The two aborts are worth reading rather than tidying away, because each is caught by a
-- DIFFERENT mechanism than the one removed, which is what defence in depth is supposed to
-- look like:
--
--   * unforced profile_id is refused by the INSERT policy ("new row violates row-level
--     security policy"), so the trigger and the policy independently pin who may ask;
--   * a source leader given an UPDATE policy is still refused by the guard ("this request
--     has already been decided"), so RLS and the guard independently pin who may decide.
--
-- Test 22 is the isolated version of the second one: it acts on a request that is still
-- PENDING, where the missing UPDATE policy is the only thing in the way, so a future
-- maintainer can tell the two defences apart.
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

insert into public.branches (id, slug, name, city, country, status, timezone, lat, lng)
values ('d0000000-0000-4000-8000-00000000b001', 't022-archived', 'T022 Archived',
        'Nowhere', 'Scotland', 'archived', 'Europe/London', 0, 0);

insert into auth.users (id, email) values
  ('d0000000-0000-4000-8000-0000000000a1', 't022-mover@test.local'),
  ('d0000000-0000-4000-8000-0000000000a2', 't022-berlin-leader@test.local'),
  ('d0000000-0000-4000-8000-0000000000a3', 't022-glasgow-leader@test.local'),
  ('d0000000-0000-4000-8000-0000000000a4', 't022-admin@test.local'),
  ('d0000000-0000-4000-8000-0000000000a5', 't022-other@test.local');

insert into public.profiles (id, email, display_name, branch_id, role, onboarded_at) values
  ('d0000000-0000-4000-8000-0000000000a1', 't022-mover@test.local', 'T022 Mover',
   '00000000-0000-4000-8000-000000000001', 'member', now()),
  ('d0000000-0000-4000-8000-0000000000a2', 't022-berlin-leader@test.local', 'T022 Berlin Leader',
   '00000000-0000-4000-8000-000000000002', 'leader', now()),
  ('d0000000-0000-4000-8000-0000000000a3', 't022-glasgow-leader@test.local', 'T022 Glasgow Leader',
   '00000000-0000-4000-8000-000000000001', 'leader', now()),
  ('d0000000-0000-4000-8000-0000000000a4', 't022-admin@test.local', 'T022 Admin',
   '00000000-0000-4000-8000-000000000001', 'admin', now()),
  ('d0000000-0000-4000-8000-0000000000a5', 't022-other@test.local', 'T022 Other',
   '00000000-0000-4000-8000-000000000001', 'member', now());

-- --- hygiene ------------------------------------------------------------------------------

select is(
  (select string_agg(privilege_type || ':' || grantee, ',' order by privilege_type || ':' || grantee)
     from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'branch_change_requests'
      and grantee in ('anon', 'authenticated', 'service_role')),
  'INSERT:authenticated,SELECT:authenticated,UPDATE:authenticated',
  'exactly select/insert/update to authenticated: no DELETE, nothing for anon or service_role');

select is(
  (select relforcerowsecurity from pg_class
    where oid = 'public.branch_change_requests'::regclass),
  true, 'RLS is FORCED');

-- THE COLUMN INVENTORY, in the spirit of `017`'s check that moderation_note is absent from
-- the feed views. RLS is row-level and hides no fields, so the only durable guarantee that a
-- member cannot learn who refused them is that the column does not exist. Adding one later
-- fails HERE rather than quietly disclosing itself to whichever reader the policies admit.
select is(
  (select string_agg(column_name, ',' order by column_name)
     from information_schema.columns
    where table_schema = 'public' and table_name = 'branch_change_requests'),
  'created_at,decided_at,from_branch_id,id,profile_id,status,to_branch_id,updated_at',
  'the column set is exactly the fields safe for EVERY reader: no decided_by, no note');

-- --- the server owns the request ----------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "d0000000-0000-4000-8000-0000000000a1", "role": "authenticated", "user_role": "member", "branch_id": "00000000-0000-4000-8000-000000000001"}';

-- Everything server-owned is sent WRONG on purpose: someone else's profile, a branch they
-- have never been in, and a status that would skip the queue entirely.
insert into public.branch_change_requests
  (profile_id, from_branch_id, to_branch_id, status)
values (
  'd0000000-0000-4000-8000-0000000000a5',
  '00000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000002',
  'approved'
);

select is(
  (select profile_id::text || '/' || from_branch_id::text || '/' || status::text
     from public.branch_change_requests
    where to_branch_id = '00000000-0000-4000-8000-000000000002'),
  'd0000000-0000-4000-8000-0000000000a1/00000000-0000-4000-8000-000000000001/pending',
  'the requester, their source branch and the status are forced, whatever the client sent');

select is(
  (select decided_at from public.branch_change_requests
    where profile_id = 'd0000000-0000-4000-8000-0000000000a1'),
  null, 'and a fresh request is undecided');

select throws_ok(
  $$insert into public.branch_change_requests (to_branch_id)
    values ('00000000-0000-4000-8000-000000000003')$$,
  '23505', null,
  'one open request at a time: the second is refused by the partial unique index');

-- 23514 from the guard, not 23505 from the index: a BEFORE INSERT trigger runs before the
-- unique index is consulted, so the named refusal wins even though an open request also
-- exists. Worth pinning, because it is the message the app shows for the commonest mistake.
select throws_ok(
  $$insert into public.branch_change_requests (to_branch_id)
    values ('00000000-0000-4000-8000-000000000001')$$,
  '23514', 'that is already your home branch',
  'and asking for the branch they are already in gets the named refusal, not a constraint name');

-- --- what a member may and may not do to their own request --------------------------------

select throws_ok(
  $$update public.branch_change_requests set status = 'approved'
     where profile_id = 'd0000000-0000-4000-8000-0000000000a1'$$,
  '42501', null,
  'a member cannot approve their own move (acceptance criterion 3)');

select throws_ok(
  $$update public.branch_change_requests
       set to_branch_id = '00000000-0000-4000-8000-000000000004'
     where profile_id = 'd0000000-0000-4000-8000-0000000000a1'$$,
  '42501', null,
  'nor rewrite what they asked for after a leader has seen it');

-- --- the destination decides, the source is not told yet -----------------------------------

set local request.jwt.claims to
  '{"sub": "d0000000-0000-4000-8000-0000000000a3", "role": "authenticated", "user_role": "leader", "branch_id": "00000000-0000-4000-8000-000000000001"}';
select is(
  (select count(*)::int from public.branch_change_requests
    where profile_id = 'd0000000-0000-4000-8000-0000000000a1'),
  0, 'the SOURCE leader cannot see a move out of their branch while it is pending');

set local request.jwt.claims to
  '{"sub": "d0000000-0000-4000-8000-0000000000a2", "role": "authenticated", "user_role": "leader", "branch_id": "00000000-0000-4000-8000-000000000002"}';
select is(
  (select count(*)::int from public.branch_change_requests
    where profile_id = 'd0000000-0000-4000-8000-0000000000a1'),
  1, 'the DESTINATION leader sees it in their queue');

select lives_ok(
  $$update public.branch_change_requests set status = 'approved'
     where profile_id = 'd0000000-0000-4000-8000-0000000000a1'$$,
  'and can decide it');

select isnt(
  (select decided_at from public.branch_change_requests
    where profile_id = 'd0000000-0000-4000-8000-0000000000a1'),
  null, 'decided_at is stamped by the server, not by the caller');

select throws_ok(
  $$update public.branch_change_requests set status = 'rejected'
     where profile_id = 'd0000000-0000-4000-8000-0000000000a1'$$,
  '23514', null,
  'a decision is final: an approved move cannot be walked back after the profile moved');

-- --- now the source branch is told ---------------------------------------------------------

set local request.jwt.claims to
  '{"sub": "d0000000-0000-4000-8000-0000000000a3", "role": "authenticated", "user_role": "leader", "branch_id": "00000000-0000-4000-8000-000000000001"}';
select is(
  (select count(*)::int from public.branch_change_requests
    where profile_id = 'd0000000-0000-4000-8000-0000000000a1'),
  1, 'the SOURCE leader now sees the completed move out, after the fact');

with blocked as (
  update public.branch_change_requests set status = 'cancelled'
   where profile_id = 'd0000000-0000-4000-8000-0000000000a1'
  returning 1
)
select is(count(*)::int, 0, 'but cannot act on it: no UPDATE policy for the source branch')
  from blocked;

-- --- a refused member learns the outcome and nothing else ----------------------------------
-- The whole point of decision 3, tested from the member's own session against the base table
-- rather than through any UI.

set local role postgres;
reset request.jwt.claims;

insert into public.branch_change_requests (profile_id, from_branch_id, to_branch_id)
values ('d0000000-0000-4000-8000-0000000000a5',
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000002');

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "d0000000-0000-4000-8000-0000000000a2", "role": "authenticated", "user_role": "leader", "branch_id": "00000000-0000-4000-8000-000000000002"}';
update public.branch_change_requests set status = 'rejected'
 where profile_id = 'd0000000-0000-4000-8000-0000000000a5';

set local request.jwt.claims to
  '{"sub": "d0000000-0000-4000-8000-0000000000a5", "role": "authenticated", "user_role": "member", "branch_id": "00000000-0000-4000-8000-000000000003"}';

select is(
  (select status::text from public.branch_change_requests
    where profile_id = 'd0000000-0000-4000-8000-0000000000a5'),
  'rejected', 'a refused member can read the outcome on their own row');

select isnt(
  (select decided_at from public.branch_change_requests
    where profile_id = 'd0000000-0000-4000-8000-0000000000a5'),
  null, 'and when it was decided, which names nobody');

select is(
  (select count(*)::int from public.privileged_actions),
  0, 'and can read nothing at all in the audit log, where the decider and the note live');

-- A REJECTION STARTS NO COOLDOWN (decision 2): a leader's mistake stays fixable the same day.
select lives_ok(
  $$insert into public.branch_change_requests (to_branch_id)
    values ('00000000-0000-4000-8000-000000000004')$$,
  'and may ask again immediately, because a refusal starts no cooldown');

-- --- the source leader is not told about refusals or withdrawals ---------------------------
-- The deviation from the plan's `status <> 'pending'`, and the reason for it: "tried to leave
-- you and did not" is a different disclosure from "left you", and it is worst in exactly the
-- situations ADR 0015 decision 2 exists to protect.

set local request.jwt.claims to
  '{"sub": "d0000000-0000-4000-8000-0000000000a3", "role": "authenticated", "user_role": "leader", "branch_id": "00000000-0000-4000-8000-000000000001"}';
select is(
  (select count(*)::int from public.branch_change_requests
    where profile_id = 'd0000000-0000-4000-8000-0000000000a5' and status = 'rejected'),
  0, 'a REJECTED move out is invisible to the branch being left');

-- ADR 0015 decision 2 in isolation: "a leader should not be able to refuse someone leaving,
-- and it is worst in exactly the situations where a person most needs to move". a5's newest
-- request is still PENDING, so the ONLY thing stopping the source leader here is the absent
-- UPDATE policy. Test 16 above makes the same point about an approved request, but there the
-- guard's finality rule would refuse it too, so it cannot tell the two apart.
with blocked as (
  update public.branch_change_requests set status = 'cancelled'
   where profile_id = 'd0000000-0000-4000-8000-0000000000a5' and status = 'pending'
  returning 1
)
select is(count(*)::int, 0,
  'and the branch being LEFT cannot cancel a pending move out: no update policy, no veto')
  from blocked;

-- --- the cooldown, from a completed move ---------------------------------------------------
-- The guard stamps decided_at = now() on every decision and now() is the transaction clock
-- inside pgTAP, so a historical move cannot be produced through the normal path. The trigger
-- is dropped for these two fixture rows only, and restored immediately: this is setup, not
-- the thing under test.

set local role postgres;
reset request.jwt.claims;
alter table public.branch_change_requests disable trigger branch_change_requests_guard;

insert into public.branch_change_requests
  (profile_id, from_branch_id, to_branch_id, status, decided_at)
values
  ('d0000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000004', 'approved', now() - interval '30 days'),
  ('d0000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000004', 'approved', now() - interval '100 days');

alter table public.branch_change_requests enable trigger branch_change_requests_guard;

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "d0000000-0000-4000-8000-0000000000a2", "role": "authenticated", "user_role": "leader", "branch_id": "00000000-0000-4000-8000-000000000002"}';
select throws_ok(
  $$insert into public.branch_change_requests (to_branch_id)
    values ('00000000-0000-4000-8000-000000000003')$$,
  '23514', null,
  'a move 30 days ago puts the next request inside the 90-day cooldown');

set local request.jwt.claims to
  '{"sub": "d0000000-0000-4000-8000-0000000000a3", "role": "authenticated", "user_role": "leader", "branch_id": "00000000-0000-4000-8000-000000000001"}';
select lives_ok(
  $$insert into public.branch_change_requests (to_branch_id)
    values ('00000000-0000-4000-8000-000000000003')$$,
  'a move 100 days ago does not: the cooldown is 90 days from the COMPLETED move');

-- --- an archived destination ---------------------------------------------------------------

set local request.jwt.claims to
  '{"sub": "d0000000-0000-4000-8000-0000000000a4", "role": "authenticated", "user_role": "admin", "branch_id": "00000000-0000-4000-8000-000000000001"}';
select throws_ok(
  $$insert into public.branch_change_requests (to_branch_id)
    values ('d0000000-0000-4000-8000-00000000b001')$$,
  '23514', 'that branch is not accepting members',
  'nobody asks to join an archived branch');

-- --- the audit link -------------------------------------------------------------------------

reset role;
reset request.jwt.claims;

select is(
  (select is_nullable from information_schema.columns
    where table_schema = 'public' and table_name = 'privileged_actions'
      and column_name = 'request_id'),
  'YES',
  'privileged_actions.request_id exists and is nullable: most actions have no request');

select is(
  (select count(*)::int from pg_indexes
    where tablename = 'privileged_actions' and indexname = 'privileged_actions_request_idx'),
  1, 'and it is indexed, like every other FK column here');

select * from finish();
rollback;
