-- W3.4 slice 2: the RSVP window and the prayer cadence (20260819140000).
--
-- Two jobs, two very different risks.
--
-- The RSVP job's risk is TIME: an event moved by a leader must be announced at its new hour
-- rather than swallowed by the reminder already sent for its old one. That is the test the
-- work item names by name, and it is here.
--
-- The prayer job's risk is STOPPING. `09` gives six ways a nudge must stop and every one of
-- them is a member who would otherwise be pestered about something that is over: they
-- prayed, it was answered, it was taken down, they turned reminders off, they blocked the
-- author, or they have simply heard enough. Each gets its own assertion, because a stop
-- condition that is only in prose is a stop condition that is not enforced.
--
-- TRAP (see 009's header): `reset role` drops the ROLE but leaves `request.jwt.claims`, so
-- every privileged block below resets both. It matters more than usual here: the guards on
-- prayer_intercessions behave one way for a member and another for the service role, and a
-- leftover claim would silently test the wrong path.
--
-- TRAP (see 019): never CALL a function the current role lacks EXECUTE on; the backend
-- segfaults. The ACL assertions read the catalogue and never probe by invoking.
--
-- TRAP, and this one was paid for in this same slice: EVERY read of a batch function below
-- is scoped to this file's own fixtures. The dev seed now enrols commitments of its own, so
-- an unscoped `count(*) from prayer_reminder_batch(...)` counts whatever the machine has
-- been seeded with, and "no nudge is due in 2026-09" quietly became "two are". The same
-- shape turned 038 red an hour earlier. A count over live state is only a test if the state
-- is this file's.
begin;
create extension if not exists pgtap with schema extensions;
select plan(42);

insert into auth.users (id, email) values
  ('96000000-0000-4000-8000-00000000000a', 'nudge-a@test.local'),
  ('96000000-0000-4000-8000-00000000000b', 'nudge-b@test.local'),
  ('96000000-0000-4000-8000-00000000000c', 'nudge-c@test.local');
insert into public.profiles
  (id, email, display_name, branch_id, role, onboarded_at, age_confirmed_at)
values
  -- Berlin, so quiet hours are CEST rather than UTC and the difference is visible.
  ('96000000-0000-4000-8000-00000000000a', 'nudge-a@test.local', 'Nudge A',
   '00000000-0000-4000-8000-000000000002', 'member', now(), now()),
  ('96000000-0000-4000-8000-00000000000b', 'nudge-b@test.local', 'Nudge B',
   '00000000-0000-4000-8000-000000000002', 'member', now(), now()),
  ('96000000-0000-4000-8000-00000000000c', 'nudge-c@test.local', 'Nudge C',
   '00000000-0000-4000-8000-000000000001', 'member', now(), now());

-- ===========================================================================
-- 1. The RSVP window.
-- ===========================================================================

-- 2026-09-05 19:00 Europe/Berlin = 17:00Z. A day earlier is 2026-09-04 17:00Z, so the
-- hourly tick at 17:00Z on the 4th is the one that owes it.
insert into public.events
  (id, branch_id, title, starts_at_local, timezone, status, rsvp_enabled)
values
  ('96000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-000000000002',
   'Night of Worship', '2026-09-05 19:00', 'Europe/Berlin', 'scheduled', true),
  ('96000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-000000000002',
   'Cancelled Gathering', '2026-09-05 19:00', 'Europe/Berlin', 'cancelled', true);

insert into public.rsvps (event_id, profile_id, status) values
  ('96000000-0000-4000-8000-0000000000e1', '96000000-0000-4000-8000-00000000000a', 'going'),
  ('96000000-0000-4000-8000-0000000000e1', '96000000-0000-4000-8000-00000000000b', 'interested'),
  ('96000000-0000-4000-8000-0000000000e1', '96000000-0000-4000-8000-00000000000c', 'cancelled'),
  ('96000000-0000-4000-8000-0000000000e2', '96000000-0000-4000-8000-00000000000a', 'going');

select is(
  (select count(*)::int
   from public.rsvp_reminder_batch('2026-09-04 17:00:00+00'::timestamptz)
   where profile_id = '96000000-0000-4000-8000-00000000000a'),
  1,
  'the tick a day out owes exactly the one member who said they are going');

select is(
  (select profile_id
   from public.rsvp_reminder_batch('2026-09-04 17:00:00+00'::timestamptz)
   where profile_id = '96000000-0000-4000-8000-00000000000a'),
  '96000000-0000-4000-8000-00000000000a'::uuid,
  'and it is them: interested is a maybe, cancelled is a no');

select is(
  (select dedupe_key
   from public.rsvp_reminder_batch('2026-09-04 17:00:00+00'::timestamptz)
   where profile_id = '96000000-0000-4000-8000-00000000000a'),
  'rsvp_reminder:96000000-0000-4000-8000-0000000000e1:2026-09-05T19:00',
  'the key embeds the occurrence, per `02`');

select is(
  (select count(*)::int
   from public.rsvp_reminder_batch('2026-09-04 17:00:00+00'::timestamptz)
   where event_id = '96000000-0000-4000-8000-0000000000e2'),
  0,
  'a cancelled event is never announced as something to attend');

select is(
  (select count(*)::int
   from public.rsvp_reminder_batch('2026-09-04 17:47:00+00'::timestamptz)
   where profile_id = '96000000-0000-4000-8000-00000000000a'),
  1,
  'a run 47 minutes late scans the same hour: the window is on the grid, not on now()');

select is(
  (select count(*)::int
   from public.rsvp_reminder_batch('2026-09-04 16:00:00+00'::timestamptz)
   where profile_id = '96000000-0000-4000-8000-00000000000a'),
  0,
  'and the hour before owes nothing');

-- THE TEST THE WORK ITEM NAMES: a rescheduled event mints a new key.
update public.events set starts_at_local = '2026-09-05 20:30'
  where id = '96000000-0000-4000-8000-0000000000e1';

select is(
  (select count(*)::int
   from public.rsvp_reminder_batch('2026-09-04 17:00:00+00'::timestamptz)
   where profile_id = '96000000-0000-4000-8000-00000000000a'),
  0,
  'after a reschedule the old tick owes nothing: the event has moved');

select is(
  (select dedupe_key
   from public.rsvp_reminder_batch('2026-09-04 18:00:00+00'::timestamptz)
   where profile_id = '96000000-0000-4000-8000-00000000000a'),
  'rsvp_reminder:96000000-0000-4000-8000-0000000000e1:2026-09-05T20:30',
  'and the new hour mints a NEW key, so the old reminder cannot swallow it');

-- Transactional means transactional: nothing a member can switch suppresses this.
update public.notification_prefs
  set ministry_announcements = false, branch_updates = false, service_reminders = false,
      prayer_activity = false, prayer_reminders = false, testimony_activity = false
  where profile_id = '96000000-0000-4000-8000-00000000000a';

select is(
  (select count(*)::int
   from public.rsvp_reminder_batch('2026-09-04 18:00:00+00'::timestamptz)
   where profile_id = '96000000-0000-4000-8000-00000000000a'),
  1,
  'every pref off and the RSVP reminder still stands: it answers what they did (docs/spec/15)');

-- Back on, so the prayer section below is not silently testing a member who switched
-- everything off two screens ago.
update public.notification_prefs
  set ministry_announcements = true, branch_updates = true, service_reminders = true,
      prayer_activity = true, prayer_reminders = true, testimony_activity = true
  where profile_id = '96000000-0000-4000-8000-00000000000a';

update public.profiles set deleted_at = now()
  where id = '96000000-0000-4000-8000-00000000000a';
select is(
  (select count(*)::int
   from public.rsvp_reminder_batch('2026-09-04 18:00:00+00'::timestamptz)
   where profile_id = '96000000-0000-4000-8000-00000000000a'),
  0,
  'a deleted account is reminded of nothing at all');
update public.profiles set deleted_at = null
  where id = '96000000-0000-4000-8000-00000000000a';

-- ===========================================================================
-- 2. The cadence itself.
-- ===========================================================================

select is(
  public.prayer_reminder_next('2026-08-19 09:00:00+00'::timestamptz, 0),
  '2026-08-20 09:00:00+00'::timestamptz,
  'enrolment asks for nudge one and gets day 1');
select is(
  public.prayer_reminder_next('2026-08-19 09:00:00+00'::timestamptz, 1),
  '2026-08-22 09:00:00+00'::timestamptz,
  'after one nudge, day 3 (measured from the commitment, not from the nudge)');
select is(
  public.prayer_reminder_next('2026-08-19 09:00:00+00'::timestamptz, 2),
  '2026-08-26 09:00:00+00'::timestamptz,
  'after two, day 7');
select is(
  public.prayer_reminder_next('2026-08-19 09:00:00+00'::timestamptz, 3),
  null,
  'and after three there is no fourth: NULL is the hard cap (docs/spec/09)');

-- ===========================================================================
-- 3. Enrolment happens at the tap, by the guard, not by the job.
-- ===========================================================================

insert into public.prayers
  (id, author_id, branch_id, body, status, consent_version)
values
  ('96000000-0000-4000-8000-0000000000a1', '96000000-0000-4000-8000-00000000000c',
   '00000000-0000-4000-8000-000000000001', 'nudge fixture request', 'approved',
   'content-share-v1');

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"96000000-0000-4000-8000-00000000000a","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000002"}';

