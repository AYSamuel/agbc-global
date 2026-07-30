-- Deciding a branch request (ADR 0015, W2.7 people slice).
--
-- The two tests worth reading first are the SOURCE leader being refused (decision 1: the
-- branch being left has no say, which is the whole safeguarding argument) and the rejection
-- writing its own audit row (no profile changes, so no trigger fires, so it is the one
-- decision that would otherwise leave no trace, and the one where the note matters most).
--
-- Fixtures namespaced t023- and every count scoped to this file's ids.
--
-- VERIFIED NON-VACUOUS, 2026-07-30. Each rule was weakened in turn on the live stack; the
-- PRIMARY assertion listed is the one that names the rule, and the rest are downstream tests
-- that shift because a decision CONSUMES a request, which is inherent to testing a state
-- machine from shared fixtures:
--
--   authority reads the source branch      -> 5   (then 6, 9-19 cascade)
--   the 48-hour admin gate removed         -> 6   (then 12, 15 cascade)
--   a refusal no longer needs a reason     -> 9, 10 (then 11, 16-19 cascade)
--   an approved leader keeps leadership    -> 17, 18, 19
--   the rejection stops writing its row    -> 22
--   the request link is never stated       -> 15, 18, 19
--
-- Nothing went undetected. The cascades are the cost of a shared request per scenario; the
-- alternative is a fixture per assertion, which would make each test independent and the file
-- twice as long. Worth revisiting if this file grows.
--
-- ACTING AND ASSERTING ARE KEPT APART, and the first draft of this file got it wrong. Reading
-- privileged_actions or another branch's profiles from inside an actor's session measures the
-- POLICY, not the write: five assertions failed that way against correct code, because a
-- leader cannot read the audit log and cannot read a member of another branch. State
-- assertions therefore run on the superuser connection; the member's-eye view at the end is
-- the deliberate exception, and it is the point of those two tests.
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

-- A branch with NO leader, for the admin's immediate fallback. Created rather than borrowed:
-- which seeded branches have leaders is not this file's business to depend on.
insert into public.branches (id, slug, name, city, country, timezone, lat, lng)
values ('e0000000-0000-4000-8000-00000000b001', 't023-quiet', 'T023 Quiet', 'Nowhere',
        'Scotland', 'Europe/London', 0, 0);

insert into auth.users (id, email) values
  ('e0000000-0000-4000-8000-0000000000a1', 't023-mover@test.local'),
  ('e0000000-0000-4000-8000-0000000000a2', 't023-berlin-leader@test.local'),
  ('e0000000-0000-4000-8000-0000000000a3', 't023-glasgow-leader@test.local'),
  ('e0000000-0000-4000-8000-0000000000a4', 't023-admin@test.local'),
  ('e0000000-0000-4000-8000-0000000000a5', 't023-moving-leader@test.local'),
  ('e0000000-0000-4000-8000-0000000000a6', 't023-quiet-mover@test.local'),
  ('e0000000-0000-4000-8000-0000000000a7', 't023-refused@test.local');

insert into public.profiles (id, email, display_name, branch_id, role, onboarded_at) values
  ('e0000000-0000-4000-8000-0000000000a1', 't023-mover@test.local', 'T023 Mover',
   '00000000-0000-4000-8000-000000000001', 'member', now()),
  ('e0000000-0000-4000-8000-0000000000a2', 't023-berlin-leader@test.local', 'T023 Berlin Leader',
   '00000000-0000-4000-8000-000000000002', 'leader', now()),
  ('e0000000-0000-4000-8000-0000000000a3', 't023-glasgow-leader@test.local', 'T023 Glasgow Leader',
   '00000000-0000-4000-8000-000000000001', 'leader', now()),
  ('e0000000-0000-4000-8000-0000000000a4', 't023-admin@test.local', 'T023 Admin',
   '00000000-0000-4000-8000-000000000001', 'admin', now()),
  ('e0000000-0000-4000-8000-0000000000a5', 't023-moving-leader@test.local', 'T023 Moving Leader',
   '00000000-0000-4000-8000-000000000003', 'leader', now()),
  ('e0000000-0000-4000-8000-0000000000a6', 't023-quiet-mover@test.local', 'T023 Quiet Mover',
   '00000000-0000-4000-8000-000000000001', 'member', now()),
  ('e0000000-0000-4000-8000-0000000000a7', 't023-refused@test.local', 'T023 Refused',
   '00000000-0000-4000-8000-000000000001', 'member', now());

-- created_at is supplied directly: the guard forces the requester, source branch and status
-- on insert but leaves created_at alone, and now() is the transaction clock inside pgTAP, so
-- a request that is genuinely 3 days old cannot be produced any other way.
insert into public.branch_change_requests
  (id, profile_id, from_branch_id, to_branch_id, created_at)
