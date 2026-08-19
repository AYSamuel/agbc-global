-- W3.4 slice 1: the delivery seam and the service-reminder window (20260819120000).
--
-- The TypeScript half (rendering, channels, which ticket prunes which device) is covered by
-- deno tests. What is asserted here is everything TypeScript cannot see: that the insert is
-- genuinely the claim on a send, that a member with no device still gets a row, and that the
-- window lands on the right instant in four timezones and on both sides of a DST boundary.
--
-- TIME IS THE RISK IN THIS ITEM, so the clock is an argument rather than `now()` and every
-- assertion below stands at a fixed instant. 2026-08-23 is a Sunday; 2026-10-25 is the
-- European fall-back Sunday; 2027-03-28 is the spring-forward Sunday.
--
-- TRAP (see 019): never CALL a function the current role lacks EXECUTE on; the backend
-- segfaults. The ACL assertions read the catalogue and never probe by invoking.
--
-- TRAP (002): that file asserts exactly 8 `branch_services` rows. The fixtures below are
-- inside this transaction and roll back with it, so they are invisible to it; a fixture
-- added to the DEV database by hand would not be.
begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

-- Glasgow is branch 1 (Europe/London), Berlin 2 (Europe/Berlin), Emmen 3
-- (Europe/Amsterdam), Ogbomosho 4 (Africa/Lagos): four zones, three of which observe DST
-- and one of which never has.
insert into auth.users (id, email) values
  ('97000000-0000-4000-8000-00000000000a', 'rem-a@test.local'),
  ('97000000-0000-4000-8000-00000000000b', 'rem-b@test.local'),
  ('97000000-0000-4000-8000-00000000000c', 'rem-c@test.local');
insert into public.profiles (id, email, display_name, branch_id, language) values
  ('97000000-0000-4000-8000-00000000000a', 'rem-a@test.local', 'Rem A',
   '00000000-0000-4000-8000-000000000002', 'de'),
  ('97000000-0000-4000-8000-00000000000b', 'rem-b@test.local', 'Rem B',
   '00000000-0000-4000-8000-000000000002', 'en'),
  ('97000000-0000-4000-8000-00000000000c', 'rem-c@test.local', 'Rem C',
   '00000000-0000-4000-8000-000000000004', 'en');
insert into public.devices (id, profile_id, expo_push_token, platform) values
  ('97000000-0000-4000-8000-0000000000d1',
   '97000000-0000-4000-8000-00000000000a', 'ExponentPushToken[rem-a1]', 'android'),
  ('97000000-0000-4000-8000-0000000000d2',
   '97000000-0000-4000-8000-00000000000a', 'ExponentPushToken[rem-a2]', 'ios');
-- Rem B deliberately has NO device: the seam must still write their row.

-- ===========================================================================
-- 1. The seam: the insert is the claim.
-- ===========================================================================

select is(
  (select count(*)::int from public.deliver_notifications(
    jsonb_build_array(jsonb_build_object(
      'profile_id', '97000000-0000-4000-8000-00000000000a',
      'type', 'service_reminder',
      'template_key', 'service.starts_soon',
      'params', jsonb_build_object('branch', 'AGBC Lighthouse Berlin'),
      'deep_link', '/home',
      'dedupe_key', 'service_reminder:test:2026-08-23T11:00'
    )))),
  2,
  'a member with two devices comes back once per device');

select is(
  (select count(*)::int from public.notifications
   where dedupe_key = 'service_reminder:test:2026-08-23T11:00'
     and profile_id = '97000000-0000-4000-8000-00000000000a'),
  1,
  'and exactly one notification row was written for them');

select is(
  (select language from public.deliver_notifications(
    jsonb_build_array(jsonb_build_object(
      'profile_id', '97000000-0000-4000-8000-00000000000a',
      'type', 'service_reminder',
      'template_key', 'service.starts_soon',
      'params', '{}'::jsonb,
      'deep_link', '/home',
      'dedupe_key', 'service_reminder:test:2026-08-23T11:00'
    ))) limit 1),
  null,
  're-running the SAME key returns nothing: the row is already claimed');