select lives_ok(
  $$insert into public.prayer_intercessions (prayer_id, profile_id)
    values ('96000000-0000-4000-8000-0000000000a1',
            '96000000-0000-4000-8000-00000000000a')$$,
  'a member taps "I will pray"');

select is(
  (select next_reminder_at is not null from public.prayer_intercessions
   where prayer_id = '96000000-0000-4000-8000-0000000000a1'
     and profile_id = '96000000-0000-4000-8000-00000000000a'),
  true,
  'and is enrolled in the cadence by the same act (docs/spec/09)');

select throws_ok(
  $$update public.prayer_intercessions set next_reminder_at = now() + interval '99 days'
    where profile_id = '96000000-0000-4000-8000-00000000000a'$$,
  '23514',
  'the reminder schedule is server-controlled',
  'and cannot then silence or reschedule their own nudges');

reset role;
set local request.jwt.claims to '{}';

-- ===========================================================================
-- 4. Who is due, and every way it stops.
-- ===========================================================================

-- Backdate the commitment so its first nudge is due, and stand the clock at a Berlin
-- mid-morning so quiet hours are satisfied.
update public.prayer_intercessions
  set committed_at = '2026-08-18 09:00:00+00',
      next_reminder_at = '2026-08-19 09:00:00+00'
  where profile_id = '96000000-0000-4000-8000-00000000000a';

