-- Anonymous reads exactly what the docs/spec/02 policy matrix allows: public
-- content and config, nothing personal, and no writes anywhere.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

-- Counted by SLUG, not as a raw total. The dashboard's test helpers create throwaway
-- branches (apps/dashboard/src/test/callers.ts createTestBranch), and an interrupted run
-- can leave one behind; a raw count then fails here for a reason that has nothing to do
-- with anon's read access, which is what this file is about.
select is(
  (select count(*) from public.branches
    where slug in ('glasgow', 'berlin', 'emmen', 'ogbomosho'))::int,
  4, 'anon reads the four seeded branches');
select is((select count(*) from public.branch_services)::int, 8,
  'anon reads the seeded service schedule');
select is((select count(*) from public.app_config)::int, 1,
  'anon reads app_config (pre-auth forced-update gate)');
select is((select count(*) from public.giving_config)::int, 1,
  'anon reads giving_config (guest giving, docs/spec/12)');
-- Pins the SHAPE the client contracts on, not merely that something is there. The
-- previous version asserted `value ->> 0 is not null or value is not null`, which is true
-- of any non-null jsonb and would have passed unchanged through the per-platform migration
-- in either direction. The gate is a hard block with no dismiss, so the one thing worth
-- asserting is that both platforms have a parseable floor (2026-07-30).
select is(
  (select (value ->> 'ios') || '/' || (value ->> 'android')
     from public.app_config where key = 'minimum_supported_version'),
  '0.0.0/0.0.0',
  'minimum_supported_version is seeded per platform, and both are parseable versions');

-- These three asserted a COUNT OF ZERO until 20260820200000, and the property they name is
-- unchanged: a guest sees no profiles, no devices and nobody's preferences. What changed is
-- WHICH LAYER says so. anon used to hold the ambient `all` grant on all three, so the answer
-- came from RLS filtering every row away; anon now holds no privilege on them at all, so the
-- answer comes from the grant and arrives as 42501 before any policy is consulted.
--
-- Asserting the refusal rather than the empty result is the stronger test, and deliberately
-- so: an empty count passes just as well when a policy has been widened and the table simply
-- happens to be empty, which is exactly how a seeded-but-unpopulated table hides a hole.
select throws_ok(
  $$select count(*) from public.profiles$$,
  '42501', null,
  'anon cannot read profiles at all: refused by the grant, before RLS is asked');
select throws_ok(
  $$select count(*) from public.devices$$,
  '42501', null,
  'nor devices');
select throws_ok(
  $$select count(*) from public.notification_prefs$$,
  '42501', null,
  'nor anybody''s notification preferences');

select throws_ok(
  $$insert into public.branches (slug, name, city, country, timezone, lat, lng)
    values ('rogue', 'Rogue', 'X', 'Y', 'Europe/London', 0, 0)$$,
  '42501', null,
  'anon cannot write branches');

select * from finish();
rollback;
