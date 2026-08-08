-- The rhythm domain (W2.8, migration 20260807120000): attendance, streaks, milestones.
--
-- What this file is really about is TIME, in three separable pieces, because conflating them
-- is how a streak ends up shaming somebody for a clock change:
--
--   1. The timezone acts ONCE, at write time, in the branch attended. Asked directly of
--      attendance_service_date(), including both of 2026's UK and EU clock changes, which the
--      trigger itself can never be asked about (the 72-hour clamp puts historical instants out
--      of its reach).
--   2. The clamp decides WHICH instant that is. A device clock is not evidence: an offline
--      replay from within 72 hours is honoured, anything older or ahead is not.
--   3. Week maths is then pure DATE arithmetic, so it has no timezone and no DST case at all.
--      Grace covers one missed week; two end the run (decided 2026-08-07).
--
-- Everything is anchored to now() or to a branch's own local clock rather than to a written
-- date, so nothing here starts failing in November.
--
-- Privileges are asserted with has_function_privilege and never by attempting a call: calling
-- a function you lack EXECUTE on takes down the whole backend on this local stack.

begin;
create extension if not exists pgtap with schema extensions;
select plan(51);

\set glasgow '00000000-0000-4000-8000-000000000001'
\set emmen '00000000-0000-4000-8000-000000000003'

\set member 'a0000000-0000-4000-8000-0000000000a1'
\set grace_member 'a0000000-0000-4000-8000-0000000000a2'
\set lapsed_member 'a0000000-0000-4000-8000-0000000000a3'
\set author 'a0000000-0000-4000-8000-0000000000a4'

insert into auth.users (id, email) values
  (:'member', 't030-member@test.local'),
  (:'grace_member', 't030-grace@test.local'),
  (:'lapsed_member', 't030-lapsed@test.local'),
  (:'author', 't030-author@test.local');

insert into public.profiles (id, email, display_name, branch_id, role, onboarded_at) values
  (:'member', 't030-member@test.local', 'T030 Member', :'glasgow', 'member', now()),
  (:'grace_member', 't030-grace@test.local', 'T030 Grace', :'glasgow', 'member', now()),
  (:'lapsed_member', 't030-lapsed@test.local', 'T030 Lapsed', :'glasgow', 'member', now()),
  (:'author', 't030-author@test.local', 'T030 Author', :'glasgow', 'member', now());

-- --- 1. the timezone acts once, and it is the only place DST can bite ------------------------

-- The UK and the EU change clocks on the same Sunday but an hour apart, which is exactly the
-- pair that catches a naive implementation.
select is(
  public.attendance_service_date(
    (timestamp '2026-03-29 01:30' at time zone 'Europe/London'), 'Europe/London'),
  date '2026-03-29',
  'a service during the UK spring-forward hour is that Sunday');

select is(
  public.attendance_service_date(
    (timestamp '2026-10-25 01:30' at time zone 'Europe/London'), 'Europe/London'),
  date '2026-10-25',
  'and so is one during the ambiguous autumn hour, when 01:30 happens twice');

-- 23:30 by Glasgow's own clock, whatever the season, is already tomorrow in Emmen: the same
-- instant, two different service days. Anchored to a local clock rather than to a UTC hour, so
-- it holds in March and in November.
select is(
  public.attendance_service_date(
    (timestamp '2026-11-15 23:30' at time zone 'Europe/London'), 'Europe/Amsterdam'),
  date '2026-11-16',
  'the same instant is the next day in a branch an hour ahead');

select is(
  public.attendance_service_date(
    (timestamp '2026-11-15 23:30' at time zone 'Europe/London'), 'Europe/London'),
  date '2026-11-15',
  'while at home it is still Sunday');

-- The Nigerian branch keeps WAT all year, which is the case a Europe-only implementation
-- passes by accident and then gets wrong the moment Europe changes clocks under it.
select is(
  public.attendance_service_date(
    (timestamp '2026-01-11 10:00' at time zone 'Africa/Lagos'), 'Africa/Lagos'),
  date '2026-01-11',
  'a branch with no DST at all is unaffected by anybody else''s clock change');

-- --- 2. the clamp: a device clock is not evidence --------------------------------------------

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "a0000000-0000-4000-8000-0000000000a1", "role": "authenticated", "user_role": "member", "branch_id": "00000000-0000-4000-8000-000000000001"}';

