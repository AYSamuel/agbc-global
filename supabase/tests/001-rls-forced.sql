-- Every W0.10 table ships with RLS enabled AND forced in the same migration
-- (docs/spec/25 §3: never "policies later").
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select is(
  (select relrowsecurity from pg_class where oid = 'public.branches'::regclass),
  true, 'branches: RLS enabled');
select is(
  (select relforcerowsecurity from pg_class where oid = 'public.branches'::regclass),
  true, 'branches: RLS forced');

select is(
  (select relrowsecurity from pg_class where oid = 'public.branch_services'::regclass),
  true, 'branch_services: RLS enabled');
select is(
  (select relforcerowsecurity from pg_class where oid = 'public.branch_services'::regclass),
  true, 'branch_services: RLS forced');

select is(
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  true, 'profiles: RLS enabled');
select is(
  (select relforcerowsecurity from pg_class where oid = 'public.profiles'::regclass),
  true, 'profiles: RLS forced');

select is(
  (select relrowsecurity from pg_class where oid = 'public.devices'::regclass),
  true, 'devices: RLS enabled');
select is(
  (select relforcerowsecurity from pg_class where oid = 'public.devices'::regclass),
  true, 'devices: RLS forced');

select is(
  (select relrowsecurity from pg_class where oid = 'public.notification_prefs'::regclass),
  true, 'notification_prefs: RLS enabled');
select is(
  (select relforcerowsecurity from pg_class where oid = 'public.notification_prefs'::regclass),
  true, 'notification_prefs: RLS forced');

select is(
  (select relrowsecurity from pg_class where oid = 'public.app_config'::regclass),
  true, 'app_config: RLS enabled');
select is(
  (select relforcerowsecurity from pg_class where oid = 'public.giving_config'::regclass),
  true, 'giving_config: RLS forced');

select * from finish();
rollback;
