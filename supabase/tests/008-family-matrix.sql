-- Family policy matrix (docs/spec/02) exercised as real reads and real bypass
-- attempts (docs/spec/21 §4). The claim under test: a guest can read the family's
-- published life and nothing else, an author sees their own pipeline, a leader sees
-- their own branch's queue and no other branch's, and the base tables are closed to
-- guests entirely so that column-level secrets (an anonymous author) cannot leak.
--
-- Counts are scoped to this suite's own rows throughout: the dev seed carries family
-- fixtures, so absolute counts would be hostage to the seed file.
begin;
create extension if not exists pgtap with schema extensions;
select plan(44);

-- RLS enabled AND forced, in the same migration as the table (docs/spec/25 §3).
select is((select relrowsecurity from pg_class where oid = 'public.testimonies'::regclass),
  true, 'testimonies: RLS enabled');
select is((select relforcerowsecurity from pg_class where oid = 'public.testimonies'::regclass),
  true, 'testimonies: RLS forced');
select is((select relrowsecurity from pg_class where oid = 'public.prayers'::regclass),
  true, 'prayers: RLS enabled');
select is((select relforcerowsecurity from pg_class where oid = 'public.prayers'::regclass),
  true, 'prayers: RLS forced');
select is((select relrowsecurity from pg_class where oid = 'public.glory_reactions'::regclass),
  true, 'glory_reactions: RLS enabled');
select is((select relforcerowsecurity from pg_class where oid = 'public.glory_reactions'::regclass),
  true, 'glory_reactions: RLS forced');
select is((select relrowsecurity from pg_class where oid = 'public.prayer_intercessions'::regclass),
  true, 'prayer_intercessions: RLS enabled');
select is((select relforcerowsecurity from pg_class where oid = 'public.prayer_intercessions'::regclass),
  true, 'prayer_intercessions: RLS forced');
select is((select relrowsecurity from pg_class where oid = 'public.reports'::regclass),
  true, 'reports: RLS enabled');
select is((select relforcerowsecurity from pg_class where oid = 'public.reports'::regclass),
  true, 'reports: RLS forced');
select is((select relrowsecurity from pg_class where oid = 'public.blocked_users'::regclass),
  true, 'blocked_users: RLS enabled');
select is((select relforcerowsecurity from pg_class where oid = 'public.blocked_users'::regclass),
  true, 'blocked_users: RLS forced');
select is((select relrowsecurity from pg_class where oid = 'public.testimony_categories'::regclass),
  true, 'testimony_categories: RLS enabled');

-- Cast (privileged setup: a direct connection carries no auth.uid()).
-- Author + a second member in Glasgow, a Glasgow leader, a Berlin leader, an admin,
-- one member who never finished AUTH-3, and one deleted account.
insert into auth.users (id, email) values
  ('90000000-0000-4000-8000-00000000000a', 'fam-author@test.local'),
  ('90000000-0000-4000-8000-00000000000b', 'fam-member@test.local'),
  ('90000000-0000-4000-8000-00000000000c', 'fam-leader-gla@test.local'),
  ('90000000-0000-4000-8000-00000000000d', 'fam-leader-ber@test.local'),
  ('90000000-0000-4000-8000-00000000000e', 'fam-admin@test.local');
insert into public.profiles
  (id, email, display_name, branch_id, role, onboarded_at, age_confirmed_at)
values
  ('90000000-0000-4000-8000-00000000000a', 'fam-author@test.local', 'Author',
   '00000000-0000-4000-8000-000000000001', 'member', now(), now()),
  ('90000000-0000-4000-8000-00000000000b', 'fam-member@test.local', 'Member',
   '00000000-0000-4000-8000-000000000001', 'member', now(), now()),
  ('90000000-0000-4000-8000-00000000000c', 'fam-leader-gla@test.local', 'Glasgow Leader',
   '00000000-0000-4000-8000-000000000001', 'leader', now(), now()),
  ('90000000-0000-4000-8000-00000000000d', 'fam-leader-ber@test.local', 'Berlin Leader',
   '00000000-0000-4000-8000-000000000002', 'leader', now(), now()),
  ('90000000-0000-4000-8000-00000000000e', 'fam-admin@test.local', 'Admin',
   '00000000-0000-4000-8000-000000000001', 'admin', now(), now());