select is(
  (select count(*)::int from public.notifications
   where dedupe_key = 'service_reminder:test:2026-08-23T11:00'
     and profile_id = '97000000-0000-4000-8000-00000000000a'),
  1,
  'and no second row was written (the partial unique is the guarantee, ADR 0022)');

select is(
  (select count(*)::int from public.deliver_notifications(
    jsonb_build_array(jsonb_build_object(
      'profile_id', '97000000-0000-4000-8000-00000000000b',
      'type', 'service_reminder',
      'template_key', 'service.starts_soon',
      'params', '{}'::jsonb,
      'deep_link', '/home',
      'dedupe_key', 'service_reminder:test:2026-08-23T11:00'
    )))),
  1,
  'a member with NO device still comes back: the row is what matters');

select is(
  (select expo_push_token from public.deliver_notifications(
    jsonb_build_array(jsonb_build_object(
      'profile_id', '97000000-0000-4000-8000-00000000000b',
      'type', 'service_reminder',
      'template_key', 'service.starts_soon',
      'params', '{}'::jsonb,
      'deep_link', '/home',
      'dedupe_key', 'service_reminder:test:2026-08-23T18:00'
    ))) limit 1),
  null,
  'with a null token, so the caller knows there is nothing to push');

select is(
  (select params ->> 'branch' from public.notifications
   where dedupe_key = 'service_reminder:test:2026-08-23T11:00'
     and profile_id = '97000000-0000-4000-8000-00000000000a'),
  'AGBC Lighthouse Berlin',
  'params are stored, not rendered words (docs/spec/15 localization rule)');

select is(
  (select title from public.notifications
   where dedupe_key = 'service_reminder:test:2026-08-23T11:00'
     and profile_id = '97000000-0000-4000-8000-00000000000a'),
  null,
  'and no baked English string is written anywhere on the row');

-- The same key, twice, inside ONE call. ON CONFLICT cannot see rows inserted by its own
-- statement, so the function DISTINCTs first; without that this is either a duplicate or a
-- unique violation, and both are worse than a no-op.
select is(
  (select count(*)::int from public.deliver_notifications(
    jsonb_build_array(
      jsonb_build_object(
        'profile_id', '97000000-0000-4000-8000-00000000000c',
        'type', 'service_reminder', 'template_key', 'service.starts_soon',
        'params', '{}'::jsonb, 'deep_link', '/home',
        'dedupe_key', 'service_reminder:dupe:2026-08-23T11:00'),
      jsonb_build_object(
        'profile_id', '97000000-0000-4000-8000-00000000000c',
        'type', 'service_reminder', 'template_key', 'service.starts_soon',
        'params', '{}'::jsonb, 'deep_link', '/home',
        'dedupe_key', 'service_reminder:dupe:2026-08-23T11:00')
    ))),
  1,
  'the same key twice in one call writes one row, not two and not an error');

select is(
  (select count(*)::int from public.deliver_notifications('[]'::jsonb)),
  0,
  'an empty batch is a no-op rather than an error');

-- ===========================================================================
-- 2. The window: one branch, one hour, four zones.
-- ===========================================================================

-- Glasgow's seeded Sunday service is 12:00 local. In August that is 11:00Z, so the run at
-- 10:00Z (lead 60, tick 15) is the one that owes it.
select is(
  (select count(distinct branch_id)::int
   from public.service_reminder_batch('2026-08-23 10:00:00+00'::timestamptz)),
  1,
  'the 10:00Z tick owes exactly one branch: Glasgow at 12:00 BST');

select is(
  (select distinct dedupe_key
   from public.service_reminder_batch('2026-08-23 10:00:00+00'::timestamptz)),
  'service_reminder:00000000-0000-4000-8000-000000000001:2026-08-23T12:00',
  'and its key carries the branch, the date AND the local start time');