select is(
  (select count(*)::int
   from public.prayer_reminder_batch('2026-08-19 09:30:00+00'::timestamptz)
   where profile_id = '96000000-0000-4000-8000-00000000000a'),
  1,
  'a due commitment, in daylight, is owed a nudge');

select is(
  (select dedupe_key
   from public.prayer_reminder_batch('2026-08-19 09:30:00+00'::timestamptz)
   where profile_id = '96000000-0000-4000-8000-00000000000a'),
  'prayer_reminder:'
    || (select id::text from public.prayer_intercessions
        where profile_id = '96000000-0000-4000-8000-00000000000a')
    || ':1',
  'and the key names WHICH nudge of the cadence this is');

select is(
  (select count(*)::int
   from public.prayer_reminder_batch('2026-08-19 08:00:00+00'::timestamptz)
   where profile_id = '96000000-0000-4000-8000-00000000000a'),
  0,
  'an hour before it is due, nothing');

-- Quiet hours: 03:00Z is 05:00 in Berlin, outside 08:00-21:00 local.
select is(
  (select count(*)::int
   from public.prayer_reminder_batch('2026-08-20 03:00:00+00'::timestamptz)
   where profile_id = '96000000-0000-4000-8000-00000000000a'),
  0,
  'a nudge due at 05:00 Berlin waits: quiet hours are the member''s clock, not ours');