-- Yesterday's tap, replayed from the offline queue now: it counts for yesterday.
--
-- Anchored to yesterday's DATE at midday rather than "20 hours ago", which is only yesterday
-- when the suite runs before 20:00. After that it lands on today, collides with the clamped
-- row below on `unique(profile_id, service_date)`, and the whole file dies at test 7 (found
-- 2026-08-07, running at 21:15 local). A test whose result depends on the hour it runs at is
-- a flake with a schedule, and this one would have started failing every evening.
\set yesterday_tap '(current_date - 1 + time ''12:00'') at time zone ''Europe/London'''
insert into public.attendance (profile_id, branch_id, client_taken_at)
values (:'member', :'glasgow', :yesterday_tap);
select is(
  (select service_date from public.attendance
    where profile_id = :'member' order by service_date desc limit 1),
  public.attendance_service_date(:yesterday_tap, 'Europe/London'),
  'an offline replay from within 72 hours lands on the day actually attended');
select is(
  (select service_date from public.attendance
    where profile_id = :'member' order by service_date desc limit 1),
  current_date - 1,
  'and that day is yesterday, whatever hour the suite runs at');

-- Ten days back is not a replay, it is a claim about last week.
insert into public.attendance (profile_id, branch_id, client_taken_at)
values (:'member', :'glasgow', now() - interval '10 days');
select is(
  (select count(*)::int from public.attendance
    where profile_id = :'member'
      and service_date = public.attendance_service_date(now() - interval '10 days', 'Europe/London')),
  0, 'a claim older than 72 hours cannot backdate attendance');

select is(
  (select count(*)::int from public.attendance
    where profile_id = :'member' and service_date = current_date),
  1, 'it falls back to the server''s clock instead');

-- And the device's claim is kept even when it was not believed: it is evidence, not authority.
select is(
  (select (client_taken_at < now() - interval '9 days') from public.attendance
    where profile_id = :'member' and service_date = current_date),
  true, 'the unbelieved claim is still recorded on the row');

reset role;
select set_config('request.jwt.claims', '', true);

-- A tomorrow-stamped tap is a wrong clock, not a prophecy. Its own member, because the
-- fallback lands on today and today is already taken above.
\set clock_member 'a0000000-0000-4000-8000-0000000000a6'
insert into auth.users (id, email) values (:'clock_member', 't030-clock@test.local');
insert into public.profiles (id, email, display_name, branch_id, role, onboarded_at)
values (:'clock_member', 't030-clock@test.local', 'T030 Fast Clock', :'glasgow', 'member', now());

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "a0000000-0000-4000-8000-0000000000a6", "role": "authenticated", "user_role": "member", "branch_id": "00000000-0000-4000-8000-000000000001"}';

insert into public.attendance (profile_id, branch_id, client_taken_at)
values (:'clock_member', :'glasgow', now() + interval '2 days');

select is(
  (select service_date from public.attendance where profile_id = :'clock_member'),
  public.attendance_service_date(now(), 'Europe/London'),
  'a device claiming tomorrow is recorded today');

reset role;
select set_config('request.jwt.claims', '', true);

-- --- 3. week maths: grace covers one, two end the run ----------------------------------------
--
-- Written as trusted inserts with explicit dates, which is the only way to state history: as a
-- member every one of these would be clamped to today, which is the point of the clamp.

-- Four weeks, one missed, then back.
insert into public.attendance (profile_id, branch_id, service_date, client_taken_at)
select :'grace_member', :'glasgow',
       (date_trunc('week', current_date) - (w || ' weeks')::interval)::date + 6, now()
from unnest(array[5, 4, 3, 2, 0]) as w;

select is(
  (select current_weeks from public.streaks where profile_id = :'grace_member'),
  5, 'a single missed week is covered: four weeks, a hard Sunday, then five');

select is(
  (select longest_weeks from public.streaks where profile_id = :'grace_member'),
  5, 'and the longest rhythm follows it up');

-- Two missed weeks in a row start a new rhythm rather than extending the old one.
insert into public.attendance (profile_id, branch_id, service_date, client_taken_at)
select :'lapsed_member', :'glasgow',
       (date_trunc('week', current_date) - (w || ' weeks')::interval)::date + 6, now()
from unnest(array[6, 5, 4, 0]) as w;

select is(
  (select current_weeks from public.streaks where profile_id = :'lapsed_member'),
  1, 'two missed weeks in a row begin a new rhythm');

select is(
  (select longest_weeks from public.streaks where profile_id = :'lapsed_member'),
  3, 'and the rhythm they had is remembered as their longest');

select is(
  (select last_service_date from public.streaks where profile_id = :'lapsed_member'),
  (date_trunc('week', current_date)::date + 6),
  'last_service_date is the most recent day attended');

-- The retro-correction the full recompute exists for: a late replay that BRIDGES two runs.
-- An incremental count would never see it.
insert into public.attendance (profile_id, branch_id, service_date, client_taken_at)
values (:'lapsed_member', :'glasgow',
        (date_trunc('week', current_date) - interval '2 weeks')::date + 6, now());
