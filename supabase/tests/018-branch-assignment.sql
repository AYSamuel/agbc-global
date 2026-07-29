-- A branch is assigned, never self-assigned (W2.7 slice 3.5, docs/spec/02 §Invariants).
--
-- This file exists because of a hole that every other test in this suite walked past.
-- `can_moderate_branch()` keys off `profiles.branch_id`, and `branch_id` used to be
-- member-writable, so a leader could update their own row into another branch and
-- moderate it. 008, 016 and 017 all prove a leader cannot reach another branch WHILE
-- STAYING IN THEIR OWN, which is a different claim and was true the whole time.
--
-- The lesson, worth more than the fix: when authority is DERIVED from a column, the test
-- matrix has to include changing that column, not just acting from each side of it.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id, email) values
  ('50000000-0000-4000-8000-0000000000a1', 't018-berlin-leader@test.local'),
  ('50000000-0000-4000-8000-0000000000a2', 't018-berlin-member@test.local'),
  ('50000000-0000-4000-8000-0000000000a3', 't018-joining@test.local'),
  ('50000000-0000-4000-8000-0000000000a4', 't018-admin@test.local');

-- Onboarded: the lock is closed behind these three.
insert into public.profiles (id, email, display_name, branch_id, role, onboarded_at) values
  ('50000000-0000-4000-8000-0000000000a1', 't018-berlin-leader@test.local', 'Berlin Leader',
   '00000000-0000-4000-8000-000000000002', 'leader', now()),
  ('50000000-0000-4000-8000-0000000000a2', 't018-berlin-member@test.local', 'Berlin Member',
   '00000000-0000-4000-8000-000000000002', 'member', now()),
  ('50000000-0000-4000-8000-0000000000a4', 't018-admin@test.local', 'Admin',
   '00000000-0000-4000-8000-000000000001', 'admin', now());

-- Still inside AUTH-3: onboarded_at is null, so this one may still choose.
insert into public.profiles (id, email, display_name, branch_id, role) values
  ('50000000-0000-4000-8000-0000000000a3', 't018-joining@test.local', 'Joining',
   '00000000-0000-4000-8000-000000000002', 'member');

-- --- the exploit ------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "50000000-0000-4000-8000-0000000000a1", "role": "authenticated", "user_role": "leader", "branch_id": "00000000-0000-4000-8000-000000000002"}';

select is(
  public.can_moderate_branch('00000000-0000-4000-8000-000000000001'),
  false, 'a Berlin leader does not moderate Glasgow');

-- 42501 rather than the bare P0001 the older raises in this trigger use: this is a
-- refusal of AUTHORITY, and PostgREST maps it to 403. The approval flow needs to tell
-- "you may not" apart from "that was malformed" without matching on message text.
select throws_ok(
  $$update public.profiles
       set branch_id = '00000000-0000-4000-8000-000000000001'
     where id = '50000000-0000-4000-8000-0000000000a1'$$,
  '42501',
  null,
  'a leader cannot move themselves into another branch');

select is(
  public.can_moderate_branch('00000000-0000-4000-8000-000000000001'),
  false, 'and so cannot acquire Glasgow''s queue by editing their own profile');

-- --- ordinary members are held to the same rule -----------------------------------
-- Not because a member escalates anything (they moderate nothing), but because branch
-- drives attendance, service reminders and "my branch" scoping. Ayo's rule, 2026-07-29:
-- a change is proposed and a leader approves it, so it does not churn weekly.

set local request.jwt.claims to
  '{"sub": "50000000-0000-4000-8000-0000000000a2", "role": "authenticated", "user_role": "member", "branch_id": "00000000-0000-4000-8000-000000000002"}';

select throws_ok(
  $$update public.profiles
       set branch_id = '00000000-0000-4000-8000-000000000001'
     where id = '50000000-0000-4000-8000-0000000000a2'$$,
  null, 'a branch change is approved by a leader or admin, not self-assigned',
  'an onboarded member cannot move themselves either');

-- The lock must not have swallowed the rest of the allowlist.
select lives_ok(
  $$update public.profiles set display_name = 'Renamed Fine'
     where id = '50000000-0000-4000-8000-0000000000a2'$$,
  'and can still edit the rest of their profile');

-- --- onboarding is exempt ----------------------------------------------------------
-- AUTH-3 picks the branch on the way in, and its resume path rewrites the row after the
-- app is killed mid-flow (ProfileStep.tsx:107-124). Without this exemption a member who
-- backed up and chose a different branch would be stuck on the first one.

