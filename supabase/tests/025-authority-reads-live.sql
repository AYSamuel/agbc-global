-- Authority reads the live table, everywhere (ADR 0015, migration 20260802120000).
--
-- The property under test is one sentence: a token that SAYS admin buys nothing once the
-- table says otherwise. Every case below sets `request.jwt.claims` to a value that is a lie,
-- which is exactly what a real stale token is: correctly signed, minted before a change,
-- still inside its hour.
--
-- Test 020 already pins this for `set_member_role`. These are the tables that predate the
-- decision and were still authorizing from the claim.

begin;
select plan(20);

-- Seeded ids (`00-common.sql` / `10-dev-only.sql`).
\set glasgow '00000000-0000-4000-8000-000000000001'
\set berlin  '00000000-0000-4000-8000-000000000002'

-- Three people, made here so the test owns its own fixtures: a real admin, someone demoted
-- out of admin, and a soft-deleted admin.
insert into auth.users (id, email, instance_id, aud, role)
values
  ('b0000000-0000-4000-8000-0000000000b1', 'live.admin@example.test',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('b0000000-0000-4000-8000-0000000000b2', 'demoted@example.test',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('b0000000-0000-4000-8000-0000000000b3', 'gone@example.test',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('b0000000-0000-4000-8000-0000000000b4', 'berlin.leader@example.test',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

insert into public.profiles (id, email, display_name, role, branch_id, onboarded_at, deleted_at)
values
  ('b0000000-0000-4000-8000-0000000000b1', 'live.admin@example.test', 'Live Admin',
   'admin', :'glasgow', now(), null),
  ('b0000000-0000-4000-8000-0000000000b2', 'demoted@example.test', 'Demoted',
   'member', :'glasgow', now(), null),
  ('b0000000-0000-4000-8000-0000000000b3', 'gone@example.test', 'Gone',
   'admin', :'glasgow', now(), now()),
  ('b0000000-0000-4000-8000-0000000000b4', 'berlin.leader@example.test', 'Berlin Leader',
   'leader', :'berlin', now(), null);

-- A sermon of this file's own, because `sermons` is SYNCED from YouTube rather than seeded
-- and is empty in a freshly reset database. Without it the "updates no sermon" assertion
-- below passes for the wrong reason: zero rows changed because there were zero rows, not
-- because the policy refused. Caught by counting the table after the suite went green.
insert into public.sermons (id, branch_id, title, youtube_id, published_at)
values ('c0000000-0000-4000-8000-0000000000c1', :'glasgow', 't025 fixture sermon',
        't025fixture', now());

-- Claims are cleared before any privileged setup and between sections. A `reset role` leaves
-- request.jwt.claims exactly where it was, so setup after a section silently runs as the
-- last member unless the claims go too.
select set_config('request.jwt.claims', '', true);

-- --- 1. the helpers themselves -----------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "b0000000-0000-4000-8000-0000000000b2", "role": "authenticated", "user_role": "admin", "aal": "aal2", "branch_id": "00000000-0000-4000-8000-000000000001"}';

select is(public.caller_role_live(), 'member',
  'caller_role_live reads the table, not the claim that says admin');
select ok(not public.caller_is_admin_live(),
  'a demoted admin holding a pre-demotion token is not an admin');

set local request.jwt.claims to
  '{"sub": "b0000000-0000-4000-8000-0000000000b3", "role": "authenticated", "user_role": "admin", "aal": "aal2", "branch_id": "00000000-0000-4000-8000-000000000001"}';
select is(public.caller_role_live(), null,
  'a soft-deleted account has no live role at all');
select ok(not public.caller_is_admin_live(),
  'a soft-deleted admin is not an admin (is_admin never checked deleted_at)');

set local request.jwt.claims to
  '{"sub": "b0000000-0000-4000-8000-0000000000b1", "role": "authenticated", "user_role": "member", "aal": "aal2", "branch_id": "00000000-0000-4000-8000-000000000001"}';
select ok(public.caller_is_admin_live(),
  'and the reverse: a real admin whose token has not caught up is still an admin');

-- --- 2. the four content tables ----------------------------------------------------------

-- The demoted admin, still carrying the admin claim, against every table that used to
-- authorize from it. RLS refuses a write by affecting zero rows rather than raising, so each
-- case asserts the row count.
set local request.jwt.claims to
  '{"sub": "b0000000-0000-4000-8000-0000000000b2", "role": "authenticated", "user_role": "admin", "aal": "aal2", "branch_id": "00000000-0000-4000-8000-000000000001"}';

-- INSERT and UPDATE fail differently under RLS, which is why these are asserted differently
-- rather than uniformly. A denied INSERT RAISES (42501, "new row violates row-level security
-- policy"); a denied UPDATE matches no rows and reports success having changed nothing. The
-- second is the quieter and more dangerous shape, so each UPDATE below counts the rows it
-- actually touched rather than trusting that it did nothing.
select throws_ok(
  $$insert into public.daily_verses (date, reference, text, translation, language)
    values ('2099-01-01', 'Psalm 1:1', 'Blessed is the one', 'WEB', 'en')$$,
  '42501',
  null,
  'a stale-token admin is refused the daily-verse insert outright');
select is(
  (select count(*)::int from public.daily_verses where date = '2099-01-01'),
  0,
  'and no verse row exists afterwards');

-- The CTE attaches to the statement rather than sitting inside a subquery expression:
-- Postgres refuses a data-modifying WITH anywhere but the top level.
with u as (update public.app_config set value = value returning 1)
select is((select count(*)::int from u), 0,
  'a stale-token admin updates no app config (the forced-update floor lives here)');

with u as (update public.giving_config set accounts = accounts returning 1)
select is((select count(*)::int from u), 0,
  'a stale-token admin updates no giving config');

with u as (update public.sermons set title = title returning 1)
select is((select count(*)::int from u), 0,
  'a stale-token admin updates no sermon');
-- Non-vacuity guard for the assertion directly above: it counts rows CHANGED, so an empty
-- table would satisfy it just as well as a working policy.
select ok(
  (select count(*) from public.sermons) > 0,
  'and there was a sermon there to refuse, so that assertion meant something');

-- --- 3. the same tables still work for a real admin ---------------------------------------

set local request.jwt.claims to
  '{"sub": "b0000000-0000-4000-8000-0000000000b1", "role": "authenticated", "user_role": "admin", "aal": "aal2", "branch_id": "00000000-0000-4000-8000-000000000001"}';

insert into public.daily_verses (date, reference, text, translation, language)
values ('2099-01-02', 'Psalm 1:2', 'His delight is in the law', 'WEB', 'en');
select is(
  (select count(*)::int from public.daily_verses where date = '2099-01-02'),
  1,
  'a live admin still manages daily verses');

-- --- 4. the leader read on profiles, which carried the branch claim too -------------------

-- The Berlin leader with a Glasgow branch_id in the token. Before this migration the policy
-- read that claim, so the token decided which branch's members they could read.
set local request.jwt.claims to
  '{"sub": "b0000000-0000-4000-8000-0000000000b4", "role": "authenticated", "user_role": "leader", "aal": "aal2", "branch_id": "00000000-0000-4000-8000-000000000001"}';

select is(
  (select count(*)::int from public.profiles where branch_id = :'glasgow'::uuid),
  0,
  'a leader reads no profile from the branch their TOKEN names');
select ok(
  (select count(*) from public.profiles where branch_id = :'berlin'::uuid) > 0,
  'a leader still reads their own branch, as the table has it');

-- A member whose claim has been hand-edited to leader gets nothing.
set local request.jwt.claims to
  '{"sub": "b0000000-0000-4000-8000-0000000000b2", "role": "authenticated", "user_role": "leader", "aal": "aal2", "branch_id": "00000000-0000-4000-8000-000000000002"}';
select is(
  (select count(*)::int from public.profiles where branch_id = :'berlin'::uuid),
  0,
  'a member claiming to be a leader reads nobody else');

-- And the policy on profiles does not recurse, which is the reason the helpers are DEFINER.
-- If caller_is_admin_live had stayed SECURITY INVOKER this query raises
-- "infinite recursion detected in policy for relation profiles".
set local request.jwt.claims to
  '{"sub": "b0000000-0000-4000-8000-0000000000b1", "role": "authenticated", "user_role": "admin", "aal": "aal2", "branch_id": "00000000-0000-4000-8000-000000000001"}';
select lives_ok(
  'select count(*) from public.profiles',
  'an admin reading profiles does not recurse through the policy');

-- --- 5. the invariant guards ---------------------------------------------------------------

set local request.jwt.claims to
  '{"sub": "b0000000-0000-4000-8000-0000000000b2", "role": "authenticated", "user_role": "admin", "aal": "aal2", "branch_id": "00000000-0000-4000-8000-000000000001"}';
select throws_ok(
  $$update public.profiles set role = 'admin'
    where id = 'b0000000-0000-4000-8000-0000000000b2'$$,
  'role is immutable to its owner',
  'a stale-token admin cannot promote themselves back through the guard');

-- --- 6. the footgun is gone ----------------------------------------------------------------

select set_config('request.jwt.claims', '', true);
reset role;

select ok(
  not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'is_admin'
  ),
  'is_admin() no longer exists, so a seventeenth call site cannot be written');

-- The three live helpers are SECURITY DEFINER, which is what makes them usable from a
-- policy on profiles. Asserted rather than assumed: a later CREATE OR REPLACE that drops
-- the attribute would reintroduce the recursion at the worst moment.
select is(
  (select count(*)::int from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('caller_role_live', 'caller_branch_live', 'caller_is_admin_live')
     and p.prosecdef),
  3,
  'all three live-authority helpers are SECURITY DEFINER');

select is(
  (select count(*)::int from pg_policies
   where schemaname = 'public'
     and (qual like '%is_admin()%' or with_check like '%is_admin()%')
     and qual not like '%caller_is_admin_live%'
     and coalesce(with_check, '') not like '%caller_is_admin_live%'),
  0,
  'no policy anywhere still authorizes from the token claim');

select * from finish();
rollback;