values
  ('e0000000-0000-4000-8000-00000000c001', 'e0000000-0000-4000-8000-0000000000a1',
   '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', now()),
  ('e0000000-0000-4000-8000-00000000c002', 'e0000000-0000-4000-8000-0000000000a5',
   '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000002', now()),
  ('e0000000-0000-4000-8000-00000000c003', 'e0000000-0000-4000-8000-0000000000a6',
   '00000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-00000000b001', now()),
  ('e0000000-0000-4000-8000-00000000c004', 'e0000000-0000-4000-8000-0000000000a7',
   '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002',
   now() - interval '3 days');

-- --- hygiene -------------------------------------------------------------------------------

select ok(
  has_function_privilege('authenticated',
    'public.decide_branch_request(uuid, boolean, text)', 'execute'),
  'authenticated may attempt it: the authority is checked inside');

select ok(
  not has_function_privilege('anon',
    'public.decide_branch_request(uuid, boolean, text)', 'execute')
  and not has_function_privilege('service_role',
    'public.decide_branch_request(uuid, boolean, text)', 'execute'),
  'anon and service_role cannot reach it (asserted, never invoked: that segfaults this PG)');

select is(
  (select prosecdef::text || '/' || pg_get_userbyid(proowner)
     from pg_proc
    where oid = 'public.decide_branch_request(uuid, boolean, text)'::regprocedure),
  'true/postgres',
  'SECURITY DEFINER, owned by postgres, which is what gives it a write path past FORCE RLS');

-- --- who decides ---------------------------------------------------------------------------

set local role authenticated;

set local request.jwt.claims to
  '{"sub": "e0000000-0000-4000-8000-0000000000a1", "role": "authenticated", "user_role": "member", "branch_id": "00000000-0000-4000-8000-000000000001"}';
select throws_ok(
  $$select public.decide_branch_request(
      'e0000000-0000-4000-8000-00000000c001', true)$$,
  '42501', 'only the branch being joined, or an admin, decides this',
  'a member cannot approve their own move');

-- ADR 0015 decision 1, and the reason for it: a leader must not be able to refuse someone
-- leaving, because it is worst in exactly the situations where a person most needs to move.
set local request.jwt.claims to
  '{"sub": "e0000000-0000-4000-8000-0000000000a3", "role": "authenticated", "user_role": "leader", "branch_id": "00000000-0000-4000-8000-000000000001"}';
select throws_ok(
  $$select public.decide_branch_request(
      'e0000000-0000-4000-8000-00000000c001', false, 'not letting them go')$$,
  '42501', 'only the branch being joined, or an admin, decides this',
  'the SOURCE branch leader cannot decide, and so cannot refuse someone leaving');

-- --- the admin fallback ----------------------------------------------------------------------

set local request.jwt.claims to
  '{"sub": "e0000000-0000-4000-8000-0000000000a4", "role": "authenticated", "user_role": "admin", "branch_id": "00000000-0000-4000-8000-000000000001"}';
select throws_ok(
  $$select public.decide_branch_request(
      'e0000000-0000-4000-8000-00000000c001', true)$$,
  '23514', 'the branch leader has 48 hours to decide this first',
  'an admin does not pre-empt a destination that HAS a leader inside 48 hours');

select lives_ok(
  $$select public.decide_branch_request(
      'e0000000-0000-4000-8000-00000000c003', true)$$,
  'but acts immediately when the destination has no leader at all');

select lives_ok(
  $$select public.decide_branch_request(
      'e0000000-0000-4000-8000-00000000c004', false, 'safeguarding concern, spoke with the family')$$,
  'and acts on a request older than 48 hours even where a leader exists');

-- --- the note rules ---------------------------------------------------------------------------

set local request.jwt.claims to
  '{"sub": "e0000000-0000-4000-8000-0000000000a2", "role": "authenticated", "user_role": "leader", "branch_id": "00000000-0000-4000-8000-000000000002"}';

select throws_ok(
  $$select public.decide_branch_request(
      'e0000000-0000-4000-8000-00000000c002', false)$$,
  '23514', 'a refusal needs a reason for the ministry record',
  'a refusal without a reason is refused: the member is told nothing, so this is the only record');

select throws_ok(
  $$select public.decide_branch_request(
      'e0000000-0000-4000-8000-00000000c002', false, '   ')$$,
  '23514', 'a refusal needs a reason for the ministry record',
  'and whitespace is not a reason');

select throws_ok(
  $$select public.decide_branch_request(
      'e0000000-0000-4000-8000-00000000c002', true, 'welcome!')$$,
  '23514', 'a note is recorded for a refusal, not an approval',
  'a note with an approval is refused rather than silently dropped');

-- --- approving ---------------------------------------------------------------------------------

select lives_ok(
  $$select public.decide_branch_request(
      'e0000000-0000-4000-8000-00000000c001', true)$$,
  'the DESTINATION leader approves, immediately and without waiting out the 48 hours');

-- Assertions about what LANDED read on the superuser connection, not as the leader who acted.
-- privileged_actions is admin-read-only and profiles is branch-scoped, so asserting stored
-- state from inside an actor's session measures the policy rather than the write. Acting and
-- checking are different jobs and this file keeps them apart.
reset role;
reset request.jwt.claims;

