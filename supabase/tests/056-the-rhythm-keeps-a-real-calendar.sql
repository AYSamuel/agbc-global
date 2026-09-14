-- The rhythm keeps a real calendar (W4.16 slice 1, migration 20260914120000).
--
-- Every name on the week ladder is a length of calendar time, and until this migration every
-- threshold was a count of attended weeks. This file asserts the calendar rules the plan settled
-- with Ayo (`docs/spec/plans/W4.16-rhythm-real-calendar.md` §3), and it asserts them on FIXED
-- dates, which is the point: the rules only differ from a week count on particular months (five
-- Sundays, a week straddling two months, an anniversary one day away), so a test anchored to
-- `now()` would exercise the difference on some days and silently not on others.
--
-- Fixed dates are safe here because nothing below depends on the clock. Attendance is written
-- as a trusted writer (no auth.uid()), which may state a service_date outright, and the award
-- and progress functions take their dates as arguments. The one section that goes through
-- `rhythm_state()` as a member is anchored to the branch's own "today" instead, and asserts
-- only what holds on every day of the year.
--
-- Where a milestone must land ON a date and NOT BEFORE, the gatherings before it are one
-- statement and the gathering that earns it is another: an AFTER ROW trigger fires once the
-- whole statement has landed, so each invocation sees every row of its own statement.
--
-- Privileges are asserted with has_function_privilege and never by attempting a call: calling
-- a function you lack EXECUTE on takes down the whole backend on this local stack.

begin;
create extension if not exists pgtap with schema extensions;
select plan(69);

\set glasgow '00000000-0000-4000-8000-000000000001'

\set m_sep       'a5600000-0000-4000-8000-000000000001'
\set m_nov       'a5600000-0000-4000-8000-000000000002'
\set m_straddle  'a5600000-0000-4000-8000-000000000003'
\set m_midweek   'a5600000-0000-4000-8000-000000000004'
\set m_twice     'a5600000-0000-4000-8000-000000000005'
\set m_wed30     'a5600000-0000-4000-8000-000000000006'
\set m_midmonth  'a5600000-0000-4000-8000-000000000007'
\set m_fortnight 'a5600000-0000-4000-8000-000000000008'
\set m_weekly    'a5600000-0000-4000-8000-000000000009'
\set m_broken    'a5600000-0000-4000-8000-00000000000a'
\set m_keeper    'a5600000-0000-4000-8000-00000000000b'
\set m_returning 'a5600000-0000-4000-8000-00000000000c'
\set m_lapsed    'a5600000-0000-4000-8000-00000000000d'
\set m_new       'a5600000-0000-4000-8000-00000000000e'
\set m_history   'a5600000-0000-4000-8000-00000000000f'