-- One approved and one pending testimony in Glasgow, plus one approved in Berlin so
-- the "Everywhere vs My branch" scoping has something to separate.
insert into public.testimonies
  (id, author_id, branch_id, body, status, consent_version)
values
  ('80000000-0000-4000-8000-00000000000a', '90000000-0000-4000-8000-00000000000a',
   '00000000-0000-4000-8000-000000000001', 'tap approved glasgow', 'approved', 'tap-v1'),
  ('80000000-0000-4000-8000-00000000000b', '90000000-0000-4000-8000-00000000000a',
   '00000000-0000-4000-8000-000000000001', 'tap pending glasgow', 'pending', 'tap-v1'),
  ('80000000-0000-4000-8000-00000000000c', '90000000-0000-4000-8000-00000000000d',
   '00000000-0000-4000-8000-000000000002', 'tap approved berlin', 'approved', 'tap-v1'),
  -- Approved but soft-deleted by its author: must be invisible everywhere public.
  ('80000000-0000-4000-8000-00000000000d', '90000000-0000-4000-8000-00000000000a',
   '00000000-0000-4000-8000-000000000001', 'tap deleted glasgow', 'approved', 'tap-v1');
update public.testimonies set deleted_at = now()
  where id = '80000000-0000-4000-8000-00000000000d';

insert into public.prayers
  (id, author_id, branch_id, body, status, consent_version)
values
  ('81000000-0000-4000-8000-00000000000a', '90000000-0000-4000-8000-00000000000a',
   '00000000-0000-4000-8000-000000000001', 'tap approved request', 'approved', 'tap-v1'),
  ('81000000-0000-4000-8000-00000000000b', '90000000-0000-4000-8000-00000000000a',
   '00000000-0000-4000-8000-000000000001', 'tap pending request', 'pending', 'tap-v1');

-- === Guest =================================================================
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

-- The base tables are not merely empty to a guest: they are unreachable. This is
-- what makes the anonymity guarantee structural rather than policy-shaped.
select throws_ok(
  $$select body from public.testimonies$$,
  '42501', null, 'a guest cannot read the testimonies base table at all');
select throws_ok(
  $$select body from public.prayers$$,
  '42501', null, 'a guest cannot read the prayers base table at all');
select throws_ok(
  $$select * from public.glory_reactions$$,
  '42501', null, 'a guest cannot read reactions');
select throws_ok(
  $$select * from public.prayer_intercessions$$,
  '42501', null, 'a guest cannot read prayer commitments');
select throws_ok(
  $$select * from public.reports$$,
  '42501', null, 'a guest cannot read reports');
select throws_ok(
  $$select * from public.blocked_users$$,
  '42501', null, 'a guest cannot read block lists');
select throws_ok(
  $$insert into public.testimonies (body, consent_version) values ('rogue', 'x')$$,
  '42501', null, 'a guest cannot post a testimony');
select throws_ok(
  $$insert into public.prayers (body, consent_version) values ('rogue', 'x')$$,
  '42501', null, 'a guest cannot post a request');

-- What a guest CAN do: read the published family (guest-first, docs/spec/18).
select is(
  (select count(*) from public.testimony_feed
    where body like 'tap %')::int,
  2, 'a guest reads approved, live testimonies from every branch (Everywhere)');
select is(
  (select count(*) from public.testimony_feed
    where body like 'tap %'
      and branch_id = '00000000-0000-4000-8000-000000000001')::int,
  1, 'the My branch scope filters to one branch');
select is(
  (select count(*) from public.testimony_feed
    where body = 'tap pending glasgow')::int,
  0, 'nothing pending reaches the public feed');
select is(
  (select count(*) from public.testimony_feed
    where body = 'tap deleted glasgow')::int,
  0, 'a soft-deleted testimony leaves the public feed');
select is(
  (select count(*) from public.prayer_feed where body like 'tap %')::int,
  1, 'a guest reads approved requests only');
select ok(
  (select count(*) from public.testimony_categories where active) >= 4,
  'a guest reads the testimony categories (the compose picker is guest-visible)');

-- === Author ================================================================
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"90000000-0000-4000-8000-00000000000a","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001"}';

select is(
  (select count(*) from public.testimonies where body like 'tap %')::int,
  3, 'an author sees their own testimonies at every status, and no one else''s');