select is(
  (select count(*)::int
   from public.prayer_reminder_batch('2026-08-20 07:00:00+00'::timestamptz)
   where profile_id = '96000000-0000-4000-8000-00000000000a'),
  1,
  'and it goes out at the first hour inside the window, still owed');

-- Stop 1: the member prayed.
-- Service-role shaped, so the CHECK has to be satisfied by hand: the guard only fills
-- prayed_at for a member's own tap.
update public.prayer_intercessions set state = 'prayed', prayed_at = now(),
       next_reminder_at = null
  where profile_id = '96000000-0000-4000-8000-00000000000a';
select is(
  (select count(*)::int
   from public.prayer_reminder_batch('2026-08-19 09:30:00+00'::timestamptz)
   where profile_id = '96000000-0000-4000-8000-00000000000a'),
  0,
  'STOP: "I prayed" ends the nudges (docs/spec/09)');
update public.prayer_intercessions
  set state = 'committed', prayed_at = null,
      next_reminder_at = '2026-08-19 09:00:00+00'
  where profile_id = '96000000-0000-4000-8000-00000000000a';

-- Stop 2: the request was answered.
update public.prayers set answered_at = now()
  where id = '96000000-0000-4000-8000-0000000000a1';
select is(
  (select count(*)::int
   from public.prayer_reminder_batch('2026-08-19 09:30:00+00'::timestamptz)
   where profile_id = '96000000-0000-4000-8000-00000000000a'),
  0,
  'STOP: an answered request is no longer something to be nudged about');
update public.prayers set answered_at = null
  where id = '96000000-0000-4000-8000-0000000000a1';

-- Stop 3: the request left the feed.
update public.prayers set deleted_at = now()
  where id = '96000000-0000-4000-8000-0000000000a1';
select is(
  (select count(*)::int
   from public.prayer_reminder_batch('2026-08-19 09:30:00+00'::timestamptz)
   where profile_id = '96000000-0000-4000-8000-00000000000a'),
  0,
  'STOP: a withdrawn request stops nudging, and the deep link would go nowhere');
update public.prayers set deleted_at = null
  where id = '96000000-0000-4000-8000-0000000000a1';

update public.prayers set status = 'pending'
  where id = '96000000-0000-4000-8000-0000000000a1';
select is(
  (select count(*)::int
   from public.prayer_reminder_batch('2026-08-19 09:30:00+00'::timestamptz)
   where profile_id = '96000000-0000-4000-8000-00000000000a'),
  0,
  'STOP: a request pulled back into moderation stops too');
update public.prayers set status = 'approved'
  where id = '96000000-0000-4000-8000-0000000000a1';

-- Stop 4: the member turned reminders off. The pref read is `prayer_reminders`, the column
-- `15`'s tier table names, NOT `prayer_activity` which the channel routing uses.
update public.notification_prefs set prayer_reminders = false, prayer_activity = true
  where profile_id = '96000000-0000-4000-8000-00000000000a';
select is(
  (select count(*)::int
   from public.prayer_reminder_batch('2026-08-19 09:30:00+00'::timestamptz)
   where profile_id = '96000000-0000-4000-8000-00000000000a'),
  0,
  'STOP: prayer_reminders off, even with prayer_activity on (docs/spec/15 tier table)');
update public.notification_prefs set prayer_reminders = true
  where profile_id = '96000000-0000-4000-8000-00000000000a';

delete from public.notification_prefs
  where profile_id = '96000000-0000-4000-8000-00000000000a';
select is(
  (select count(*)::int
   from public.prayer_reminder_batch('2026-08-19 09:30:00+00'::timestamptz)
   where profile_id = '96000000-0000-4000-8000-00000000000a'),
  1,
  'an absent prefs row is the column defaults, so absent is yes (docs/spec/02)');