-- The branch's day, never the session's UTC one (030's clamp section explains the flake window).
\set london_today 'public.attendance_service_date(now(), ''Europe/London'')'

insert into auth.users (id, email)
select id::uuid, 't056-' || right(id, 2) || '@test.local'
from unnest(array[
  :'m_sep', :'m_nov', :'m_straddle', :'m_midweek', :'m_twice', :'m_wed30', :'m_midmonth',
  :'m_fortnight', :'m_weekly', :'m_broken', :'m_keeper', :'m_returning', :'m_lapsed', :'m_new',
  :'m_history'
]) as id;

insert into public.profiles (id, email, display_name, branch_id, role, onboarded_at)
select u.id, u.email, 'T056 ' || right(u.id::text, 2), :'glasgow', 'member', now()
from auth.users u
where u.email like 't056-%@test.local';

-- ===========================================================================
-- 1. Which month a week belongs to
-- ===========================================================================

select is(
  public.rhythm_week_month(date '2026-09-27'),
  date '2026-09-01',
  'a Sunday''s week belongs to the month that Sunday is in');

select is(
  public.rhythm_week_month(date '2026-09-30'),
  date '2026-10-01',
  'Wednesday 30 September 2026 belongs to October, because its week ends on Sunday 4 October');

select is(
  (select count(*)::int from public.rhythm_month_weeks(date '2026-09-01')),
  4,
  'September 2026 has four weeks, one per Sunday');

select is(
  (select array_agg(w order by w) from public.rhythm_month_weeks(date '2026-11-17') as w),
  array[date '2026-10-26', date '2026-11-02', date '2026-11-09', date '2026-11-16', date '2026-11-23'],
  'November 2026 has five, the first ending on Sunday 1 November, and any day names the month');

-- ===========================================================================
-- 2. A month of Sundays: every week of one calendar month
-- ===========================================================================

-- A four-Sunday month, earned on its fourth Sunday and not before.
insert into public.attendance (profile_id, branch_id, service_date)
select :'m_sep', :'glasgow', d from unnest(array['2026-09-06', '2026-09-13', '2026-09-20']::date[]) as d;

select is(
  (select count(*)::int from public.milestones where profile_id = :'m_sep' and kind = '4_week_rhythm'),
  0,
  'three of September''s four Sundays are not a month');

insert into public.attendance (profile_id, branch_id, service_date) values (:'m_sep', :'glasgow', '2026-09-27');

select is(
  (select count(*)::int from public.milestones where profile_id = :'m_sep' and kind = '4_week_rhythm'),
  1,
  'the fourth is: a month of Sundays on Sunday 27 September');

-- A five-Sunday month. The old rule awarded this on the 22nd, with a Sunday still to come.
insert into public.attendance (profile_id, branch_id, service_date)
select :'m_nov', :'glasgow', d
from unnest(array['2026-11-01', '2026-11-08', '2026-11-15', '2026-11-22']::date[]) as d;

select is(
  (select current_weeks from public.streaks where profile_id = :'m_nov'),
  4,
  'four Sundays running in November');

select is(
  (select count(*)::int from public.milestones where profile_id = :'m_nov' and kind = '4_week_rhythm'),
  0,
  'are not a month of Sundays when November has five');

insert into public.attendance (profile_id, branch_id, service_date) values (:'m_nov', :'glasgow', '2026-11-29');

select is(
  (select count(*)::int from public.milestones where profile_id = :'m_nov' and kind = '4_week_rhythm'),
  1,
  'and the fifth, Sunday 29 November, completes it');

-- Four consecutive weeks, two in each month: a run of four, and no month.
insert into public.attendance (profile_id, branch_id, service_date)
select :'m_straddle', :'glasgow', d
from unnest(array['2026-09-20', '2026-09-27', '2026-10-04', '2026-10-11']::date[]) as d;

select is(
  (select current_weeks from public.streaks where profile_id = :'m_straddle'),
  4,
  'four consecutive weeks from 20 September to 11 October');

select is(
  (select count(*)::int from public.milestones where profile_id = :'m_straddle' and kind = '4_week_rhythm'),
  0,
  'straddle two months and cover neither, so they are not a month of Sundays');

-- Any gathering covers its week, not only a Sunday one (Ayo: members who work Sunday shifts).
insert into public.attendance (profile_id, branch_id, service_date)
select :'m_midweek', :'glasgow', d
from unnest(array['2026-09-02', '2026-09-09', '2026-09-16', '2026-09-23']::date[]) as d;

select is(
  (select count(*)::int from public.milestones where profile_id = :'m_midweek' and kind = '4_week_rhythm'),
  1,
  'four midweek meetings, one in each of September''s weeks, are a month of Sundays');

-- Five gatherings, but a Sunday and a Wednesday in one week count once.
insert into public.attendance (profile_id, branch_id, service_date)
select :'m_twice', :'glasgow', d
from unnest(array['2026-09-09', '2026-09-13', '2026-09-16', '2026-09-20', '2026-09-23']::date[]) as d;

select is(
  (select count(*)::int from public.milestones where profile_id = :'m_twice' and kind = '4_week_rhythm'),
  0,
  'five gatherings in three of September''s weeks are not a month: a week counts once however often it gathers');

-- Wednesday 30 September is October's first week.
insert into public.attendance (profile_id, branch_id, service_date)
select :'m_wed30', :'glasgow', d
from unnest(array['2026-09-30', '2026-10-11', '2026-10-18', '2026-10-25']::date[]) as d;

select is(
  (select count(*)::int from public.milestones where profile_id = :'m_wed30' and kind = '4_week_rhythm'),
  1,
  'a gathering on Wednesday 30 September covers October''s first week, completing October with the 11th, 18th and 25th');

-- Starting mid-month: September's first two weeks are gone, so October is the chance.
insert into public.attendance (profile_id, branch_id, service_date)
select :'m_midmonth', :'glasgow', d
from unnest(array['2026-09-20', '2026-09-27', '2026-10-04', '2026-10-11', '2026-10-18']::date[]) as d;

select is(
  (select count(*)::int from public.milestones where profile_id = :'m_midmonth' and kind = '4_week_rhythm'),
  0,
  'a first gathering on 20 September has not earned the month by 18 October, five Sundays in');

insert into public.attendance (profile_id, branch_id, service_date) values (:'m_midmonth', :'glasgow', '2026-10-25');

select is(
  (select count(*)::int from public.milestones where profile_id = :'m_midmonth' and kind = '4_week_rhythm'),
  1,
  'it lands at the end of the next full month, Sunday 25 October');

-- Not tied to the current run. A restated history (one statement, so no check-in along the way
-- could have awarded it) holds a whole September and then, after a gap, a run of its own in
-- December: the month is still earned, because it is any covered month, ever.
insert into public.attendance (profile_id, branch_id, service_date)
select :'m_history', :'glasgow', d
from unnest(array['2026-09-06', '2026-09-13', '2026-09-20', '2026-09-27', '2026-12-06']::date[]) as d;

select is(
  (select count(*)::int from public.milestones where profile_id = :'m_history' and kind = '4_week_rhythm'),
  1,
  'a month covered in an earlier run still earns it: the month is not tied to the current run');

-- ===========================================================================
-- 3. A season, half a year, a year: calendar months of the current run
-- ===========================================================================

-- Every other Sunday from 6 September 2026. Grace carries every missed week, so this is ONE run
-- for a year, and it never covers a whole month.
insert into public.attendance (profile_id, branch_id, service_date)
select :'m_fortnight', :'glasgow', d::date
from generate_series(timestamp '2026-09-06', timestamp '2026-11-29', interval '14 days') as d;

select is(
  (select count(*)::int from public.milestones
    where profile_id = :'m_fortnight' and kind in ('4_week_rhythm', '12_week_rhythm')),
  0,
  'every other Sunday to 29 November: no month, and no season before its anniversary on 6 December');

insert into public.attendance (profile_id, branch_id, service_date) values (:'m_fortnight', :'glasgow', '2026-12-13');

select is(
  (select count(*)::int from public.milestones where profile_id = :'m_fortnight' and kind = '12_week_rhythm'),
  1,
  'the first gathering after the anniversary, 13 December, is a season with us, with grace weeks inside the run');

insert into public.attendance (profile_id, branch_id, service_date)
select :'m_fortnight', :'glasgow', d::date
from generate_series(timestamp '2026-12-27', timestamp '2027-02-21', interval '14 days') as d;

select is(
  (select count(*)::int from public.milestones where profile_id = :'m_fortnight' and kind = '26_week_rhythm'),
  0,
  'no half year before 6 March 2027');

insert into public.attendance (profile_id, branch_id, service_date) values (:'m_fortnight', :'glasgow', '2027-03-07');

select is(
  (select count(*)::int from public.milestones where profile_id = :'m_fortnight' and kind = '26_week_rhythm'),
  1,
  'and half a year on Sunday 7 March');

insert into public.attendance (profile_id, branch_id, service_date)
select :'m_fortnight', :'glasgow', d::date
from generate_series(timestamp '2027-03-21', timestamp '2027-09-05', interval '14 days') as d;

select is(
  (select count(*)::int from public.milestones where profile_id = :'m_fortnight' and kind = '52_week_rhythm'),
  0,
  'Sunday 5 September 2027 is one day short of a year');

insert into public.attendance (profile_id, branch_id, service_date) values (:'m_fortnight', :'glasgow', '2027-09-19');

select is(
  (select count(*)::int from public.milestones where profile_id = :'m_fortnight' and kind = '52_week_rhythm'),
  1,
  'Sunday 19 September 2027 is a year of Sundays');

select is(
  (select count(*)::int from public.attendance where profile_id = :'m_fortnight'),
  28,
  'reached in 28 gatherings: grace is a gift, and the gathering ladder is what counts the times');

select is(
  (select count(*)::int from public.milestones where profile_id = :'m_fortnight' and kind = '4_week_rhythm'),
  0,
  'and every other Sunday never earns the month, however long it goes on');

select is(
  (select run_started_on from public.streaks where profile_id = :'m_fortnight'),
  date '2026-09-06',
  'the run still starts where it started: grace weeks do not move the anniversary');

-- Every Sunday, from the same start: on or after the anniversary, never before. The old rule
-- awarded each of these at 12, 26 and 52 attended weeks, which is 22 November, 28 February and
-- 29 August.
insert into public.attendance (profile_id, branch_id, service_date)
select :'m_weekly', :'glasgow', d::date
from generate_series(timestamp '2026-09-06', timestamp '2026-11-29', interval '7 days') as d;

select is(
  (select count(*)::int from public.milestones where profile_id = :'m_weekly' and kind = '12_week_rhythm'),
  0,
  'thirteen Sundays to 29 November are not yet a season');

insert into public.attendance (profile_id, branch_id, service_date) values (:'m_weekly', :'glasgow', '2026-12-06');

select is(
  (select count(*)::int from public.milestones where profile_id = :'m_weekly' and kind = '12_week_rhythm'),
  1,
  'Sunday 6 December is: the anniversary itself counts');

insert into public.attendance (profile_id, branch_id, service_date)
select :'m_weekly', :'glasgow', d::date
from generate_series(timestamp '2026-12-13', timestamp '2027-02-28', interval '7 days') as d;

select is(
  (select count(*)::int from public.milestones where profile_id = :'m_weekly' and kind = '26_week_rhythm'),
  0,
  'twenty-six Sundays to 28 February are not yet half a year');

insert into public.attendance (profile_id, branch_id, service_date) values (:'m_weekly', :'glasgow', '2027-03-07');

select is(
  (select count(*)::int from public.milestones where profile_id = :'m_weekly' and kind = '26_week_rhythm'),
  1,
  'Sunday 7 March 2027 is, because 6 March is a Saturday');

insert into public.attendance (profile_id, branch_id, service_date)
select :'m_weekly', :'glasgow', d::date
from generate_series(timestamp '2027-03-14', timestamp '2027-09-05', interval '7 days') as d;

select is(
  (select current_weeks from public.streaks where profile_id = :'m_weekly'),
  53,
  'fifty-three Sundays in a row to 5 September 2027');

select is(
  (select count(*)::int from public.milestones where profile_id = :'m_weekly' and kind = '52_week_rhythm'),
  0,
  'are not a year when the year ends on Monday 6 September');

insert into public.attendance (profile_id, branch_id, service_date) values (:'m_weekly', :'glasgow', '2027-09-12');

select is(
  (select count(*)::int from public.milestones where profile_id = :'m_weekly' and kind = '52_week_rhythm'),
  1,
  'Sunday 12 September 2027 is a year of Sundays');

-- Two missed weeks end a run, and the anniversary restarts with the next one. Five Sundays, then
-- 11 and 18 October missed, then every Sunday from 25 October.
insert into public.attendance (profile_id, branch_id, service_date)
select :'m_broken', :'glasgow', d::date
from generate_series(timestamp '2026-09-06', timestamp '2026-10-04', interval '7 days') as d;

insert into public.attendance (profile_id, branch_id, service_date)
select :'m_broken', :'glasgow', d::date
from generate_series(timestamp '2026-10-25', timestamp '2027-01-24', interval '7 days') as d;

select is(
  (select run_started_on from public.streaks where profile_id = :'m_broken'),
  date '2026-10-25',
  'after two missed weeks the run starts again on 25 October');

select is(
  (select count(*)::int from public.milestones where profile_id = :'m_broken' and kind = '12_week_rhythm'),
  0,
  'so fourteen Sundays to 24 January 2027 are not a season, though the first run''s anniversary passed in December');

insert into public.attendance (profile_id, branch_id, service_date) values (:'m_broken', :'glasgow', '2027-01-31');

select is(
  (select count(*)::int from public.milestones where profile_id = :'m_broken' and kind = '12_week_rhythm'),
  1,
  'the new run''s season lands on 31 January, the first Sunday on or after 25 January');

-- The retro-correction the full recompute exists for: a late replay that bridges the two runs
-- moves the anniversary back to the older start.
insert into public.attendance (profile_id, branch_id, service_date) values (:'m_broken', :'glasgow', '2026-10-18');

select is(
  (select run_started_on from public.streaks where profile_id = :'m_broken'),
  date '2026-09-06',
  'a late replay that bridges two runs joins them, and the run begins at the older start');

-- The arithmetic at its edges, asked directly.
select is(
  (select array_agg(r) from public.rhythm_time_rungs(date '2026-08-31', date '2026-11-29') as r),
  null,
  'a run from 31 August has no season on 29 November');

select is(
  (select array_agg(r order by r) from public.rhythm_time_rungs(date '2026-08-31', date '2026-11-30') as r),
  array[12],
  'and has one on 30 November: the month end clamps, it does not spill into December');

select is(
  (select array_agg(r order by r) from public.rhythm_time_rungs(date '2026-09-06', date '2028-09-05') as r),
  array[12, 26, 52],
  'one day short of two years is still one year');

select is(
  (select array_agg(r order by r) from public.rhythm_time_rungs(date '2026-09-06', date '2028-09-06') as r),
  array[12, 26, 52, 104],
  'and two years is a rung of its own');

-- ===========================================================================
-- 4. What comes next, and how far along it is
-- ===========================================================================

select is(
  (select row(n.next_kind, n.progress_done, n.progress_total, n.progress_month)::text
     from public.rhythm_next_milestone(date '2026-09-16',
       array['2026-09-06', '2026-09-13']::date[], array['first_service'], date '2026-09-06') n),
  row('4_week_rhythm', 2, 4, date '2026-09-01')::text,
  'on track: two of four in September');

select is(
  (select row(n.next_kind, n.progress_done, n.progress_total, n.progress_month)::text
     from public.rhythm_next_milestone(date '2026-09-13',
       array['2026-09-06']::date[], array['first_service'], date '2026-09-06') n),
  row('4_week_rhythm', 1, 4, date '2026-09-01')::text,
  'a week is not missed until it ends: on Sunday 13 September with nothing yet that day, September is still on');

select is(
  (select row(n.next_kind, n.progress_done, n.progress_total, n.progress_month)::text
     from public.rhythm_next_milestone(date '2026-09-23',
       array['2026-09-06', '2026-09-20']::date[], array['first_service'], date '2026-09-06') n),
  row('4_week_rhythm', 0, 4, date '2026-10-01')::text,
  'once a week of September has ended with no gathering, the target is October, from nothing');

select is(
  (select row(n.next_kind, n.progress_done, n.progress_total, n.progress_month)::text
     from public.rhythm_next_milestone(date '2026-09-26',
       array['2026-09-06', '2026-09-13', '2026-09-20']::date[], array['first_service'], date '2026-09-06') n),
  row('4_week_rhythm', 3, 4, date '2026-09-01')::text,
  'the month''s last week: three of four');

select is(
  (select row(n.next_kind, n.progress_done, n.progress_total, n.progress_month)::text
     from public.rhythm_next_milestone(date '2026-11-25',
       array['2026-11-01', '2026-11-08', '2026-11-15', '2026-11-22']::date[], array['first_service'],
       date '2026-11-01') n),
  row('4_week_rhythm', 4, 5, date '2026-11-01')::text,
  'in a five-Sunday month, four weeks is four of five');

select is(
  (select row(n.next_kind, n.progress_done, n.progress_total, n.progress_month)::text
     from public.rhythm_next_milestone(date '2026-09-30',
       array['2026-09-06', '2026-09-30']::date[], array['first_service'], date '2026-09-06') n),
  row('4_week_rhythm', 1, 4, date '2026-10-01')::text,
  'on Wednesday 30 September the month being counted is already October');

select is(
  (select row(n.next_kind, n.progress_done, n.progress_total, n.progress_month)::text
     from public.rhythm_next_milestone(date '2026-11-01',
       array['2026-11-01']::date[], array['first_service', '4_week_rhythm'], date '2026-09-06') n),
  row('12_week_rhythm', 8, 13, null::date)::text,
  'once the month is held: a season with us, eight of thirteen weeks from a run begun on 6 September');

select is(
  (select row(n.next_kind, n.progress_done, n.progress_total, n.progress_month)::text
     from public.rhythm_next_milestone(date '2027-01-20',
       array['2026-12-20']::date[], array['first_service', '4_week_rhythm'], date '2026-09-06') n),
  row('12_week_rhythm', 13, 13, null::date)::text,
  'past the anniversary with no gathering since, the count is full and waits for the next one');

select is(
  (select row(n.next_kind, n.progress_done, n.progress_total, n.progress_month)::text
     from public.rhythm_next_milestone(date '2026-11-01',
       array['2026-09-06']::date[], array['4_week_rhythm'], null) n),
  row('12_week_rhythm', 0, 14, null::date)::text,
  'with no live run the season counts from today, because the next gathering begins one');

select is(
  (select row(n.next_kind, n.progress_done, n.progress_total, n.progress_month)::text
     from public.rhythm_next_milestone(date '2026-11-01',
       array['2026-10-25', '2026-11-01']::date[],
       array['first_service', '4_week_rhythm', '12_week_rhythm'], date '2026-10-25') n),
  row('26_week_rhythm', 1, 26, null::date)::text,
  'a returning member who already holds a season is pointed at half a year, measured from the new run');

select is(
  (select n.next_kind
     from public.rhythm_next_milestone(date '2026-11-04',
       array['2026-11-01']::date[], array['first_service', '12_week_rhythm'], date '2026-09-06') n),
  '4_week_rhythm',
  'a member holding a season but not the month is pointed at the month first');

select is(
  (select n.next_kind
     from public.rhythm_next_milestone(date '2026-11-01', array['2026-11-01']::date[],
       array['4_week_rhythm', '12_week_rhythm', '26_week_rhythm', '52_week_rhythm', '10_gatherings'],
       date '2026-10-25') n),
  '104_week_rhythm',
  'and past a year there is always a next one: two years');

-- ===========================================================================
-- 5. What the screen is told, as the member
-- ===========================================================================
--
-- Anchored to Glasgow's own today, so every assertion here holds on any day it runs.

-- Returning: one gathering two days back (never today, never in the future) and badges from an
-- earlier run.
insert into public.attendance (profile_id, branch_id, service_date)
values (:'m_returning', :'glasgow', :london_today - 2);
insert into public.milestones (profile_id, kind)
values (:'m_returning', '4_week_rhythm'), (:'m_returning', '12_week_rhythm');

-- Lapsed: a Sunday five weeks back and the month held.
insert into public.attendance (profile_id, branch_id, service_date)
values (:'m_lapsed', :'glasgow', public.rhythm_week(:london_today) - 35 + 6);
insert into public.milestones (profile_id, kind) values (:'m_lapsed', '4_week_rhythm');

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "a5600000-0000-4000-8000-00000000000c", "role": "authenticated", "user_role": "member", "branch_id": "00000000-0000-4000-8000-000000000001"}';

