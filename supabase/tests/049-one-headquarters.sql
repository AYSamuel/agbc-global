-- W3.5 slice 5b: one headquarters, and who may move it (20260821120000).
--
-- `is_hq` decides three things that never raise an error when they are wrong: the timezone a
-- ministry-wide event defaults to, which branch this dashboard refuses to close, and where a
-- member whose branch closes is sent first. It also draws a gold badge members can see. So
-- the assertions below are mostly about the states the schema must make impossible, rather
-- than about the happy path.
--
-- TRAP (see 009's header): `reset role` drops the ROLE but leaves `request.jwt.claims`.
--
-- TRAP (see 019): never CALL a function the current role lacks EXECUTE on; the backend
-- segfaults. The ACL assertions read the catalogue.
--
-- TRAP (see 047): an UPDATE a caller is not entitled to make is FILTERED by RLS rather than
-- refused. Here the refusals are 42501 from the GRANT layer instead, which is the difference
-- taking `is_hq` out of the column grant buys: a client cannot name the column at all.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

\set glasgow '00000000-0000-4000-8000-000000000001'
\set berlin  '00000000-0000-4000-8000-000000000002'
\set fresh   '97100000-0000-4000-8000-0000000000b1'
\set closed  '97100000-0000-4000-8000-0000000000b2'
\set admin   '97100000-0000-4000-8000-00000000000a'
\set member  '97100000-0000-4000-8000-00000000000b'

insert into public.branches
  (id, slug, name, city, country, timezone, languages, email, lat, lng, "order")
values
  (:'fresh', 'test-hq-fresh', 'AGBC Test Fresh', 'Testville', 'Testland',
   'Europe/Amsterdam', 'English', 'fresh@test.local', 52.0, 6.0, 97),
  (:'closed', 'test-hq-closed', 'AGBC Test Closed', 'Testville', 'Testland',
   'Europe/Amsterdam', 'English', 'closed@test.local', 52.0, 6.0, 98);

insert into auth.users (id, email) values
  (:'admin', 'hq-admin@test.local'),
  (:'member', 'hq-member@test.local');

insert into public.profiles
  (id, email, display_name, branch_id, role, onboarded_at, age_confirmed_at)
values
  (:'admin', 'hq-admin@test.local', 'HQ Admin', :'glasgow', 'admin', now(), now()),
  (:'member', 'hq-member@test.local', 'HQ Member', :'glasgow', 'member', now(), now());

-- ===========================================================================
-- 1. The schema makes two headquarters impossible.
-- ===========================================================================

select is(
  (select count(*)::integer from public.branches where is_hq),
  1,
  'the seed opens with exactly one headquarters');

-- A trusted caller, which is the only writer left after the grant was taken away, still
-- cannot make a second one: the index is the rule, not the grant.
select throws_ok(
  format($$update public.branches set is_hq = true where id = %L$$, :'fresh'),
  '23505', null,
  'a second headquarters is refused by the index, even from a direct connection');

select has_index('public', 'branches', 'branches_one_headquarters_idx',
  'and the index is there by name, because a future migration must not drop it by accident');

-- ===========================================================================
-- 2. No client may name the column.
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"97100000-0000-4000-8000-00000000000a","role":"authenticated","user_role":"admin","aal":"aal2"}';

select throws_ok(
  format($$update public.branches set is_hq = true where id = %L$$, :'fresh'),
  '42501', null,
  'an admin at aal2 cannot set it directly: moving HQ has one door');

select throws_ok(
  $$insert into public.branches
      (slug, name, city, country, timezone, lat, lng, is_hq)
    values ('rogue-hq', 'Rogue', 'X', 'Y', 'Europe/London', 0, 0, true)$$,
  '42501', null,
  'nor is a branch ever BORN the headquarters');

-- The ordinary edit still works, so the revoke took exactly one column and not the grant.
update public.branches set name = 'AGBC Test Fresh (renamed)' where id = :'fresh';
select is(
  (select name from public.branches where id = :'fresh'),
  'AGBC Test Fresh (renamed)',
  'and everything else on the row is still editable');