select is(
  (select current_weeks from public.streaks where profile_id = :'lapsed_member'),
  5, 'a late replay that bridges two runs joins them, because the recompute is total');

select is(
  public.rhythm_week(date '2026-08-09'),
  date '2026-08-03',
  'a Sunday belongs to the ISO week that started on the Monday before it');

select is(
  public.rhythm_week(date '2026-08-10'),
  date '2026-08-10',
  'and a Monday starts its own');

-- --- 4. what the screen is told --------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "a0000000-0000-4000-8000-0000000000a2", "role": "authenticated", "user_role": "member", "branch_id": "00000000-0000-4000-8000-000000000001"}';

select is(
  (select state from public.rhythm_state(:'glasgow')),
  'active', 'attending this week reads as active');

select is(
  (select checked_in from public.rhythm_state(:'glasgow')),
  false, 'and Sunday''s attendance is not a check-in for today');

select is(
  (select today from public.rhythm_state(:'glasgow')),
  public.attendance_service_date(now(), 'Europe/London'),
  'today comes from the branch being browsed, not from the caller''s clock');

-- The browsed branch decides the day (`07`): the same call against a branch an hour ahead can
-- be a different date, and that is the answer the card must draw.
select is(
  (select today from public.rhythm_state(:'emmen')),
  public.attendance_service_date(now(), 'Europe/Amsterdam'),
  'browsing another branch answers in that branch''s day');

select is(
  (select recorded from public.record_attendance(:'glasgow')),
  true, '"I''m here" records the tap');

select is(
  (select recorded from public.record_attendance(:'glasgow')),
  false, 'and a second tap the same day records nothing');

select is(
  (select checked_in from public.record_attendance(:'glasgow')),
  true, 'while still answering that they are checked in');

select is(
  (select count(*)::int from public.attendance
    where profile_id = :'grace_member' and service_date = current_date),
  1, 'one row per member per day, however many taps');

reset role;
select set_config('request.jwt.claims', '', true);

-- The states a paused rhythm passes through, which is where `10`'s grace framing lives.
insert into public.attendance (profile_id, branch_id, service_date, client_taken_at)
values (:'author', :'glasgow', (date_trunc('week', current_date) - interval '2 weeks')::date + 6, now());

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "a0000000-0000-4000-8000-0000000000a4", "role": "authenticated", "user_role": "member", "branch_id": "00000000-0000-4000-8000-000000000001"}';

select is(
  (select state from public.rhythm_state(:'glasgow')),
  'grace', 'one full week missed reads as grace, not as a break');

select is(
  (select current_weeks from public.rhythm_state(:'glasgow')),
  1, 'and the streak is still theirs while grace carries it');

reset role;
select set_config('request.jwt.claims', '', true);

-- Attendance is immutable, so a lapsed rhythm is made by a member who has one, not by editing
-- somebody's history.
\set gone_member 'a0000000-0000-4000-8000-0000000000a5'
insert into auth.users (id, email) values (:'gone_member', 't030-gone@test.local');
insert into public.profiles (id, email, display_name, branch_id, role, onboarded_at)
values (:'gone_member', 't030-gone@test.local', 'T030 Gone', :'glasgow', 'member', now());
insert into public.attendance (profile_id, branch_id, service_date, client_taken_at)
values (:'gone_member', :'glasgow', (date_trunc('week', current_date) - interval '4 weeks')::date + 6, now());

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "a0000000-0000-4000-8000-0000000000a5", "role": "authenticated", "user_role": "member", "branch_id": "00000000-0000-4000-8000-000000000001"}';

select is(
  (select state from public.rhythm_state(:'glasgow')),
  'lapsed', 'four weeks away reads as lapsed');

select is(
  (select current_weeks from public.rhythm_state(:'glasgow')),
  0, 'the live streak is zero');

select is(
  (select longest_weeks from public.rhythm_state(:'glasgow')),
  1, 'but what they did is never taken away from them');

reset role;
select set_config('request.jwt.claims', '', true);

-- --- 5. attendance is a fact, not a state ------------------------------------------------------

select throws_ok(
  format($$update public.attendance set branch_id = %L where profile_id = %L$$,
         :'emmen', :'gone_member'),
  '23514',
  null,
  'an attendance row cannot be edited, by anyone');

-- --- 6. milestones celebrate, once ------------------------------------------------------------

select is(
  (select count(*)::int from public.milestones
    where profile_id = :'grace_member' and kind = 'first_service'),
  1, 'the first service is celebrated');

