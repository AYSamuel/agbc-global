-- Role assignment: the admin write path (docs/spec/17 §People, ADR 0015, W2.7 people slice).
--
-- Two things about this file are deliberate and worth reading before editing it.
--
-- EVERY 42501 REFUSAL ASSERTS ITS MESSAGE, not just the code. Five different clauses in
-- set_member_role raise 42501, so a test that checked only the code would pass when the
-- WRONG clause fired: an aal1 test would be satisfied by the admin check, and would keep
-- passing if the step-up were deleted outright. That is the vacuous-pass shape that `018`
-- and `019` both had to be re-run against pre-change code to catch.
--
-- EVERY COUNT IS SCOPED TO THIS FILE'S OWN IDS. The dev seeds create a leader by direct
-- INSERT, which now writes a real audit row, and the dashboard's `server` Vitest project
-- leaves whole cohorts of leaders and admins behind in the local database (31 profiles and
-- four admins, measured 2026-07-30). A bare count(*) would pass today and break on the next
-- seed edit or test run.
--
-- VERIFIED NON-VACUOUS, 2026-07-30, the way `018` and `019` had to be. Each refusal was
-- weakened in turn on the live stack and the suite re-run, confirming which assertions go red:
--
--   admin check removed        -> 6, 7, 8        aal2 check removed       -> 9, 10
--   self check removed         -> 11, 27         unknown member removed   -> 12
--   closed account removed     -> 13             mid-onboarding removed   -> 14
--   unknown branch removed     -> 15             archived branch removed  -> 16
--   write matches no row       -> 17-24, 26      guard ignores the flag   -> 29
--   flag widened to own role   -> 30
--
-- And the one honest gap, stated rather than papered over: removing the LAST-ADMIN count
-- clause from set_member_role turns NOTHING red. That clause cannot fire through this entry
-- point (see the comment on it in the migration, and the sequence at tests 25-27 which is
-- what actually holds the invariant). Nobody should read tests 25-27 as covering it.
begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

-- Branch fixtures are CREATED here rather than borrowed, per the ambient-data lesson: the
-- archived case has no seeded example, and inventing one would make this file depend on a
-- branch nobody has a reason to keep archived.
insert into public.branches
  (id, slug, name, city, country, status, timezone, lat, lng)
values
  ('a0000000-0000-4000-8000-00000000b001', 't020-archived', 'T020 Archived', 'Nowhere',
   'Scotland', 'archived', 'Europe/London', 0, 0);

insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-0000000000a1', 't020-admin@test.local'),
  ('a0000000-0000-4000-8000-0000000000a2', 't020-second-admin@test.local'),
  ('a0000000-0000-4000-8000-0000000000a3', 't020-member@test.local'),
  ('a0000000-0000-4000-8000-0000000000a4', 't020-leader@test.local'),
  ('a0000000-0000-4000-8000-0000000000a5', 't020-closed@test.local'),
  ('a0000000-0000-4000-8000-0000000000a6', 't020-plain@test.local'),
  ('a0000000-0000-4000-8000-0000000000a7', 't020-branch-probe@test.local'),
  ('a0000000-0000-4000-8000-0000000000a8', 't020-joining@test.local');

-- a3 starts in GLASGOW on purpose, so that promoting them to lead BERLIN is a real branch
-- change. Seeding them in Berlin already would make `is distinct from` false, write no
-- branch audit row, and quietly turn the two-row assertion below into a one-row one.
insert into public.profiles
  (id, email, display_name, branch_id, role, onboarded_at, deleted_at)