-- Stop 5: a block, in either direction.
insert into public.blocked_users (blocker_id, blocked_id) values
  ('96000000-0000-4000-8000-00000000000a', '96000000-0000-4000-8000-00000000000c');
select is(
  (select count(*)::int
   from public.prayer_reminder_batch('2026-08-19 09:30:00+00'::timestamptz)
   where profile_id = '96000000-0000-4000-8000-00000000000a'),
  0,
  'STOP: nudging you to pray for someone you blocked, into a feed that hides them');
delete from public.blocked_users
  where blocker_id = '96000000-0000-4000-8000-00000000000a';

insert into public.blocked_users (blocker_id, blocked_id) values
  ('96000000-0000-4000-8000-00000000000c', '96000000-0000-4000-8000-00000000000a');
select is(
  (select count(*)::int
   from public.prayer_reminder_batch('2026-08-19 09:30:00+00'::timestamptz)
   where profile_id = '96000000-0000-4000-8000-00000000000a'),
  0,
  'and the other direction too, which the member cannot even see (docs/spec/15)');
delete from public.blocked_users
  where blocker_id = '96000000-0000-4000-8000-00000000000c';

-- ===========================================================================
-- 5. Advancing, and the cap that ends it.
-- ===========================================================================

select is(
  public.advance_prayer_reminders(
    array(select id from public.prayer_intercessions
          where profile_id = '96000000-0000-4000-8000-00000000000a')),
  1,
  'the run advances the commitment it just nudged');

select is(
  (select reminder_count from public.prayer_intercessions
   where profile_id = '96000000-0000-4000-8000-00000000000a'),
  1,
  'one nudge has now been sent');
select is(
  (select next_reminder_at from public.prayer_intercessions
   where profile_id = '96000000-0000-4000-8000-00000000000a'),
  '2026-08-21 09:00:00+00'::timestamptz,
  'and the next is day 3 FROM THE COMMITMENT, so a held-back nudge never drags the rest');

select is(
  public.advance_prayer_reminders(
    array(select id from public.prayer_intercessions
          where profile_id = '96000000-0000-4000-8000-00000000000a'))
  + public.advance_prayer_reminders(
    array(select id from public.prayer_intercessions
          where profile_id = '96000000-0000-4000-8000-00000000000a')),
  2,
  'twice more, and the cadence has spent all three');

select is(
  (select next_reminder_at from public.prayer_intercessions
   where profile_id = '96000000-0000-4000-8000-00000000000a'),
  null,
  'the cap takes the commitment off the cadence rather than nudging forever');

select is(
  (select count(*)::int
   from public.prayer_reminder_batch('2026-09-30 09:30:00+00'::timestamptz)
   where profile_id = '96000000-0000-4000-8000-00000000000a'),
  0,
  'STOP: capped, so no clock ever makes it due again');

select is(
  public.advance_prayer_reminders('{}'::uuid[]),
  0,
  'an empty batch advances nothing rather than erroring');

-- ===========================================================================
-- 6. The schedules, and who may run any of this.
-- ===========================================================================

select is(
  (select count(*)::int from cron.job where jobname in ('rsvp-reminders', 'prayer-reminders')),
  2,
  'both jobs are scheduled exactly once each');

select is(
  (select command from cron.job where jobname = 'prayer-reminders'),
  'select jobs.invoke_edge_function(''prayer-reminders'')',
  'and go through the vault-reading invoker, not a hardcoded URL (ADR 0016)');

select is(has_function_privilege('authenticated',
  'public.prayer_reminder_batch(timestamptz)', 'execute'), false,
  'a member cannot enumerate who is committed to pray for whom');
select is(has_function_privilege('authenticated',
  'public.advance_prayer_reminders(uuid[])', 'execute'), false,
  'nor move anybody''s cadence, including their own');
select is(has_function_privilege('anon',
  'public.rsvp_reminder_batch(timestamptz, integer, integer)', 'execute'), false,
  'and a guest reaches none of it');

select * from finish();
rollback;