select is(
  (select next_kind from public.rhythm_state(:'glasgow')),
  '26_week_rhythm',
  'rhythm_state skips the badges this member already holds: next is half a year');

select is(
  (select row(r.next_kind, r.progress_done, r.progress_total, r.progress_month)::text
     from public.rhythm_state(:'glasgow') r),
  (select row(n.next_kind, n.progress_done, n.progress_total, n.progress_month)::text
     from public.rhythm_next_milestone(
       :london_today,
       array[:london_today - 2],
       array['first_service', '4_week_rhythm', '12_week_rhythm'],
       :london_today - 2) n),
  'and its progress is the helper''s, fed this member''s own dates, badges and run start');

select is(
  (select next_kind from public.record_attendance(:'glasgow')),
  '26_week_rhythm',
  '"I''m here" answers with the next milestone too');

reset role;
select set_config('request.jwt.claims', '', true);

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "a5600000-0000-4000-8000-00000000000d", "role": "authenticated", "user_role": "member", "branch_id": "00000000-0000-4000-8000-000000000001"}';

select is(
  (select row(r.state, r.next_kind, r.progress_done)::text from public.rhythm_state(:'glasgow') r),
  row('lapsed', '12_week_rhythm', 0)::text,
  'a lapsed member is counted toward a season from nothing, not from the run that ended');