values
  ('a0000000-0000-4000-8000-0000000000a1', 't020-admin@test.local', 'T020 Admin',
   '00000000-0000-4000-8000-000000000001', 'admin', now(), null),
  ('a0000000-0000-4000-8000-0000000000a2', 't020-second-admin@test.local', 'T020 Second Admin',
   '00000000-0000-4000-8000-000000000001', 'admin', now(), null),
  ('a0000000-0000-4000-8000-0000000000a3', 't020-member@test.local', 'T020 Member',
   '00000000-0000-4000-8000-000000000001', 'member', now(), null),
  ('a0000000-0000-4000-8000-0000000000a4', 't020-leader@test.local', 'T020 Leader',
   '00000000-0000-4000-8000-000000000002', 'leader', now(), null),
  ('a0000000-0000-4000-8000-0000000000a5', 't020-closed@test.local', 'T020 Closed',
   '00000000-0000-4000-8000-000000000002', 'member', now(), now()),
  ('a0000000-0000-4000-8000-0000000000a6', 't020-plain@test.local', 'T020 Plain',
   '00000000-0000-4000-8000-000000000003', 'member', now(), null),
  -- Its own target for the two branch-validation refusals, so that a broken refusal fails
  -- ONE test instead of cascading. Sharing a6 with the "branch is optional" pair below made
  -- removing the archived check turn three assertions red, which buries the real one.
  ('a0000000-0000-4000-8000-0000000000a7', 't020-branch-probe@test.local', 'T020 Branch Probe',
   '00000000-0000-4000-8000-000000000003', 'member', now(), null);

-- Still inside AUTH-3: onboarded_at is null, so this member may still rewrite their own
-- branch and would silently revert anything an admin assigned them.
insert into public.profiles
  (id, email, display_name, branch_id, role, onboarded_at)
values
  ('a0000000-0000-4000-8000-0000000000a8', 't020-joining@test.local', 'T020 Joining',
   '00000000-0000-4000-8000-000000000003', 'member', null);

