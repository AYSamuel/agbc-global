-- The privileged-action log (docs/spec/17 §Platform, ADR 0015, W2.7 people slice).
--
-- Note how the counts below are all scoped to THIS file's target ids. That is not fussiness:
-- the dev seeds create a leader by direct INSERT, which now writes a real audit row, and the
-- fixtures in this very file write two more. A bare `count(*) from privileged_actions` would
-- pass today and fail the next time anyone touches a seed (the same ambient-data trap that
-- broke 002 and cost three failures on W2.7 slice 2).
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

insert into auth.users (id, email) values
  ('60000000-0000-4000-8000-0000000000a1', 't019-member@test.local'),
  ('60000000-0000-4000-8000-0000000000a2', 't019-leader@test.local'),
  ('60000000-0000-4000-8000-0000000000a3', 't019-admin@test.local'),
  ('60000000-0000-4000-8000-0000000000a4', 't019-target@test.local');

-- --- the grants, which are the part that silently goes wrong ---------------------------
-- Supabase's ALTER DEFAULT PRIVILEGES hands every new public table to all three API roles.
-- `015` test 4 found 21 unintended grants that way (issue #96). An audit log that
-- service_role can rewrite is not an audit log, so this is asserted, not assumed.

select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'privileged_actions'
      and grantee in ('anon', 'authenticated', 'service_role')),
  1, 'exactly one API-role grant exists on the audit log');

select is(
  (select string_agg(privilege_type || ':' || grantee, ',')
     from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'privileged_actions'
      and grantee in ('anon', 'authenticated', 'service_role')),
  'SELECT:authenticated',
  'and it is SELECT to authenticated: no writes anywhere, nothing at all for anon or service_role');

select is(
  (select relforcerowsecurity from pg_class where oid = 'public.privileged_actions'::regclass),
  true, 'RLS is FORCED, so the owner cannot quietly read around the policy either');

-- --- the trigger writes the rows ------------------------------------------------------
-- Claims are set WITHOUT changing role, so auth.uid() is a real person while the statement
-- still bypasses RLS. That is not a test shortcut: it is exactly the shape of the
-- SECURITY DEFINER RPCs this slice will add, where definer rights bypass RLS and the JWT
-- context still names the caller.

insert into public.profiles (id, email, display_name, branch_id, role, onboarded_at) values
  ('60000000-0000-4000-8000-0000000000a3', 't019-admin@test.local', 'T019 Admin',
   '00000000-0000-4000-8000-000000000001', 'admin', now()),
  ('60000000-0000-4000-8000-0000000000a4', 't019-target@test.local', 'T019 Target',
   '00000000-0000-4000-8000-000000000002', 'member', now());

select is(
  (select count(*)::int from public.privileged_actions
    where target_id = '60000000-0000-4000-8000-0000000000a4'),
  0, 'an ordinary member joining writes NO audit row: onboarding is not a privileged act');

select is(
  (select count(*)::int from public.privileged_actions
    where target_id = '60000000-0000-4000-8000-0000000000a3' and before is null
      and after = jsonb_build_object('role', 'admin')),
  1, 'a profile BORN privileged is audited, with a null "before" saying it had no prior role');

select set_config('request.jwt.claims',
  '{"sub": "60000000-0000-4000-8000-0000000000a3", "role": "authenticated", "user_role": "admin"}',
  true) \g /dev/null

update public.profiles set role = 'leader'
 where id = '60000000-0000-4000-8000-0000000000a4';

select is(
  (select count(*)::int from public.privileged_actions
    where target_id = '60000000-0000-4000-8000-0000000000a4' and action = 'role_changed'),
  1, 'a role change writes exactly one row');

select is(
  (select actor_id from public.privileged_actions
    where target_id = '60000000-0000-4000-8000-0000000000a4' and action = 'role_changed'),
  '60000000-0000-4000-8000-0000000000a3'::uuid,
  'and the actor is the human who did it, not postgres: auth.uid() survives SECURITY DEFINER');

select is(
  (select before || after from public.privileged_actions
    where target_id = '60000000-0000-4000-8000-0000000000a4' and action = 'role_changed'),
  jsonb_build_object('role', 'leader'),
  'and both sides of the change are recorded (before member, after leader, merged here)');

-- Both facts in ONE statement. Two rows, because they are two different questions someone
-- will ask later ("who made them a leader" and "who moved them"), and a single row would
-- force every reader to unpack a compound payload to answer either.
update public.profiles
   set role = 'member', branch_id = '00000000-0000-4000-8000-000000000003'
 where id = '60000000-0000-4000-8000-0000000000a4';

select is(
  (select count(*)::int from public.privileged_actions
    where target_id = '60000000-0000-4000-8000-0000000000a4'),
  3, 'one statement changing role AND branch writes two rows, not one compound row');

select is(
  (select count(*)::int from public.privileged_actions
    where target_id = '60000000-0000-4000-8000-0000000000a4' and action = 'branch_changed'),
  1, 'and the branch move is recorded as its own fact');

-- --- append-only ----------------------------------------------------------------------
-- Run as the default superuser connection ON PURPOSE. RLS and grants do not apply here, so
-- if the refusal still lands, it lands for service_role and for anyone with the database
-- password too. That is the only version of "immutable" worth claiming.

select throws_ok(
  $$update public.privileged_actions set note = 'tampered'
     where target_id = '60000000-0000-4000-8000-0000000000a4'$$,
  '42501', null,
  'the audit log refuses UPDATE even from a superuser connection');