reset role;
select set_config('request.jwt.claims', '', true);

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "a5600000-0000-4000-8000-00000000000e", "role": "authenticated", "user_role": "member", "branch_id": "00000000-0000-4000-8000-000000000001"}';

select is(
  (select row(r.state, r.next_kind, r.progress_done)::text from public.rhythm_state(:'glasgow') r),
  row('none', '4_week_rhythm', 0)::text,
  'a member who has never gathered is pointed at the month, with nothing covered, whatever everyone else holds');

reset role;
select set_config('request.jwt.claims', '', true);

-- ===========================================================================
-- 6. Nothing already held is taken away
-- ===========================================================================

-- Badges the old count gave for four weeks straddling two months, which this rule would not.
insert into public.milestones (profile_id, kind)
values (:'m_keeper', '4_week_rhythm'), (:'m_keeper', '12_week_rhythm'), (:'m_keeper', '26_week_rhythm');
insert into public.attendance (profile_id, branch_id, service_date)
select :'m_keeper', :'glasgow', d
from unnest(array['2026-09-20', '2026-09-27', '2026-10-04', '2026-10-11']::date[]) as d;
insert into public.attendance (profile_id, branch_id, service_date) values (:'m_keeper', :'glasgow', '2026-10-18');

select is(
  (select count(*)::int from public.milestones
    where profile_id = :'m_keeper' and kind in ('4_week_rhythm', '12_week_rhythm', '26_week_rhythm')),
  3,
  'a check-in under the new rule keeps every badge the old one gave');