select is(
  (select count(*)::int from public.milestones
    where profile_id = :'grace_member' and kind = '4_week_rhythm'),
  1, 'so is a four-week rhythm');

select is(
  (select count(*)::int from public.milestones
    where profile_id = :'gone_member' and kind = '4_week_rhythm'),
  0, 'one service earns no rhythm milestone');

-- Every insert re-awards, and the unique constraint absorbs it: no double celebrations.
select lives_ok(
  format($$insert into public.attendance (profile_id, branch_id, service_date, client_taken_at)
           values (%L, %L, current_date - 1, now())$$, :'grace_member', :'glasgow'),
  'another service is recorded without a duplicate-milestone failure');

select is(
  (select count(*)::int from public.milestones where profile_id = :'grace_member'),
  2, 'and still exactly two milestones');

-- Content milestones land on APPROVAL, never on submission: a celebration for a post that is
-- then rejected is the opposite of what `10` asks for.
insert into public.testimonies (id, author_id, branch_id, body, language, status, consent_version)
values ('a1000000-0000-4000-8000-000000000001', :'author', :'glasgow',
        'Waiting for review', 'en', 'pending', 'content-share-v1');

select is(
  (select count(*)::int from public.milestones
    where profile_id = :'author' and kind = 'first_testimony'),
  0, 'submitting a testimony celebrates nothing yet');

update public.testimonies set status = 'approved'
  where id = 'a1000000-0000-4000-8000-000000000001';

select is(
  (select count(*)::int from public.milestones
    where profile_id = :'author' and kind = 'first_testimony'),
  1, 'approval is what earns the first-testimony milestone');

-- The other half of the same trigger. One CASE picks the kind from the table it fired on, and
-- only a prayer exercises the second branch of it.
insert into public.prayers (id, author_id, branch_id, body, language, status, consent_version)
values ('a1000000-0000-4000-8000-000000000002', :'author', :'glasgow',
        'Please pray for my mother', 'en', 'pending', 'content-share-v1');
update public.prayers set status = 'approved'
  where id = 'a1000000-0000-4000-8000-000000000002';

select is(
  (select count(*)::int from public.milestones
    where profile_id = :'author' and kind = 'first_prayer'),
  1, 'and an approved request earns the first-prayer one');

-- --- 7. the safety net --------------------------------------------------------------------------

-- Idempotence asked properly: every stored streak, before and after the pass.
create temporary table t030_before on commit drop as
  select profile_id, current_weeks, longest_weeks, last_service_date from public.streaks;

select ok(
  public.recompute_all_streaks() >= 4,
  'the weekly pass reaches every member with attendance');

select is(
  (select count(*)::int
     from public.streaks s
     join t030_before b on b.profile_id = s.profile_id
    where s.current_weeks is distinct from b.current_weeks
       or s.longest_weeks is distinct from b.longest_weeks
       or s.last_service_date is distinct from b.last_service_date),
  0, 'and changes nothing the on-write trigger already got right');

select is(
  (select count(*)::int from cron.job where jobname = 'streak-recompute' and active),
  1, 'and it is scheduled');

-- --- 8. nobody may write their own rhythm --------------------------------------------------------

select ok(
  (select bool_and(relforcerowsecurity) from pg_class
    where oid in ('public.attendance'::regclass, 'public.streaks'::regclass,
                  'public.milestones'::regclass)),
  'all three tables force row level security');

select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public' and table_name in ('streaks', 'milestones')
      and grantee in ('anon', 'authenticated') and privilege_type <> 'SELECT'),
  0, 'streaks and milestones are readable by their owner and writable by nobody');

select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'attendance'
      and grantee = 'authenticated'
      and privilege_type in ('UPDATE', 'DELETE', 'TRUNCATE')),
  0, 'and attendance can be added to but never rewritten');

select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in ('attendance', 'streaks', 'milestones')
      and grantee = 'anon'),
  0, 'a guest holds nothing at all here');

select is(
  (select count(*)::int
     from unnest(array[
       'public.recompute_streak(uuid)',
       'public.award_milestone(uuid, text)',
       'public.recompute_all_streaks()'
     ]) as f(signature)
     cross join unnest(array['anon', 'authenticated']) as r(who)
    where has_function_privilege(r.who, f.signature, 'EXECUTE')),
  0, 'no client role may recompute a streak or hand itself a milestone');

select ok(
  has_function_privilege('authenticated', 'public.rhythm_state(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.record_attendance(uuid, timestamptz)', 'EXECUTE'),
  'while the two the screens need are theirs to call');

select ok(
  has_function_privilege('service_role', 'public.recompute_all_streaks()', 'EXECUTE'),
  'and the weekly job may run the safety net');

select * from finish();
rollback;
