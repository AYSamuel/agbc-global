-- The ladder that does not end (W2.8 slice 5, migration 20260808214722; moved onto the
-- calendar by W4.16, migration 20260914120000).
--
-- Two ladders that answer different questions, and the difference is the whole design:
--
--   rhythm rungs    "how long without a gap": a month of Sundays, then a season, half a year,
--                   a year and every year after, in calendar time from the current run's first
--                   gathering, so a member can lose their PLACE on it after two missed weeks
--   gathering count "how many times, ever": cumulative, so nothing is ever lost
--
-- What is asserted here is mostly that the awards are ENDLESS and IDEMPOTENT: there is always
-- a next rung, a badge already held is never awarded twice, and a badge is never taken away,
-- because that last property is what makes this not Duolingo (docs/spec/10: a streak is a
-- gift, not a debt). The calendar rules themselves (five-Sunday months, anniversaries a day
-- away) are `056`'s.
--
-- On FIXED dates since W4.16: whether a run of weeks has covered a calendar month depends on
-- which weeks they are, so a history built backwards from today would pass on some days and
-- fail on others. Attendance is inserted as a trusted writer (no auth.uid()), which is the only
-- way to state a service_date directly; as a member every row would be clamped to today.

begin;
create extension if not exists pgtap with schema extensions;
select plan(24);

\set glasgow '00000000-0000-4000-8000-000000000001'

\set climber 'a0000000-0000-4000-8000-0000000000b1'
\set faller 'a0000000-0000-4000-8000-0000000000b2'

insert into auth.users (id, email) values
  (:'climber', 't031-climber@test.local'),
  (:'faller', 't031-faller@test.local');

insert into public.profiles (id, email, display_name, branch_id, role, onboarded_at) values
  (:'climber', 't031-climber@test.local', 'T031 Climber', :'glasgow', 'member', now()),
  (:'faller', 't031-faller@test.local', 'T031 Faller', :'glasgow', 'member', now());

-- --- 1. the time ladder has no last rung ----------------------------------------------------

select is(
  (select array_agg(r order by r) from public.rhythm_time_rungs(date '2026-09-06', date '2026-12-05') r),
  null,
  'under three months there is no time rung yet'
);

select is(
  (select array_agg(r order by r) from public.rhythm_time_rungs(date '2026-09-06', date '2026-12-06') r),
  array[12],
  'three calendar months reaches the first, a season'
);

select is(
  (select array_agg(r order by r) from public.rhythm_time_rungs(date '2026-09-06', date '2027-08-01') r),
  array[12, 26],
  'the named tiers arrive at a season and half a year'
);

select is(
  (select array_agg(r order by r) from public.rhythm_time_rungs(date '2026-09-06', date '2027-09-06') r),
  array[12, 26, 52],
  'a year of Sundays is the last NAMED tier'
);

select is(
  (select array_agg(r order by r) from public.rhythm_time_rungs(date '2026-09-06', date '2028-09-06') r),
  array[12, 26, 52, 104],
  'and the year after it is a rung of its own'
);

select is(
  (select array_agg(r order by r) from public.rhythm_time_rungs(date '2026-09-06', date '2036-09-06') r),
  array[12, 26, 52, 104, 156, 208, 260, 312, 364, 416, 468, 520],
  'ten years in, every year is still a rung: the ladder does not end'
);

-- The property that matters more than any single value: there is ALWAYS a next one.
select ok(
  (select count(*) from public.rhythm_time_rungs(date '2026-09-06', date '2126-09-06'))
    > (select count(*) from public.rhythm_time_rungs(date '2026-09-06', date '2036-09-06')),
  'a hundred years of Sundays still has more rungs than ten'
);

-- --- 2. the gathering ladder is cumulative and equally endless -------------------------------

select is(
  (select array_agg(r order by r) from public.rhythm_gathering_rungs(9) r),
  null,
  'nine gatherings is short of the first rung (first_service marks the first one)'
);

select is(
  (select array_agg(r order by r) from public.rhythm_gathering_rungs(100) r),
  array[10, 25, 50, 100],
  'the named gathering tiers are 10, 25, 50 and 100'
);

select is(
  (select array_agg(r order by r) from public.rhythm_gathering_rungs(500) r),
  array[10, 25, 50, 100, 200, 300, 400, 500],
  'and then one per hundred, without end'
);