select ok(
  exists (select 1 from public.service_reminder_batch('2026-08-23 08:00:00+00'::timestamptz)
          where branch_id = '00000000-0000-4000-8000-000000000002')
  and exists (select 1 from public.service_reminder_batch('2026-08-23 08:00:00+00'::timestamptz)
          where branch_id = '00000000-0000-4000-8000-000000000003'),
  'the 08:00Z tick owes Berlin and Emmen, both at 11:00 CEST');

select is(
  (select count(distinct branch_id)::int
   from public.service_reminder_batch('2026-08-23 09:00:00+00'::timestamptz)),
  1,
  'and the 09:00Z tick owes only Ogbomosho: 11:00 WAT is an hour behind 11:00 CEST');

-- The grid. A run four, seven or fourteen minutes late must scan the window its tick owned;
-- a window computed from now() would have walked past the occurrence and lost it forever.
select is(
  (select count(*)::int
   from public.service_reminder_batch('2026-08-23 09:14:00+00'::timestamptz)),
  (select count(*)::int
   from public.service_reminder_batch('2026-08-23 09:00:00+00'::timestamptz)),
  'a run 14 minutes late scans the same window an on-time run would have');

select is(
  (select count(*)::int
   from public.service_reminder_batch('2026-08-23 09:15:00+00'::timestamptz)),
  0,
  'and the next grid slot has moved on: no occurrence is announced twice by the clock');

select is(
  (select count(*)::int
   from public.service_reminder_batch('2026-08-22 10:00:00+00'::timestamptz)),
  0,
  'Saturday owes nothing: the weekday has to match');

-- ===========================================================================
-- 3. DST, from both sides, with services placed inside the transitions.
-- ===========================================================================

-- Fall-back: 2026-10-25, Europe/Berlin. 02:30 local happens twice; `02` says the earlier
-- UTC offset wins, which is 00:30Z... measured: 01:30Z (CEST, +02:00), the earlier offset.
insert into public.branch_services
  (id, branch_id, weekday, start_time, kind, duration_min, label)
values
  ('97000000-0000-4000-8000-0000000000f1',
   '00000000-0000-4000-8000-000000000002', 0, '02:30', 'midweek', 60, 'Ambiguous');

select is(
  (select dedupe_key
   from public.service_reminder_batch('2026-10-25 00:30:00+00'::timestamptz)
   where profile_id = '97000000-0000-4000-8000-00000000000a'
     and start_time = '02:30'),
  'service_reminder:00000000-0000-4000-8000-000000000002:2026-10-25T02:30',
  'the ambiguous 02:30 is announced from the EARLIER offset (docs/spec/02)');

select is(
  (select count(*)::int
   from public.service_reminder_batch('2026-10-25 01:30:00+00'::timestamptz)
   where start_time = '02:30'),
  0,
  'and NOT again an hour later, when 02:30 local comes round the second time');

-- Spring-forward: 2027-03-28, Europe/Berlin. 02:30 local does not exist; Postgres resolves
-- it forward to 01:30Z (03:30 CEST), so the occurrence is announced once rather than lost.
select is(
  (select count(*)::int
   from public.service_reminder_batch('2027-03-28 00:30:00+00'::timestamptz)
   where profile_id = '97000000-0000-4000-8000-00000000000a'
     and start_time = '02:30'),
  1,
  'a service in the spring-forward gap is still announced, exactly once');

delete from public.branch_services
  where id = '97000000-0000-4000-8000-0000000000f1';

-- ===========================================================================
-- 4. Two services on one date, which is the reason the key carries the time.
-- ===========================================================================

insert into public.branch_services
  (id, branch_id, weekday, start_time, kind, duration_min, label)
values
  ('97000000-0000-4000-8000-0000000000f2',
   '00000000-0000-4000-8000-000000000002', 0, '18:00', 'sunday', 90, 'Evening');

