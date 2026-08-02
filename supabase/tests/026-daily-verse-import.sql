-- The daily-verse batch import and queue depth (W2.7 slice 4, migration 20260802140000).
--
-- Two properties carry this whole surface, and everything below is one of them:
--
--  1. The preview and the write are the same code, so a count the screen shows is a promise
--     the database keeps.
--  2. Depth is measured to the FIRST GAP, not by counting future rows. A language with rows
--     stretching months ahead and a hole next Tuesday is broken next Tuesday, and the app
--     will not say so: it falls back to an older verse and shows it without complaint.
--
-- Fixtures use French and dates offset from current_date, because the dev seeds stock
-- English only (measured 2026-08-02: en 83 days, de/nl/fr zero) and a test that shares a
-- language with the seeds would be reading their data, not its own.
--
-- WHAT THIS FILE CANNOT SEE, so nobody reads it as full coverage: it runs as `postgres`,
-- and PostgREST connects as `authenticator`, which alone preloads `safeupdate`. An
-- unqualified UPDATE is therefore legal here and refused on the only road the app takes;
-- that is exactly how 20260802140000 shipped an import that could not run once, with this
-- file green (fixed in 20260803120000). `load 'safeupdate'` is denied to `postgres`, so the
-- gap cannot be closed from inside pgTAP. What closes it is the dashboard's own server test
-- (apps/dashboard/src/server/verses.test.ts), which calls this function through PostgREST
-- as a real signed-in admin and runs in CI.

begin;
select plan(29);

\set glasgow '00000000-0000-4000-8000-000000000001'