-- --- 3. what a check-in actually awards ------------------------------------------------------

-- Every Sunday of September 2026: a month of Sundays and four gatherings.
insert into public.attendance (profile_id, branch_id, service_date, source)
select :'climber', :'glasgow', d::date, 'here_button'
from generate_series(timestamp '2026-09-06', timestamp '2026-09-27', interval '7 days') as d;

select is(
  (select count(*) from public.milestones where profile_id = :'climber' and kind = 'first_service'),
  1::bigint,
  'the first Sunday is marked'
);

select is(
  (select count(*) from public.milestones where profile_id = :'climber' and kind = '4_week_rhythm'),
  1::bigint,
  'a whole calendar month awards the month of Sundays'
);

select is(
  (select count(*) from public.milestones where profile_id = :'climber' and kind like '%_gatherings'),
  0::bigint,
  'four gatherings is short of the ten-gathering rung'
);

select is(
  (select count(*) from public.milestones where profile_id = :'climber' and kind = '12_week_rhythm'),
  0::bigint,
  'and nothing above the run is awarded early'
);

-- --- 4. self-healing: rungs skipped over are awarded on the next check-in --------------------

-- Backfill enough history to put the climber past a year, in ONE statement and so without a
-- single check-in of its own that could have awarded the rungs on the way: this is the shape a
-- late offline replay or a corrected record takes.
insert into public.attendance (profile_id, branch_id, service_date, source)
select :'climber', :'glasgow', d::date, 'here_button'
from generate_series(timestamp '2026-10-04', timestamp '2027-10-31', interval '7 days') as d
on conflict (profile_id, service_date) do nothing;

select is(
  (select current_weeks from public.streaks where profile_id = :'climber'),
  61,
  'sixty-one Sundays running, 6 September 2026 to 31 October 2027'
);

select ok(
  (select count(*) from public.milestones where profile_id = :'climber' and kind = '52_week_rhythm') = 1,
  'a year of Sundays was awarded on the way past, not skipped'
);

select is(
  (select count(*) from public.milestones where profile_id = :'climber' and kind = '104_week_rhythm'),
  0::bigint,
  'but two years is not awarded at fourteen months'
);

select is(
  (select count(*) from public.milestones where profile_id = :'climber' and kind = '50_gatherings'),
  1::bigint,
  'and the fiftieth gathering arrived with them'
);

select is(
  (select count(*) from public.milestones where profile_id = :'climber' and kind like '%_gatherings'),
  3::bigint,
  'ten, twenty-five and fifty: every gathering rung passed, and no more'
);

-- --- 5. nothing is ever awarded twice, or taken away -----------------------------------------

-- One more Sunday, which reaches no new rung.
insert into public.attendance (profile_id, branch_id, service_date, source)
values (:'climber', :'glasgow', '2027-11-07', 'here_button')
on conflict (profile_id, service_date) do nothing;

select is(
  (select count(*) from public.milestones where profile_id = :'climber' and kind = '52_week_rhythm'),
  1::bigint,
  'a rung already held is not awarded again (unique(profile_id, kind))'
);

-- --- 6. a broken streak keeps every badge -----------------------------------------------------

-- The faller: five Sundays from 6 September 2026, covering September.
insert into public.attendance (profile_id, branch_id, service_date, source)
select :'faller', :'glasgow', d::date, 'here_button'
from generate_series(timestamp '2026-09-06', timestamp '2026-10-04', interval '7 days') as d;

select is(
  (select count(*) from public.milestones where profile_id = :'faller' and kind = '4_week_rhythm'),
  1::bigint,
  'the faller held a month of Sundays'
);

-- Then three missed Sundays (11, 18 and 25 October) and one back, on 1 November.
insert into public.attendance (profile_id, branch_id, service_date, source)
values (:'faller', :'glasgow', '2026-11-01', 'here_button');

select is(
  (select current_weeks from public.streaks where profile_id = :'faller'),
  1,
  'three missed weeks start the run again at one'
);

select is(
  (select count(*) from public.milestones where profile_id = :'faller' and kind = '4_week_rhythm'),
  1::bigint,
  'and the month of Sundays is STILL HELD: this is the difference from Duolingo'
);

select is(
  (select longest_weeks from public.streaks where profile_id = :'faller'),
  5,
  'the longest is untouched by the fall (docs/spec/02: monotonic)'
);

select finish();
rollback;