-- --- hygiene: who may even attempt it, and what the function runs as -------------------
-- has_function_privilege rather than a call, for anon and service_role. On this local
-- Postgres a role invoking a function it lacks EXECUTE on takes the BACKEND DOWN instead of
-- raising insufficient_privilege, so "prove the refusal by trying it" costs the whole test
-- run (recorded in the closing note of `019`'s migration).

select ok(
  has_function_privilege('authenticated',
    'public.set_member_role(uuid, public.profile_role, uuid)', 'execute'),
  'authenticated may attempt it: the authority check lives inside the function');

select ok(
  not has_function_privilege('anon',
    'public.set_member_role(uuid, public.profile_role, uuid)', 'execute'),
  'anon cannot reach it at all');

select ok(
  not has_function_privilege('service_role',
    'public.set_member_role(uuid, public.profile_role, uuid)', 'execute'),
  'and neither can service_role: no job assigns roles, so a leaked key cannot either');

select is(
  (select prosecdef::text || '/' || pg_get_userbyid(proowner) || '/' ||
          coalesce(array_to_string(proconfig, ','), 'unpinned')
     from pg_proc
    where oid = 'public.set_member_role(uuid, public.profile_role, uuid)'::regprocedure),
  'true/postgres/search_path=""',
  'SECURITY DEFINER, owned by postgres, search_path pinned empty');

-- The owner above is not bookkeeping. postgres carries BYPASSRLS, and that attribute is the
-- only reason this function can write another member's row at all: profiles has FORCE ROW
-- LEVEL SECURITY and its one UPDATE policy is `id = auth.uid()`. Measured 2026-07-30.
select ok(
  (select rolbypassrls from pg_roles where rolname = 'postgres'),
  'and that owner holds BYPASSRLS, which is what gives the function its write path');

-- --- authority: read from the table, and before anything else -------------------------

set local role authenticated;

set local request.jwt.claims to
  '{"sub": "a0000000-0000-4000-8000-0000000000a3", "role": "authenticated", "user_role": "member", "aal": "aal2", "branch_id": "00000000-0000-4000-8000-000000000001"}';
select throws_ok(
  $$select public.set_member_role(
      'a0000000-0000-4000-8000-0000000000a6', 'leader')$$,
  '42501', 'only an admin assigns roles',
  'a member cannot assign roles');

set local request.jwt.claims to
  '{"sub": "a0000000-0000-4000-8000-0000000000a4", "role": "authenticated", "user_role": "leader", "aal": "aal2", "branch_id": "00000000-0000-4000-8000-000000000002"}';
select throws_ok(
  $$select public.set_member_role(
      'a0000000-0000-4000-8000-0000000000a6', 'leader')$$,
  '42501', 'only an admin assigns roles',
  'nor can a leader, in their own branch or any other (acceptance criterion 2)');

-- The claim says admin; the table says member. ADR 0015 §6: authority checks read the live
-- table, so a stale token from before a demotion buys nothing.
set local request.jwt.claims to
  '{"sub": "a0000000-0000-4000-8000-0000000000a3", "role": "authenticated", "user_role": "admin", "aal": "aal2", "branch_id": "00000000-0000-4000-8000-000000000001"}';
select throws_ok(
  $$select public.set_member_role(
      'a0000000-0000-4000-8000-0000000000a6', 'leader')$$,
  '42501', 'only an admin assigns roles',
  'an admin CLAIM grants nothing: the check asks the table, not the token');

-- --- the step-up ----------------------------------------------------------------------
-- Real admin, real token, one factor. The message is asserted because the clause above
-- raises the same 42501: without it, deleting the aal check entirely would leave these two
-- tests green.

set local request.jwt.claims to
  '{"sub": "a0000000-0000-4000-8000-0000000000a1", "role": "authenticated", "user_role": "admin", "aal": "aal1", "branch_id": "00000000-0000-4000-8000-000000000001"}';
select throws_ok(
  $$select public.set_member_role(
      'a0000000-0000-4000-8000-0000000000a6', 'leader')$$,
  '42501', 'handing out authority needs a fresh code from your authenticator',
  'an aal1 session cannot hand out authority (acceptance criterion 13)');

-- A token minted before MFA existed carries no aal claim at all. Absent must read as "not
-- proven", never as "no opinion".
set local request.jwt.claims to
  '{"sub": "a0000000-0000-4000-8000-0000000000a1", "role": "authenticated", "user_role": "admin", "branch_id": "00000000-0000-4000-8000-000000000001"}';
select throws_ok(
  $$select public.set_member_role(
      'a0000000-0000-4000-8000-0000000000a6', 'leader')$$,
  '42501', 'handing out authority needs a fresh code from your authenticator',
  'and a token with no aal claim at all is treated as not stepped up');

-- --- everything below acts as a real, stepped-up admin --------------------------------

set local request.jwt.claims to
  '{"sub": "a0000000-0000-4000-8000-0000000000a1", "role": "authenticated", "user_role": "admin", "aal": "aal2", "branch_id": "00000000-0000-4000-8000-000000000001"}';

select throws_ok(
  $$select public.set_member_role(
      'a0000000-0000-4000-8000-0000000000a1', 'leader')$$,
  '42501', 'a role change is never self-service, admins included',
  'an admin cannot change their own role through the RPC either (018 test 10 in the guard)');

select throws_ok(
  $$select public.set_member_role(
      'a0000000-0000-4000-8000-0000000000ff', 'leader')$$,
  'P0002', 'no such member',
  'an unknown target is refused, not silently written to nothing');

select throws_ok(
  $$select public.set_member_role(
      'a0000000-0000-4000-8000-0000000000a5', 'leader')$$,
  '23514', 'that account is closed',
  'a closed account cannot be given authority');

-- The silent-revert path, closed 2026-07-30. Without this refusal the promotion succeeds, the
-- member's own onboarding resume write puts branch_id back to whatever THEY picked, and the
-- ministry has a leader scoped to a branch nobody assigned them. profiles_guard cannot catch
-- it, because exempting pre-onboarding writes is what makes AUTH-3's resume path work.
select throws_ok(
  $$select public.set_member_role(
      'a0000000-0000-4000-8000-0000000000a8', 'leader',
      '00000000-0000-4000-8000-000000000002')$$,
  '23514', 'that member has not finished joining yet',
  'a member still in onboarding is refused: their own resume write would revert the branch');

select throws_ok(
  $$select public.set_member_role(
      'a0000000-0000-4000-8000-0000000000a7', 'leader',
      'a0000000-0000-4000-8000-00000000bfff')$$,
  'P0002', 'no such branch',
  'an unknown branch is refused before the write, not by the foreign key after it');

select throws_ok(
  $$select public.set_member_role(
      'a0000000-0000-4000-8000-0000000000a7', 'leader',
      'a0000000-0000-4000-8000-00000000b001')$$,
  '23514', 'that branch is archived',
  'and nobody is assigned INTO an archived branch: leadership of one is authority over nothing');

-- --- the happy path, which is the whole reason this slice was pulled forward -----------

select lives_ok(
  $$select public.set_member_role(
      'a0000000-0000-4000-8000-0000000000a3', 'leader',
      '00000000-0000-4000-8000-000000000002')$$,
  'an admin promotes a Glasgow member to lead Berlin');

select is(
  (select role::text || ' of ' || branch_id::text from public.profiles
    where id = 'a0000000-0000-4000-8000-0000000000a3'),
  'leader of 00000000-0000-4000-8000-000000000002',
  'and both the role and the branch landed, in one statement');

select is(
  (select string_agg(action::text, ',' order by action::text)
     from public.privileged_actions
    where target_id = 'a0000000-0000-4000-8000-0000000000a3'),
  'branch_changed,role_changed',
  'the trigger wrote exactly one row per fact that changed (acceptance criterion 8)');

-- string_agg(distinct ...) rather than a count: it names the actor AND fails loudly if a
-- second one ever appears, where a count of 1 would be satisfied by the wrong single actor.
-- A null actor (the write attributed to postgres instead of the human) collapses the whole
-- aggregate to NULL and fails too.
select is(
  (select string_agg(distinct actor_id::text, ',')
     from public.privileged_actions
    where target_id = 'a0000000-0000-4000-8000-0000000000a3'),
  'a0000000-0000-4000-8000-0000000000a1',
  'and both name the admin who did it, not postgres: auth.uid() survives SECURITY DEFINER');

-- Acceptance criterion 1, the database half: the promotion actually confers authority.
-- Asserted from the NEW LEADER's session, because "the row says leader" and "they can clear
-- their queue" are different claims and only the second one is the point.
set local request.jwt.claims to
  '{"sub": "a0000000-0000-4000-8000-0000000000a3", "role": "authenticated", "user_role": "member", "aal": "aal1", "branch_id": "00000000-0000-4000-8000-000000000001"}';
select is(
  public.can_moderate_branch('00000000-0000-4000-8000-000000000002') ::text
    || '/' || public.can_moderate_branch('00000000-0000-4000-8000-000000000001')::text,
  'true/false',
  'the new leader moderates Berlin and only Berlin, on a token still claiming member');

set local request.jwt.claims to
  '{"sub": "a0000000-0000-4000-8000-0000000000a1", "role": "authenticated", "user_role": "admin", "aal": "aal2", "branch_id": "00000000-0000-4000-8000-000000000001"}';

select lives_ok(
  $$select public.set_member_role(
      'a0000000-0000-4000-8000-0000000000a6', 'leader')$$,
  'the branch is optional: a promotion can leave someone where they are');

select is(
  (select role::text || ' of ' || branch_id::text from public.profiles
    where id = 'a0000000-0000-4000-8000-0000000000a6'),
  'leader of 00000000-0000-4000-8000-000000000003',
  'and the branch is left exactly as it was');

select is(
  (select string_agg(action::text, ',') from public.privileged_actions
    where target_id = 'a0000000-0000-4000-8000-0000000000a6'),
  'role_changed',
  'so only the role is audited: a fact that did not change writes no row');

-- --- the last admin -------------------------------------------------------------------
-- Tested as a SEQUENCE, because the count clause inside set_member_role cannot fire on its
-- own. The caller must be a live admin and the target cannot be the caller, so any target
-- holding 'admin' means at least two live admins exist and demoting one leaves one. What
-- actually holds the invariant is the PAIR: demote the second admin and one remains, then
-- try to demote the last one and you are the last one. Asserting the clause in isolation
-- would be asserting something unreachable, which is how a test passes vacuously.
--
-- The ambient admins are demoted by PREDICATE, never by id: the dashboard's Vitest project
-- leaves admins behind in this database, and a hard-coded list would rot the first time it
-- ran a different number of cases. This runs on the superuser connection with no claims, so
-- profiles_guard treats it as server-owned.

reset role;
reset request.jwt.claims;

update public.profiles set role = 'member'
 where role = 'admin'
   and id not in ('a0000000-0000-4000-8000-0000000000a1',
                  'a0000000-0000-4000-8000-0000000000a2');

select is(
  (select count(*)::int from public.profiles
    where role = 'admin' and deleted_at is null),
  2, 'fixture: exactly two live admins in the whole database');

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "a0000000-0000-4000-8000-0000000000a1", "role": "authenticated", "user_role": "admin", "aal": "aal2", "branch_id": "00000000-0000-4000-8000-000000000001"}';