-- ===========================================================================
-- 3. Who may move it.
-- ===========================================================================

set local request.jwt.claims to
  '{"sub":"97100000-0000-4000-8000-00000000000b","role":"authenticated","user_role":"member"}';

select throws_ok(
  format($$select public.set_headquarters(%L)$$, :'fresh'),
  '42501', 'only an admin may move the headquarters',
  'a member calling the function directly is refused');

set local request.jwt.claims to
  '{"sub":"97100000-0000-4000-8000-00000000000a","role":"authenticated","user_role":"admin","aal":"aal1"}';

select throws_ok(
  format($$select public.set_headquarters(%L)$$, :'fresh'),
  '42501', 'moving the headquarters needs a fresh code from your authenticator',
  'and so is an admin who has not cleared a second factor');

set local request.jwt.claims to
  '{"sub":"97100000-0000-4000-8000-00000000000a","role":"authenticated","user_role":"admin","aal":"aal2"}';

select throws_ok(
  format($$select public.set_headquarters(%L)$$, :'glasgow'),
  '23514', 'that branch is already the headquarters',
  'moving it to where it already is is refused rather than quietly doing nothing');

-- ===========================================================================
-- 4. A closed branch cannot hold it.
-- ===========================================================================

select public.archive_branch(:'closed');

select throws_ok(
  format($$select public.set_headquarters(%L)$$, :'closed'),
  '23514', 'a closed branch cannot be the headquarters',
  'because HQ is where a closing branch sends its members, and that one takes nobody');

-- ===========================================================================
-- 5. The move itself.
-- ===========================================================================

select lives_ok(
  format($$select public.set_headquarters(%L)$$, :'fresh'),
  'an admin at aal2 hands the headquarters to another open branch');

reset role;
set local request.jwt.claims to '{}';

select is(
  (select count(*)::integer from public.branches where is_hq),
  1,
  'there is still exactly one: cleared before set, never both and never neither');

select ok(
  (select is_hq from public.branches where id = :'fresh'),
  'and it is the branch that was named');

select ok(
  not (select is_hq from public.branches where id = :'glasgow'),
  'while the one that held it has let go');

-- ===========================================================================
-- 6. What moving it changes, which is the reason the confirm screen exists.
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"97100000-0000-4000-8000-00000000000a","role":"authenticated","user_role":"admin","aal":"aal2"}';

select throws_ok(
  format($$select public.archive_branch(%L)$$, :'fresh'),
  '23514', null,
  'the new headquarters is now the branch that cannot be closed');

reset role;
set local request.jwt.claims to '{}';

-- Glasgow keeps its own protections (it has leaders and members in the seed), so this
-- asserts the RULE moved rather than trying to close a seeded branch: HQ is no longer the
-- reason Glasgow is refused.
select ok(
  not exists (
    select 1 from public.branches b where b.id = :'glasgow' and b.is_hq
  ),
  'and Glasgow no longer wears the protection HQ carries');

-- A ministry-wide event now defaults to the new headquarters' clock, which is the second
-- thing the confirm screen promises. Inserted trusted, because the guard exempts a caller
-- with no user context and the zone default is what is under test.
insert into public.events (id, branch_id, title, description, starts_at_local, location, timezone)
values ('97100000-0000-4000-8000-0000000000e1', null, 'Family Sunday', '',
        (now() + interval '20 days')::timestamp, 'Everywhere', '');

select is(
  (select timezone from public.events where id = '97100000-0000-4000-8000-0000000000e1'),
  'Europe/Amsterdam',
  'an event for the whole family takes the new headquarters'' zone, not the old one');

-- ===========================================================================
-- 7. Who may call it.
-- ===========================================================================

select ok(
  not has_function_privilege('anon', 'public.set_headquarters(uuid)', 'execute'),
  'anon cannot move the headquarters');

select ok(
  not has_function_privilege('service_role', 'public.set_headquarters(uuid)', 'execute'),
  'and neither can a leaked service key: no job has ever needed to');

select * from finish();
rollback;