select throws_ok(
  $$delete from public.privileged_actions
     where target_id = '60000000-0000-4000-8000-0000000000a4'$$,
  '42501', null,
  'and refuses DELETE the same way');

-- --- maintenance may redact, and only redact ------------------------------------------

select set_config('agbc.audit_maintenance', 'on', true) \g /dev/null

select lives_ok(
  $$update public.privileged_actions
       set target_id = null, target_redacted_at = now()
     where target_id = '60000000-0000-4000-8000-0000000000a4'
       and action = 'branch_changed'$$,
  'erasure may drop the target identity and stamp when it happened');

-- A genuinely DIFFERENT action, not the value already there. The first attempt at this test
-- set the value it already held, so `is distinct from` was false, nothing was rewritten, and
-- the test failed for an unrelated reason. A no-op is not a tamper attempt.
select throws_ok(
  $$update public.privileged_actions set action = 'branch_request_rejected'
     where target_id = '60000000-0000-4000-8000-0000000000a4'$$,
  '42501', null,
  'but maintenance may NOT rewrite what happened');

select throws_ok(
  $$update public.privileged_actions set actor_id = null
     where target_id = '60000000-0000-4000-8000-0000000000a4'$$,
  '42501', null,
  'nor erase who did it: the actor is the point of the record');

select throws_ok(
  $$update public.privileged_actions
       set target_id = '60000000-0000-4000-8000-0000000000a3'
     where target_id = '60000000-0000-4000-8000-0000000000a4'$$,
  '23514', null,
  'and redaction CLEARS the target rather than pointing it at somebody else');

select set_config('agbc.audit_maintenance', 'off', true) \g /dev/null

-- --- who can read it ------------------------------------------------------------------

insert into public.profiles (id, email, display_name, branch_id, role, onboarded_at) values
  ('60000000-0000-4000-8000-0000000000a1', 't019-member@test.local', 'T019 Member',
   '00000000-0000-4000-8000-000000000002', 'member', now()),
  ('60000000-0000-4000-8000-0000000000a2', 't019-leader@test.local', 'T019 Leader',
   '00000000-0000-4000-8000-000000000002', 'leader', now());

set local role authenticated;

set local request.jwt.claims to
  '{"sub": "60000000-0000-4000-8000-0000000000a1", "role": "authenticated", "user_role": "member", "branch_id": "00000000-0000-4000-8000-000000000002"}';
select is(
  (select count(*)::int from public.privileged_actions), 0,
  'a member sees nothing in the audit log, including rows about themselves');

-- The leader claims admin here as well as leader elsewhere in the suite: this asserts the
-- policy asks the TABLE (caller_is_admin_live), so a forged or stale claim buys nothing.
set local request.jwt.claims to
  '{"sub": "60000000-0000-4000-8000-0000000000a2", "role": "authenticated", "user_role": "admin", "branch_id": "00000000-0000-4000-8000-000000000002"}';
select is(
  (select count(*)::int from public.privileged_actions), 0,
  'a leader sees nothing either, even claiming admin in the token');

select throws_ok(
  $$insert into public.privileged_actions (action) values ('role_changed')$$,
  '42501', null,
  'and cannot write a row directly: the log is trigger-only');

set local request.jwt.claims to
  '{"sub": "60000000-0000-4000-8000-0000000000a3", "role": "authenticated", "user_role": "admin", "branch_id": "00000000-0000-4000-8000-000000000001"}';
select isnt(
  (select count(*)::int from public.privileged_actions), 0,
  'an admin reads the log');

reset role;
reset request.jwt.claims;

-- --- the record outlives the account (20260808123451) ------------------------------------
--
-- The ids were foreign keys with ON DELETE SET NULL, and that action was impossible: the
-- append-only trigger refused the update its own foreign key was making, so deleting any
-- profile named here failed with "privileged_actions is append-only". W4.5 has to delete
-- the account of somebody who may well have been the target of a role change, so this was
-- account deletion broken in advance, and it surfaced first as a test suite that could not
-- tidy up after itself (2026-08-08).

select is(
  (select count(*)::int from pg_constraint
    where conrelid = 'public.privileged_actions'::regclass and contype = 'f'),
  0,
  'the table carries NO foreign key at all: every id in it points at something the app may delete, and the record has to survive all of them');

select isnt(
  (select count(*)::int from public.privileged_actions
    where actor_id = '60000000-0000-4000-8000-0000000000a3'), 0,
  'the fixture left rows naming the actor');

delete from public.profiles where id = '60000000-0000-4000-8000-0000000000a3';
delete from auth.users where id = '60000000-0000-4000-8000-0000000000a3';

select is(
  (select count(*)::int from public.profiles
    where id = '60000000-0000-4000-8000-0000000000a3'), 0,
  'the actor can now close their account at all, which they could not before');

select isnt(
  (select count(*)::int from public.privileged_actions
    where actor_id = '60000000-0000-4000-8000-0000000000a3'), 0,
  'and the audit rows still name them: the id is retained, not erased with the account (docs/spec/16)');

select throws_ok(
  $$update public.privileged_actions set actor_id = null
     where actor_id = '60000000-0000-4000-8000-0000000000a3'$$,
  '42501', null,
  'nobody gained a way to erase the actor by hand: the log is append-only exactly as before');

-- The same act, one table further out: a member who asked to move branch used to be
-- undeletable too, because the cascade into branch_change_requests fired this table's
-- third foreign key.
select lives_ok(
  $$delete from public.profiles where id = '60000000-0000-4000-8000-0000000000a4'$$,
  'a member who once asked to change branch can be deleted, cascade and all');

select * from finish();
rollback;