select is(
  (select count(*) from public.testimonies where body = 'tap approved berlin')::int,
  0, 'an author cannot read another member''s row from the base table');
select is(
  (select count(*) from public.prayers where body like 'tap %')::int,
  2, 'an author sees their own requests at every status');

-- === Another member ========================================================
set local request.jwt.claims to
  '{"sub":"90000000-0000-4000-8000-00000000000b","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001"}';

select is(
  (select count(*) from public.testimonies where body like 'tap %')::int,
  0, 'a member reads no one else''s base-table rows, approved or not');
select is(
  (select count(*) from public.testimony_feed where body like 'tap %')::int,
  2, 'a member reads the same public feed a guest does');

-- === Glasgow leader ========================================================
set local request.jwt.claims to
  '{"sub":"90000000-0000-4000-8000-00000000000c","role":"authenticated","user_role":"leader","branch_id":"00000000-0000-4000-8000-000000000001"}';

select is(
  (select count(*) from public.testimonies where body like 'tap %')::int,
  3, 'a leader sees every status in their own branch (the moderation queue)');
select is(
  (select count(*) from public.testimonies where body = 'tap pending glasgow')::int,
  1, 'the pending row is in their queue');
select is(
  (select count(*) from public.testimonies where body = 'tap approved berlin')::int,
  0, 'a leader sees nothing from another branch');
select is(
  (select count(*) from public.prayers where body = 'tap pending request')::int,
  1, 'the same holds for requests');

-- === Berlin leader: the branch-scope probe ================================
set local request.jwt.claims to
  '{"sub":"90000000-0000-4000-8000-00000000000d","role":"authenticated","user_role":"leader","branch_id":"00000000-0000-4000-8000-000000000002"}';

select is(
  (select count(*) from public.testimonies where body = 'tap pending glasgow')::int,
  0, 'a leader of another branch cannot see Glasgow''s queue');
-- No exception here on purpose: RLS never lets the statement reach a Glasgow row,
-- so it matches nothing and returns quietly. The assertion that matters is the one
-- below, on the row itself. (A non-moderator who CAN see the row, the author, is the
-- one who hits the trigger; that attempt lives in 009.)
select lives_ok(
  $$update public.testimonies set status = 'approved'
    where id = '80000000-0000-4000-8000-00000000000b'$$,
  'a foreign leader''s approval executes without error (zero rows under RLS)');

reset role;
set local request.jwt.claims to '{}';
select is(
  (select status from public.testimonies
    where id = '80000000-0000-4000-8000-00000000000b'),
  'pending'::public.content_status,
  'and Glasgow''s pending testimony is untouched by it');

set local role authenticated;
-- A forged branch claim buys nothing: the moderation plane reads profiles.role and
-- profiles.branch_id from the table, never the JWT (docs/spec/02 stale-claim caveat).
set local request.jwt.claims to
  '{"sub":"90000000-0000-4000-8000-00000000000d","role":"authenticated","user_role":"admin","branch_id":"00000000-0000-4000-8000-000000000001"}';
select is(
  (select count(*) from public.testimonies where body = 'tap pending glasgow')::int,
  0, 'forging user_role=admin and a foreign branch_id in the JWT changes nothing');

-- === Admin ================================================================
set local request.jwt.claims to
  '{"sub":"90000000-0000-4000-8000-00000000000e","role":"authenticated","user_role":"admin","branch_id":"00000000-0000-4000-8000-000000000001"}';

select is(
  (select count(*) from public.testimonies where body like 'tap %')::int,
  4, 'an admin sees every branch and every status');
select lives_ok(
  $$update public.testimonies set status = 'approved'
    where id = '80000000-0000-4000-8000-00000000000b'$$,
  'an admin can moderate any branch');

reset role;
set local request.jwt.claims to '{}';
select is(
  (select status from public.testimonies
    where id = '80000000-0000-4000-8000-00000000000b'),
  'approved'::public.content_status, 'the approval landed');
select is(
  (select moderated_by from public.testimonies
    where id = '80000000-0000-4000-8000-00000000000b'),
  '90000000-0000-4000-8000-00000000000e'::uuid,
  'moderated_by is stamped by the trigger, not supplied by the client');

select * from finish();
rollback;