-- The shape the migration's backfill meets on production: a streak row from before the column.
update public.streaks set run_started_on = null where profile_id = :'m_sep';

select ok(
  public.recompute_all_streaks() > 0,
  'the weekly pass runs over everyone');

select is(
  (select count(*)::int from public.milestones
    where profile_id = :'m_keeper' and kind in ('4_week_rhythm', '12_week_rhythm', '26_week_rhythm')),
  3,
  'and a recompute never removes a held badge');

select is(
  (select run_started_on from public.streaks where profile_id = :'m_sep'),
  date '2026-09-06',
  'the pass fills in where a run began on a row that predates the column, which is the migration''s backfill');

-- ===========================================================================
-- 7. Who may read and run what
-- ===========================================================================

select ok(
  has_column_privilege('authenticated', 'public.streaks', 'run_started_on', 'SELECT'),
  'a member may read where their own run began (RLS keeps it to their own row)');

select ok(
  not has_column_privilege('authenticated', 'public.streaks', 'run_started_on', 'INSERT')
  and not has_column_privilege('authenticated', 'public.streaks', 'run_started_on', 'UPDATE')
  and not has_column_privilege('anon', 'public.streaks', 'run_started_on', 'SELECT'),
  'and nobody but the server writes it, and a guest cannot read it');

