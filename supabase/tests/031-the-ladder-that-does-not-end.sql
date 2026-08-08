-- The ladder that does not end (W2.8 slice 5, migration 20260808214722).
--
-- Two ladders that answer different questions, and the difference is the whole design:
--
--   week rungs      "how long without a gap": streak-based, so it resets after two missed
--                   weeks and a member can lose their PLACE on it
--   gathering count "how many times, ever": cumulative, so nothing is ever lost
--
-- What is asserted here is mostly that the awards are ENDLESS and IDEMPOTENT: there is always
-- a next rung, a badge already held is never awarded twice, and a badge is never taken away,
-- because that last property is what makes this not Duolingo (docs/spec/10: a streak is a
-- gift, not a debt).
--
-- Weeks are built backwards from the current ISO week so nothing here starts failing in
-- November. Attendance is inserted as a trusted writer (no auth.uid()), which is the only way
-- to state a service_date directly; as a member every row would be clamped to today.

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

-- --- 1. the week ladder has no last rung ----------------------------------------------------

select is(
  (select array_agg(r order by r) from public.rhythm_week_rungs(3) r),
  null,
  'under four weeks there is no rung yet'
);

select is(
  (select array_agg(r order by r) from public.rhythm_week_rungs(4) r),
  array[4],
  'four weeks reaches the first rung'
);

select is(
  (select array_agg(r order by r) from public.rhythm_week_rungs(51) r),
  array[4, 12, 26],
  'the named tiers arrive at 4, 12 and 26'
);

select is(
  (select array_agg(r order by r) from public.rhythm_week_rungs(52) r),
  array[4, 12, 26, 52],
  'a year of Sundays is the last NAMED tier'
);

select is(
  (select array_agg(r order by r) from public.rhythm_week_rungs(104) r),
  array[4, 12, 26, 52, 104],
  'and the year after it is a rung of its own'
);

select is(
  (select array_agg(r order by r) from public.rhythm_week_rungs(520) r),
  array[4, 12, 26, 52, 104, 156, 208, 260, 312, 364, 416, 468, 520],
  'ten years in, every year is still a rung: the ladder does not end'
);

-- The property that matters more than any single value: there is ALWAYS a next one.
select ok(
  (select count(*) from public.rhythm_week_rungs(5200)) > (select count(*) from public.rhythm_week_rungs(520)),
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

-- Four consecutive Sundays, ending last week: a four-week run and four gatherings.
insert into public.attendance (profile_id, branch_id, service_date, source)
select :'climber', :'glasgow',
       (date_trunc('week', current_date) - (w || ' weeks')::interval)::date + 6,
       'here_button'
from unnest(array[4, 3, 2, 1]) as w;

select is(
  (select count(*) from public.milestones where profile_id = :'climber' and kind = 'first_service'),
  1::bigint,
  'the first Sunday is marked'
);

select is(
  (select count(*) from public.milestones where profile_id = :'climber' and kind = '4_week_rhythm'),
  1::bigint,
  'four weeks awards the four-week rung'
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

-- Backfill enough history to put the climber well past a year, without a single new
-- "check-in" of its own: this is the shape a late offline replay or a corrected record takes.
insert into public.attendance (profile_id, branch_id, service_date, source)
select :'climber', :'glasgow',
       (date_trunc('week', current_date) - (w || ' weeks')::interval)::date + 6,
       'here_button'
from generate_series(5, 60) as w
on conflict (profile_id, service_date) do nothing;

select is(
  (select current_weeks from public.streaks where profile_id = :'climber'),
  60,
  'sixty Sundays running'
);

select ok(
  (select count(*) from public.milestones where profile_id = :'climber' and kind = '52_week_rhythm') = 1,
  'a year of Sundays was awarded on the way past, not skipped'
);

select is(
  (select count(*) from public.milestones where profile_id = :'climber' and kind = '104_week_rhythm'),
  0::bigint,
  'but two years is not awarded at sixty weeks'
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
values (:'climber', :'glasgow', current_date, 'here_button')
on conflict (profile_id, service_date) do nothing;

select is(
  (select count(*) from public.milestones where profile_id = :'climber' and kind = '52_week_rhythm'),
  1::bigint,
  'a rung already held is not awarded again (unique(profile_id, kind))'
);

-- --- 6. a broken streak keeps every badge -----------------------------------------------------

-- The faller: five weeks, then a gap of three, then one Sunday. The run resets to 1.
insert into public.attendance (profile_id, branch_id, service_date, source)
select :'faller', :'glasgow',
       (date_trunc('week', current_date) - (w || ' weeks')::interval)::date + 6,
       'here_button'
from unnest(array[8, 7, 6, 5, 4]) as w;

select is(
  (select count(*) from public.milestones where profile_id = :'faller' and kind = '4_week_rhythm'),
  1::bigint,
  'the faller reached four weeks'
);

insert into public.attendance (profile_id, branch_id, service_date, source)
values (:'faller', :'glasgow', current_date, 'here_button');

select is(
  (select current_weeks from public.streaks where profile_id = :'faller'),
  1,
  'three missed weeks start the run again at one'
);

select is(
  (select count(*) from public.milestones where profile_id = :'faller' and kind = '4_week_rhythm'),
  1::bigint,
  'and the four-week badge is STILL HELD: this is the difference from Duolingo'
);

select is(
  (select longest_weeks from public.streaks where profile_id = :'faller'),
  5,
  'the longest is untouched by the fall (docs/spec/02: monotonic)'
);

select finish();
rollback;