insert into auth.users (id, email, instance_id, aud, role)
values
  ('d0000000-0000-4000-8000-0000000000d1', 't026.admin@example.test',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('d0000000-0000-4000-8000-0000000000d2', 't026.member@example.test',
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

insert into public.profiles (id, email, display_name, role, branch_id, onboarded_at)
values
  ('d0000000-0000-4000-8000-0000000000d1', 't026.admin@example.test', 'T026 Admin',
   'admin', :'glasgow', now()),
  ('d0000000-0000-4000-8000-0000000000d2', 't026.member@example.test', 'T026 Member',
   'member', :'glasgow', now());

select set_config('request.jwt.claims', '', true);

-- --- 1. the date parser refuses rather than guesses ---------------------------------------

select is(public.try_iso_date('2026-08-14'), '2026-08-14'::date,
  'an ISO date parses');
select is(public.try_iso_date('2026-08-32'), null,
  'a well-shaped impossible day is refused, not rolled over');
select is(public.try_iso_date('2026-02-30'), null,
  'and so is 30 February');
-- The one that matters most: Postgres would happily take this, and which day it means
-- depends on DateStyle. A verse silently landing on the wrong day is invisible.
select is(public.try_iso_date('01/02/2026'), null,
  'an ambiguous locale date is refused rather than guessed at');
select is(public.try_iso_date(''), null, 'blank is refused');
select is(public.try_iso_date(null), null, 'null is refused');

-- --- 2. only a live admin may import --------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "d0000000-0000-4000-8000-0000000000d2", "role": "authenticated", "user_role": "admin", "aal": "aal2", "branch_id": "00000000-0000-4000-8000-000000000001"}';
select throws_ok(
  $$select public.import_daily_verses('[]'::jsonb, false, true)$$,
  '42501',
  null,
  'a member holding an admin claim cannot import');

-- anon holds no EXECUTE on the entry point. ASSERTED, never invoked: on this local Postgres
-- calling a function you lack EXECUTE on takes the backend down rather than raising.
select ok(
  not has_function_privilege('anon', 'public.import_daily_verses(jsonb, boolean, boolean)', 'execute'),
  'anon cannot reach the import entry point at all');

-- --- 3. the preview writes nothing ----------------------------------------------------------

set local request.jwt.claims to
  '{"sub": "d0000000-0000-4000-8000-0000000000d1", "role": "authenticated", "user_role": "admin", "aal": "aal2", "branch_id": "00000000-0000-4000-8000-000000000001"}';

select is(
  (public.import_daily_verses(
     jsonb_build_array(
       jsonb_build_object('line', 1, 'date', '2099-03-01', 'language', 'fr',
                          'reference', 'Psaume 1:1', 'text', 'Heureux l''homme')
     ), false, true) ->> 'new')::int,
  1,
  'the preview counts a new day');
select is(
  (select count(*)::int from public.daily_verses where date = '2099-03-01' and language = 'fr'),
  0,
  'and the preview wrote nothing, which is the promise the screen makes');

-- --- 4. every rejection reason, with its line number ------------------------------------------

select is(
  (public.import_daily_verses(
     jsonb_build_array(
       jsonb_build_object('line', 84,  'date', '2026-08-32', 'language', 'de',
                          'reference', 'Psalm 1', 'text', 'x'),
       jsonb_build_object('line', 119, 'date', '2026-09-07', 'language', 'ge',
                          'reference', 'Psalm 1', 'text', 'x'),
       jsonb_build_object('line', 203, 'date', '2026-09-30', 'language', 'fr',
                          'reference', 'Psaume 1', 'text', '   '),
       jsonb_build_object('line', 204, 'date', '2026-09-29', 'language', 'fr',
                          'reference', '', 'text', 'x'),
       jsonb_build_object('line', 205, 'date', '07/08/2026', 'language', 'fr',
                          'reference', 'Psaume 1', 'text', 'x')
     ), false, true) ->> 'invalid')::int,
  5,
  'five unusable rows are all reported, not just the first');

select is(
  (public.import_daily_verses(
     jsonb_build_array(
       jsonb_build_object('line', 84, 'date', '2026-08-32', 'language', 'de',
                          'reference', 'Psalm 1', 'text', 'x')
     ), false, true) #>> '{problems,0,reason}'),
  'date_impossible',
  'an impossible day is named as such');
select is(
  (public.import_daily_verses(
     jsonb_build_array(
       jsonb_build_object('line', 84, 'date', '2026-08-32', 'language', 'de',
                          'reference', 'Psalm 1', 'text', 'x')
     ), false, true) #>> '{problems,0,line}'),
  '84',
  'and carries the importer''s own line number, not its position in the array');
select is(
  (public.import_daily_verses(
     jsonb_build_array(
       jsonb_build_object('line', 9, 'date', '2026-09-07', 'language', 'ge',
                          'reference', 'Psalm 1', 'text', 'x')
     ), false, true) #>> '{problems,0,reason}'),
  'language_unknown',
  'an unknown language is named');
select is(
  (public.import_daily_verses(
     jsonb_build_array(
       jsonb_build_object('line', 9, 'date', '2026-09-07', 'language', 'fr',
                          'reference', 'Psaume 1', 'text', '  ')
     ), false, true) #>> '{problems,0,reason}'),
  'text_blank',
  'whitespace-only verse text is blank, not text');

-- --- 5. a duplicated day does not take down the batch -----------------------------------------

-- The reason this is its own section. An upsert touching the same (date, language) twice
-- fails the entire statement with "ON CONFLICT DO UPDATE command cannot affect row a second
-- time", so one repeated day in a spreadsheet would otherwise lose an import of 360.
select is(
  (public.import_daily_verses(
     jsonb_build_array(
       jsonb_build_object('line', 1, 'date', '2099-04-01', 'language', 'fr',
                          'reference', 'Psaume 1', 'text', 'premier'),
       jsonb_build_object('line', 2, 'date', '2099-04-01', 'language', 'fr',
                          'reference', 'Psaume 2', 'text', 'doublon'),
       jsonb_build_object('line', 3, 'date', '2099-04-02', 'language', 'fr',
                          'reference', 'Psaume 3', 'text', 'suivant')
     ), false, true) ->> 'invalid')::int,
  1,
  'the second occurrence of a day is the only one reported');

select lives_ok(
  $$select public.import_daily_verses(
      jsonb_build_array(
        jsonb_build_object('line', 1, 'date', '2099-04-01', 'language', 'fr',
                           'reference', 'Psaume 1', 'text', 'premier'),
        jsonb_build_object('line', 2, 'date', '2099-04-01', 'language', 'fr',
                           'reference', 'Psaume 2', 'text', 'doublon'),
        jsonb_build_object('line', 3, 'date', '2099-04-02', 'language', 'fr',
                           'reference', 'Psaume 3', 'text', 'suivant')
      ), false, false)$$,
  'and applying that batch does not abort on the conflict');
select is(
  (select text from public.daily_verses where date = '2099-04-01' and language = 'fr'),
  'premier',
  'the FIRST occurrence is the one that landed');
select is(
  (select count(*)::int from public.daily_verses where date = '2099-04-02' and language = 'fr'),
  1,
  'and the rows after the duplicate still imported');

-- --- 6. keep versus replace ---------------------------------------------------------------

select is(
  (public.import_daily_verses(
     jsonb_build_array(
       jsonb_build_object('line', 1, 'date', '2099-04-01', 'language', 'fr',
                          'reference', 'Psaume 9', 'text', 'remplace')
     ), false, false) ->> 'applied')::int,
  0,
  'keeping what is there applies nothing to a day already scheduled');
select is(
  (select text from public.daily_verses where date = '2099-04-01' and language = 'fr'),
  'premier',
  'and the verse already queued is untouched');

select is(
  (public.import_daily_verses(
     jsonb_build_array(
       jsonb_build_object('line', 1, 'date', '2099-04-01', 'language', 'fr',
                          'reference', 'Psaume 9', 'text', 'remplace')
     ), true, false) ->> 'applied')::int,
  1,
  'replacing applies to the day already scheduled');
select is(
  (select text from public.daily_verses where date = '2099-04-01' and language = 'fr'),
  'remplace',
  'and the verse is overwritten');

select is(
  (select translation from public.daily_verses where date = '2099-04-02' and language = 'fr'),
  'WEB',
  'a missing translation column defaults to WEB, as the frames promise');

-- --- 7. depth measures the gap, not the pile ------------------------------------------------

-- Three French verses covering today, tomorrow, and the day after next. The hole is at
-- today+2. A count of future rows would say 3; the truth is that French breaks in 2 days.
delete from public.daily_verses where language = 'fr';
insert into public.daily_verses (date, reference, text, translation, language)
values
  (current_date,     'Psaume 1', 'aujourd''hui', 'WEB', 'fr'),
  (current_date + 1, 'Psaume 2', 'demain',      'WEB', 'fr'),
  (current_date + 3, 'Psaume 4', 'plus tard',   'WEB', 'fr');

select is(
  (select days_queued from public.daily_verse_depth() where language = 'fr'),
  2,
  'depth reports the gap at today+2, not the three rows sitting in the table');
select is(
  (select runs_out_on from public.daily_verse_depth() where language = 'fr'),
  (current_date + 2),
  'and names the day it runs out');
select is(
  (select stale_from from public.daily_verse_depth() where language = 'fr'),
  (current_date + 1),
  'and the verse members would be stuck on, which is what they will actually see');

-- A language with nothing at all runs out today rather than reporting a comfortable null.
delete from public.daily_verses where language = 'nl';
select is(
  (select days_queued from public.daily_verse_depth() where language = 'nl'),
  0,
  'a language with no verses at all is out today, not undefined');

select is(
  (select count(*)::int from public.daily_verse_depth()),
  4,
  'every language is reported, including the ones nobody has stocked');

select * from finish();
rollback;