set local request.jwt.claims to
  '{"sub": "50000000-0000-4000-8000-0000000000a3", "role": "authenticated", "user_role": "member", "branch_id": "00000000-0000-4000-8000-000000000002"}';

select lives_ok(
  $$update public.profiles
       set branch_id = '00000000-0000-4000-8000-000000000001'
     where id = '50000000-0000-4000-8000-0000000000a3'$$,
  'a member still in onboarding chooses freely: the lock closes at onboarded_at');

-- --- the resume path still gets the error it matches on ----------------------------
-- ProfileStep's resume path (23505 -> update) writes branch_id and onboarded_at in ONE
-- statement, and reads `onboarded_at is set once` off the message to tell "you already
-- finished onboarding elsewhere" from a real failure (ProfileStep.tsx:54, 118). The new
-- branch check sits AFTER the onboarded_at check in profiles_guard so that message still
-- wins for an already-onboarded row. Reordering those two clauses would send a resuming
-- member to the generic error screen instead of signing them in, which no other test
-- would catch.
--
-- The timestamp below is deliberately NOT now(). Inside pgTAP's single transaction now()
-- is the TRANSACTION clock, so it returns exactly what the fixture above stored, the
-- value is not DISTINCT from the old one, the onboarded_at check never fires, and this
-- test fails against correct code (measured: it caught the branch refusal instead). The
-- app sends the DEVICE clock as a fresh ISO string, which never equals the stored value.
-- Same trap 017 hit from the other side.

set local request.jwt.claims to
  '{"sub": "50000000-0000-4000-8000-0000000000a2", "role": "authenticated", "user_role": "member", "branch_id": "00000000-0000-4000-8000-000000000002"}';

select throws_ok(
  $$update public.profiles
       set branch_id = '00000000-0000-4000-8000-000000000001',
           onboarded_at = now() + interval '1 second'
     where id = '50000000-0000-4000-8000-0000000000a2'$$,
  null, 'onboarded_at is set once by AUTH-3',
  'an already-onboarded resume still reports onboarded_at, not the branch refusal');

-- --- a stale admin claim is not an admin -------------------------------------------
-- The privileged bypass in profiles_guard used to test public.is_admin(), which reads the
-- `user_role` JWT CLAIM. This is the function that decides who may change `role`, so a
-- just-demoted admin kept the power to hand roles out until their token expired. The
-- claim below says admin; the table says member, and the table is what counts.

set local request.jwt.claims to
  '{"sub": "50000000-0000-4000-8000-0000000000a2", "role": "authenticated", "user_role": "admin", "branch_id": "00000000-0000-4000-8000-000000000002"}';

select throws_ok(
  $$update public.profiles set role = 'admin'
     where id = '50000000-0000-4000-8000-0000000000a2'$$,
  null, 'role is immutable to its owner',
  'an admin CLAIM over a member row grants nothing: the bypass asks the table');

-- --- what the interim actually is --------------------------------------------------
-- Asserted rather than assumed, because it is easy to read the migration as "an admin
-- does it by hand meanwhile". They cannot. The only UPDATE policy on profiles is
-- `members update their own profile` (id = auth.uid()), so another member's row is
-- filtered out before the trigger is reached: no exception, just zero rows. W2.7 slice
-- 3.5 brings the admin write path, and it has to carry the audit row with it (`17`).

set local request.jwt.claims to
  '{"sub": "50000000-0000-4000-8000-0000000000a4", "role": "authenticated", "user_role": "admin", "branch_id": "00000000-0000-4000-8000-000000000001"}';

with moved as (
  update public.profiles
     set branch_id = '00000000-0000-4000-8000-000000000001'
   where id = '50000000-0000-4000-8000-0000000000a1'
  returning 1
)
select is(count(*)::int, 0, 'today NOBODY can move an onboarded member, admins included')
  from moved;

-- --- a privilege change is never self-service --------------------------------------
-- The actor here is the real thing: admin in the table AND admin in the claim. 015 test
-- 11 makes the same assertion but with an understated `user_role: member` claim, so it
-- was answered by the claim-based bypass rather than by a rule. This is the case that
-- was actually open, and it is the one W2.7 slice 3.5 has to keep closed while it builds
-- the role screen: the last admin demoting themselves is how a ministry locks itself out.

select throws_ok(
  $$update public.profiles set role = 'leader'
     where id = '50000000-0000-4000-8000-0000000000a4'$$,
  '42501',
  null,
  'a real admin cannot change their OWN role: no self-service privilege changes');

reset role;
reset request.jwt.claims;

select * from finish();
rollback;