select lives_ok(
  $$select public.set_member_role(
      'a0000000-0000-4000-8000-0000000000a2', 'member')$$,
  'one of two admins may be demoted: this is not a refusal of ordinary work');

select throws_ok(
  $$select public.set_member_role(
      'a0000000-0000-4000-8000-0000000000a1', 'member')$$,
  '42501', 'a role change is never self-service, admins included',
  'and the ministry still cannot reach zero admins: the last one is always the caller');

-- --- the new flag does exactly one thing ----------------------------------------------
-- in_privileged_profile_write() is the mechanism decide_branch_request will need, where the
-- actor is a LEADER and the guard's admin bypass answers false. Tested here, with the
-- migration that introduces it, rather than left until the caller exists.
--
-- The technique is `019`'s: claims name a real person while the statement runs on a
-- connection that bypasses RLS, which is exactly the shape of a SECURITY DEFINER RPC.

reset role;
set local request.jwt.claims to
  '{"sub": "a0000000-0000-4000-8000-0000000000a4", "role": "authenticated", "user_role": "leader", "aal": "aal1", "branch_id": "00000000-0000-4000-8000-000000000002"}';

select throws_ok(
  $$update public.profiles
       set branch_id = '00000000-0000-4000-8000-000000000004'
     where id = 'a0000000-0000-4000-8000-0000000000a5'$$,
  '42501', 'a branch change is approved by a leader or admin, not self-assigned',
  'without the flag, a leader''s uid cannot move anybody: the guard still refuses');

select set_config('agbc.privileged_profile_write', 'on', true) \g /dev/null

select lives_ok(
  $$update public.profiles
       set branch_id = '00000000-0000-4000-8000-000000000004'
     where id = 'a0000000-0000-4000-8000-0000000000a5'$$,
  'with the flag, the same write lands: this is what the approval flow will run inside');

-- THE LIMIT OF THE FLAG, and the reason it is a separate mechanism from
-- agbc.bootstrap_promote rather than a second use of it. The self-role refusal sits AHEAD
-- of the privileged bypass in profiles_guard and this flag is deliberately not exempted
-- from it, so the worst a leaked flag could do is move a branch, never hand out a role.
select throws_ok(
  $$update public.profiles set role = 'admin'
     where id = 'a0000000-0000-4000-8000-0000000000a4'$$,
  '42501', 'role is immutable to its owner',
  'but the flag never lets an owner write their OWN role: that refusal is ahead of the bypass');

select set_config('agbc.privileged_profile_write', 'off', true) \g /dev/null

reset role;
reset request.jwt.claims;

select * from finish();
rollback;