select is(
  (select distinct dedupe_key
   from public.service_reminder_batch('2026-08-23 15:00:00+00'::timestamptz)
   where branch_id = '00000000-0000-4000-8000-000000000002'),
  'service_reminder:00000000-0000-4000-8000-000000000002:2026-08-23T18:00',
  'the evening service mints its OWN key, so the morning one cannot swallow it');

select isnt(
  (select distinct dedupe_key
   from public.service_reminder_batch('2026-08-23 15:00:00+00'::timestamptz)
   where branch_id = '00000000-0000-4000-8000-000000000002'),
  (select distinct dedupe_key
   from public.service_reminder_batch('2026-08-23 08:00:00+00'::timestamptz)
   where branch_id = '00000000-0000-4000-8000-000000000002'),
  'two services on one date at one branch are two different occurrences');

delete from public.branch_services
  where id = '97000000-0000-4000-8000-0000000000f2';

-- ===========================================================================
-- 5. Who is in the batch, and who is not.
-- ===========================================================================

update public.notification_prefs set service_reminders = false
  where profile_id = '97000000-0000-4000-8000-00000000000a';

select is(
  (select count(*)::int
   from public.service_reminder_batch('2026-08-23 08:00:00+00'::timestamptz)
   where profile_id = '97000000-0000-4000-8000-00000000000a'),
  0,
  'a member who turned service reminders off is not in the batch at all');

select ok(
  exists (select 1 from public.service_reminder_batch('2026-08-23 08:00:00+00'::timestamptz)
          where profile_id = '97000000-0000-4000-8000-00000000000b'),
  'their neighbour, who did not, still is');

delete from public.notification_prefs
  where profile_id = '97000000-0000-4000-8000-00000000000b';

select ok(
  exists (select 1 from public.service_reminder_batch('2026-08-23 08:00:00+00'::timestamptz)
          where profile_id = '97000000-0000-4000-8000-00000000000b'),
  'an ABSENT prefs row means the column defaults, so absent is yes (docs/spec/02)');

update public.profiles set deleted_at = now()
  where id = '97000000-0000-4000-8000-00000000000b';

select is(
  (select count(*)::int
   from public.service_reminder_batch('2026-08-23 08:00:00+00'::timestamptz)
   where profile_id = '97000000-0000-4000-8000-00000000000b'),
  0,
  'a deleted account is not reminded of anything');

update public.profiles set deleted_at = null
  where id = '97000000-0000-4000-8000-00000000000b';

update public.branches set status = 'archived'
  where id = '00000000-0000-4000-8000-000000000002';

select is(
  (select count(*)::int
   from public.service_reminder_batch('2026-08-23 08:00:00+00'::timestamptz)
   where branch_id = '00000000-0000-4000-8000-000000000002'),
  0,
  'an archived branch stops announcing services nobody holds');

update public.branches set status = 'active'
  where id = '00000000-0000-4000-8000-000000000002';

-- ===========================================================================
-- 6. The schedule, and who may run any of this.
-- ===========================================================================

select is(
  (select count(*)::int from cron.job where jobname = 'service-reminders'),
  1,
  'the job is scheduled exactly once (cron.schedule upserts by name)');

select is(
  (select command from cron.job where jobname = 'service-reminders'),
  'select jobs.invoke_edge_function(''service-reminders'')',
  'and it goes through the vault-reading invoker, not a hardcoded URL (ADR 0016)');

select is(
  (select schedule from cron.job where jobname = 'service-reminders'),
  '1,16,31,46 * * * *',
  'every 15 minutes, on the same grid the batch function floors to');

select is(has_function_privilege('authenticated',
  'public.deliver_notifications(jsonb)', 'execute'), false,
  'a member cannot write themselves a notification');
select is(has_function_privilege('anon',
  'public.deliver_notifications(jsonb)', 'execute'), false,
  'and neither can a guest');
select is(has_function_privilege('authenticated',
  'public.service_reminder_batch(timestamptz, integer, integer)', 'execute'), false,
  'a member cannot enumerate who is being reminded of what');

select * from finish();
rollback;
