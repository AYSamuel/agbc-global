-- The first-admin bootstrap (docs/spec/17, W2.7 slice 1): the promotion works in both
-- orderings, it does not widen the role-immutability guard for anyone else, and the
-- allowlist is unreachable through the API.
--
-- The mechanism is exercised with test-only addresses, never with the seeded production
-- one. Creating an auth user for the real address would collide with the actual account
-- the moment anyone signs into the dashboard on their own machine, and a suite that
-- fails because a developer signed in is a suite nobody trusts. The seeded grant itself
-- is asserted read-only.
begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

-- --- the table is trigger-only -------------------------------------------------

select is(
  (select relrowsecurity from pg_class where oid = 'public.bootstrap_admins'::regclass),
  true, 'bootstrap_admins: RLS enabled');
select is(
  (select relforcerowsecurity from pg_class where oid = 'public.bootstrap_admins'::regclass),
  true, 'bootstrap_admins: RLS forced');
select is(
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'bootstrap_admins')::int,
  0, 'bootstrap_admins: no policies (nothing reads it but the trigger)');

-- Supabase's project bootstrap GRANTs ALL on new public tables to every API role by
-- default, so "we granted nothing" is not the same as "nothing is granted". The
-- migration revokes explicitly; this asserts the revoke, not the absence of a grant.
select is(
  (select count(*) from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'bootstrap_admins'
      and grantee in ('anon', 'authenticated', 'service_role'))::int,
  0, 'bootstrap_admins: no privileges for anon, authenticated or service_role');

select is(
  (select count(*) from public.bootstrap_admins
    where email = 'aysamuel007@gmail.com')::int,
  1, 'the migration seeded the first admin from docs/spec/17');

-- --- ordering 1: the allowlist exists first, the profile arrives later ----------
-- The real production path: the grant lands, then the person signs in and AUTH-3
-- creates their profile as a plain member.

insert into public.bootstrap_admins (email, note)
values ('bootstrap-first@test.local', 'ordering: grant before profile');

insert into auth.users (id, email)
values ('20000000-0000-4000-8000-00000000aaaa', 'bootstrap-first@test.local');

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "20000000-0000-4000-8000-00000000aaaa", "role": "authenticated", "user_role": "member", "branch_id": "00000000-0000-4000-8000-000000000001"}';

-- Exactly what AUTH-3 writes: the member's own row, role pinned to member by policy.
select lives_ok(
  $$insert into public.profiles (id, email, display_name, branch_id)
    values ('20000000-0000-4000-8000-00000000aaaa', 'bootstrap-first@test.local',
            'First Admin', '00000000-0000-4000-8000-000000000001')$$,
  'the allowlisted member creates their own profile through their own policy');

reset role;
reset request.jwt.claims;

select is(
  (select role::text from public.profiles
    where id = '20000000-0000-4000-8000-00000000aaaa'),
  'admin', 'the allowlisted profile was promoted to admin on insert');

-- The flag is transaction-local and released: the guard is armed again straight away.
select is(public.in_bootstrap_promote(), false,
  'the promotion flag does not leak past the trigger');

-- --- the guard is not widened for anyone else ----------------------------------

insert into auth.users (id, email)
values ('20000000-0000-4000-8000-00000000bbbb', 'not-listed@test.local');

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "20000000-0000-4000-8000-00000000bbbb", "role": "authenticated", "user_role": "member", "branch_id": "00000000-0000-4000-8000-000000000001"}';

insert into public.profiles (id, email, display_name, branch_id)
values ('20000000-0000-4000-8000-00000000bbbb', 'not-listed@test.local', 'Not Listed',
        '00000000-0000-4000-8000-000000000002');

select is(
  (select role::text from public.profiles
    where id = '20000000-0000-4000-8000-00000000bbbb'),
  'member', 'an unlisted email is not promoted');

select throws_ok(
  $$update public.profiles set role = 'admin'
    where id = '20000000-0000-4000-8000-00000000bbbb'$$,
  null, 'role is immutable to its owner',
  'self-promotion still fails after the bootstrap trigger exists');

-- Being ON the list is not a standing permission: it is a one-time, server-owned act at
-- insert, so the promoted owner still cannot write their own role afterwards.
set local request.jwt.claims to
  '{"sub": "20000000-0000-4000-8000-00000000aaaa", "role": "authenticated", "user_role": "member", "branch_id": "00000000-0000-4000-8000-000000000001"}';

select throws_ok(
  $$update public.profiles set role = 'member'
    where id = '20000000-0000-4000-8000-00000000aaaa'$$,
  null, 'role is immutable to its owner',
  'even an allowlisted owner cannot write their own role');

reset role;
reset request.jwt.claims;

-- --- ordering 2: the profile exists first, the grant is added later -------------
-- The migration's catch-up UPDATE, run the way the migration runs it: a direct
-- connection with no user context.

insert into auth.users (id, email)
values ('20000000-0000-4000-8000-00000000cccc', 'bootstrap-later@test.local');

insert into public.profiles (id, email, display_name, branch_id)
values ('20000000-0000-4000-8000-00000000cccc', 'bootstrap-later@test.local',
        'Later Admin', '00000000-0000-4000-8000-000000000001');

insert into public.bootstrap_admins (email, note)
values ('bootstrap-later@test.local', 'ordering: profile before grant');

update public.profiles p
  set role = 'admin'
  from public.bootstrap_admins b
  where lower(p.email) = lower(b.email)
    and p.role is distinct from 'admin';

select is(
  (select role::text from public.profiles
    where id = '20000000-0000-4000-8000-00000000cccc'),
  'admin', 'an existing profile is promoted when the grant is added afterwards');

-- Case is not a way onto or off the list.
select throws_ok(
  $$insert into public.bootstrap_admins (email, note)
    values ('Bootstrap-Later@test.local', 'mixed case')$$,
  '23514', null,
  'the allowlist refuses a non-lowercase address');

select * from finish();
rollback;
