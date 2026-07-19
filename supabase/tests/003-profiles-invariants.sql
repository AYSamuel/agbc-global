-- The docs/spec/02 write-path invariants that touch profiles, exercised as REAL
-- bypass attempts (docs/spec/21 §4): each attack asserts failure, each legitimate
-- path asserts success.
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

-- Setup (privileged: direct connection has no user context).
insert into auth.users (id, email)
values
  ('10000000-0000-4000-8000-00000000aaaa', 'member-a@test.local'),
  ('10000000-0000-4000-8000-00000000bbbb', 'member-b@test.local');

insert into public.profiles (id, email, display_name, branch_id)
values
  ('10000000-0000-4000-8000-00000000aaaa', 'member-a@test.local', 'Member A',
   '00000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-00000000bbbb', 'member-b@test.local', 'Member B',
   '00000000-0000-4000-8000-000000000002');

select is(
  (select count(*) from public.notification_prefs
    where profile_id = '10000000-0000-4000-8000-00000000aaaa')::int,
  1, 'notification_prefs row auto-created by the profile trigger');

-- Become Member A.
set local role authenticated;
set local request.jwt.claims to
  '{"sub": "10000000-0000-4000-8000-00000000aaaa", "role": "authenticated", "user_role": "member", "branch_id": "00000000-0000-4000-8000-000000000001"}';

select is((select count(*) from public.profiles)::int, 1,
  'a member sees only their own profile row');

select lives_ok(
  $$update public.profiles set display_name = 'Member A renamed'
    where id = '10000000-0000-4000-8000-00000000aaaa'$$,
  'members may update allowlisted columns');

select throws_ok(
  $$update public.profiles set role = 'admin'
    where id = '10000000-0000-4000-8000-00000000aaaa'$$,
  null, 'role is immutable to its owner',
  'role self-promotion fails');

select throws_ok(
  $$update public.profiles set email = 'stolen@test.local'
    where id = '10000000-0000-4000-8000-00000000aaaa'$$,
  null, 'email mirrors the auth identity; change it via the auth email-change flow',
  'direct email change fails');

select throws_ok(
  $$update public.profiles set deleted_at = now()
    where id = '10000000-0000-4000-8000-00000000aaaa'$$,
  null, 'deletion runs through the deletion job, not a profile update',
  'self-deletion via column write fails');

select lives_ok(
  $$update public.profiles set onboarded_at = now(), age_confirmed_at = now()
    where id = '10000000-0000-4000-8000-00000000aaaa'$$,
  'AUTH-3 one-time set of onboarded_at + age_confirmed_at succeeds');

select throws_ok(
  $$update public.profiles set onboarded_at = now() + interval '1 day'
    where id = '10000000-0000-4000-8000-00000000aaaa'$$,
  null, 'onboarded_at is set once by AUTH-3',
  'onboarded_at cannot be changed after AUTH-3');

-- Member B's row is untouchable: the update matches zero rows under RLS, verified
-- from a privileged context afterwards.
select lives_ok(
  $$update public.profiles set display_name = 'hijacked'
    where id = '10000000-0000-4000-8000-00000000bbbb'$$,
  'cross-member update executes without error (RLS scopes it to zero rows)');

reset role;
select is(
  (select display_name from public.profiles
    where id = '10000000-0000-4000-8000-00000000bbbb'),
  'Member B', 'the other member''s row is unchanged');

-- Back to Member A for the remaining attempts.
set local role authenticated;
set local request.jwt.claims to
  '{"sub": "10000000-0000-4000-8000-00000000aaaa", "role": "authenticated", "user_role": "member", "branch_id": "00000000-0000-4000-8000-000000000001"}';

select lives_ok(
  $$insert into public.devices (profile_id, expo_push_token, platform)
    values ('10000000-0000-4000-8000-00000000aaaa', 'ExponentPushToken[test-a]', 'android')$$,
  'members register their own device');

select throws_ok(
  $$insert into public.devices (profile_id, expo_push_token, platform)
    values ('10000000-0000-4000-8000-00000000bbbb', 'ExponentPushToken[forged]', 'android')$$,
  '42501', null,
  'registering a device for someone else fails');

select throws_ok(
  $$insert into public.notification_prefs (profile_id)
    values ('10000000-0000-4000-8000-00000000aaaa')$$,
  '42501', null,
  'clients cannot insert notification_prefs (trigger-only)');

select lives_ok(
  $$update public.notification_prefs set prayer_reminders = false
    where profile_id = '10000000-0000-4000-8000-00000000aaaa'$$,
  'members update their own notification prefs');

-- The access token hook is auth-service-only: assert the ACL directly (calling the
-- revoked function inside throws_ok reproducibly crashed the local PG17 backend).
select is(
  has_function_privilege('authenticated', 'public.custom_access_token(jsonb)', 'execute'),
  false, 'authenticated users cannot execute the access token hook');

select * from finish();
rollback;
