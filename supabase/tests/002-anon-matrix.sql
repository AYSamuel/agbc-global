-- Anonymous reads exactly what the docs/spec/02 policy matrix allows: public
-- content and config, nothing personal, and no writes anywhere.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

select is((select count(*) from public.branches)::int, 4,
  'anon reads the four seeded branches');
select is((select count(*) from public.branch_services)::int, 8,
  'anon reads the seeded service schedule');
select is((select count(*) from public.app_config)::int, 1,
  'anon reads app_config (pre-auth forced-update gate)');
select is((select count(*) from public.giving_config)::int, 1,
  'anon reads giving_config (guest giving, docs/spec/12)');
select is(
  (select value ->> 0 is not null or value is not null
     from public.app_config where key = 'minimum_supported_version'),
  true, 'minimum_supported_version is seeded');

select is((select count(*) from public.profiles)::int, 0,
  'anon sees no profiles');
select is((select count(*) from public.devices)::int, 0,
  'anon sees no devices');
select is((select count(*) from public.notification_prefs)::int, 0,
  'anon sees no notification prefs');

select throws_ok(
  $$insert into public.branches (slug, name, city, country, timezone, lat, lng)
    values ('rogue', 'Rogue', 'X', 'Y', 'Europe/London', 0, 0)$$,
  '42501', null,
  'anon cannot write branches');

select * from finish();
rollback;