select is(
  (select branch_id from public.profiles
    where id = 'e0000000-0000-4000-8000-0000000000a1'),
  '00000000-0000-4000-8000-000000000002'::uuid,
  'and the member is in their new branch the moment it is approved');

select is(
  (select status::text || '/' || (decided_at is not null)::text
     from public.branch_change_requests
    where id = 'e0000000-0000-4000-8000-00000000c001'),
  'approved/true', 'the request is closed and stamped by the table''s own guard');

-- The approval IS a branch_changed row carrying its request: no separate
-- branch_request_approved value exists, precisely so there is one row per event.
select is(
  (select action::text || '/' || (request_id = 'e0000000-0000-4000-8000-00000000c001')::text
          || '/' || (actor_id = 'e0000000-0000-4000-8000-0000000000a2')::text
     from public.privileged_actions
    where target_id = 'e0000000-0000-4000-8000-0000000000a1'),
  'branch_changed/true/true',
  'one audit row, linked to the request, naming the leader who decided');

-- --- a leader's approved move drops them to member (decision 4) -----------------------------

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "e0000000-0000-4000-8000-0000000000a2", "role": "authenticated", "user_role": "leader", "branch_id": "00000000-0000-4000-8000-000000000002"}';
select lives_ok(
  $$select public.decide_branch_request(
      'e0000000-0000-4000-8000-00000000c002', true)$$,
  'a LEADER''s move is approved');

reset role;
reset request.jwt.claims;

select is(
  (select role::text || ' of ' || branch_id::text from public.profiles
    where id = 'e0000000-0000-4000-8000-0000000000a5'),
  'member of 00000000-0000-4000-8000-000000000002',
  'and they arrive as an ordinary member: leadership does not travel with the person');

-- Scoped to the REQUEST, not to the target. a5 was created as a leader by direct insert, and
-- a profile born privileged is audited (`021`), so an unscoped list here also picks up that
-- fixture row and reads as three actions. The same ambient-audit trap `019` warns about,
-- arriving from this file's own fixtures rather than from the seeds.
select is(
  (select string_agg(action::text, ',' order by action::text)
     from public.privileged_actions
    where target_id = 'e0000000-0000-4000-8000-0000000000a5'
      and request_id = 'e0000000-0000-4000-8000-00000000c002'),
  'branch_changed,role_changed',
  'both facts are audited, as two rows, from the one statement');

select is(
  (select count(*)::int from public.privileged_actions
    where target_id = 'e0000000-0000-4000-8000-0000000000a5'
      and request_id = 'e0000000-0000-4000-8000-00000000c002'
      and actor_id = 'e0000000-0000-4000-8000-0000000000a2'),
  2, 'and both name the leader who decided, linked to the request that caused them');

-- --- refusing: the row no trigger writes ------------------------------------------------------

select is(
  (select status::text from public.branch_change_requests
    where id = 'e0000000-0000-4000-8000-00000000c004'),
  'rejected', 'a refused request is closed');

select is(
  (select branch_id from public.profiles
    where id = 'e0000000-0000-4000-8000-0000000000a7'),
  '00000000-0000-4000-8000-000000000001'::uuid,
  'and the member has not moved, so profiles_audit never fired for it');

select is(
  (select action::text || '/' || note || '/' ||
          (actor_id = 'e0000000-0000-4000-8000-0000000000a4')::text
     from public.privileged_actions
    where target_id = 'e0000000-0000-4000-8000-0000000000a7'),
  'branch_request_rejected/safeguarding concern, spoke with the family/true',
  'yet the refusal, its reason and its author are recorded: the RPC writes this row itself');

-- --- a decision is final -----------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "e0000000-0000-4000-8000-0000000000a2", "role": "authenticated", "user_role": "leader", "branch_id": "00000000-0000-4000-8000-000000000002"}';
select throws_ok(
  $$select public.decide_branch_request(
      'e0000000-0000-4000-8000-00000000c001', false, 'changed my mind')$$,
  '23514', 'this request has already been decided',
  'and cannot be revisited after the profile has already moved');

select throws_ok(
  $$select public.decide_branch_request(
      'e0000000-0000-4000-8000-0000000000ff', true)$$,
  'P0002', 'no such request',
  'an unknown request is refused, not silently ignored');

-- --- the refused member still learns nothing about who ------------------------------------------

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "e0000000-0000-4000-8000-0000000000a7", "role": "authenticated", "user_role": "member", "branch_id": "00000000-0000-4000-8000-000000000001"}';

select is(
  (select count(*)::int from public.privileged_actions),
  0, 'the refused member cannot read the log holding the decider and the reason');

select is(
  (select status::text from public.branch_change_requests
    where id = 'e0000000-0000-4000-8000-00000000c004'),
  'rejected',
  'they see only the outcome on their own row, which names nobody (criterion 16)');

reset role;
reset request.jwt.claims;

select * from finish();
rollback;