select is(
  (select count(*)::int
     from unnest(array['public.rhythm_state(uuid)', 'public.record_attendance(uuid, timestamptz)']) as f(signature)
     cross join unnest(array['anon', 'service_role']) as r(who)
    where has_function_privilege(r.who, f.signature, 'EXECUTE')),
  0,
  'the reshaped read path keeps its ACL: recreated functions start with Supabase''s default grants, and they are revoked again');

select ok(
  has_function_privilege('authenticated', 'public.rhythm_state(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.record_attendance(uuid, timestamptz)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.rhythm_next_milestone(date, date[], text[], date)', 'EXECUTE'),
  'while a member may call both, and the helper rhythm_state calls as them');

-- A pure function a client may EXECUTE is an RPC on the public API, and two of these build a
-- series as long as their arguments say.
select is(
  (select count(*)::int
     from unnest(array[
       'public.rhythm_week_month(date)',
       'public.rhythm_month_weeks(date)',
       'public.rhythm_covered_months(date[])',
       'public.rhythm_time_ladder(integer)',
       'public.rhythm_time_rungs(date, date)'
     ]) as f(signature)
     cross join unnest(array['anon', 'authenticated', 'service_role']) as r(who)
    where has_function_privilege(r.who, f.signature, 'EXECUTE')),
  0,
  'no client role may call the calendar helpers directly, so nobody can ask the ladder for a billion years');

select is(
  (select count(*)::int
     from unnest(array['anon', 'service_role']) as r(who)
    where has_function_privilege(r.who, 'public.rhythm_next_milestone(date, date[], text[], date)', 'EXECUTE')),
  0,
  'and the one helper a member may call is theirs alone');

select hasnt_function(
  'public', 'rhythm_week_rungs', array['integer'],
  'the week-count ladder is gone, so nothing can award a month for four weeks again');

select * from finish();
rollback;
