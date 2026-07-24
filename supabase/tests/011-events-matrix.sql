-- Events policy matrix (docs/spec/02) exercised as real reads and real bypass
-- attempts (docs/spec/21 §4). The claim under test: anyone can read what's on,
-- nobody but a moderator can put anything on, an RSVP list is private to its
-- member, and a leader sees attendance only for their own branch's events
-- (ministry-wide stays admin-only).
--
-- Counts are scoped to this suite's own rows throughout ('tap %' titles): the
-- dev seed carries event fixtures, so absolute counts would be hostage to it.
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

-- RLS enabled AND forced, in the same migration as the table (docs/spec/25 §3).
select is((select relrowsecurity from pg_class where oid = 'public.events'::regclass),
  true, 'events: RLS enabled');
select is((select relforcerowsecurity from pg_class where oid = 'public.events'::regclass),
  true, 'events: RLS forced');
select is((select relrowsecurity from pg_class where oid = 'public.rsvps'::regclass),
  true, 'rsvps: RLS enabled');
select is((select relforcerowsecurity from pg_class where oid = 'public.rsvps'::regclass),
  true, 'rsvps: RLS forced');

-- Cast (privileged setup: a direct connection carries no auth.uid()).
-- A Glasgow member, a Glasgow leader, a Berlin leader, an admin, and a Berlin
-- member so cross-member and cross-branch visibility both have a counterparty.
insert into auth.users (id, email) values
  ('92000000-0000-4000-8000-00000000000a', 'ev-member-gla@test.local'),
  ('92000000-0000-4000-8000-00000000000b', 'ev-leader-gla@test.local'),
  ('92000000-0000-4000-8000-00000000000c', 'ev-leader-ber@test.local'),
  ('92000000-0000-4000-8000-00000000000d', 'ev-admin@test.local'),
  ('92000000-0000-4000-8000-00000000000e', 'ev-member-ber@test.local');
insert into public.profiles
  (id, email, display_name, branch_id, role, onboarded_at, age_confirmed_at)
values
  ('92000000-0000-4000-8000-00000000000a', 'ev-member-gla@test.local', 'Glasgow Member',
   '00000000-0000-4000-8000-000000000001', 'member', now(), now()),
  ('92000000-0000-4000-8000-00000000000b', 'ev-leader-gla@test.local', 'Glasgow Leader',
   '00000000-0000-4000-8000-000000000001', 'leader', now(), now()),
  ('92000000-0000-4000-8000-00000000000c', 'ev-leader-ber@test.local', 'Berlin Leader',
   '00000000-0000-4000-8000-000000000002', 'leader', now(), now()),
  ('92000000-0000-4000-8000-00000000000d', 'ev-admin@test.local', 'Admin',
   '00000000-0000-4000-8000-000000000001', 'admin', now(), now()),
  ('92000000-0000-4000-8000-00000000000e', 'ev-member-ber@test.local', 'Berlin Member',
   '00000000-0000-4000-8000-000000000002', 'member', now(), now());

-- Five events: Glasgow future / ministry-wide future / Glasgow cancelled /
-- Glasgow past / Berlin future, so scoping, state and branch boundaries all
-- have a row to bite on.
insert into public.events
  (id, branch_id, title, starts_at_local, timezone, location, status)
values
  ('82000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000001',
   'tap glasgow future', (current_date + 5) + time '11:00', 'Europe/London', 'Glasgow', 'scheduled'),
  ('82000000-0000-4000-8000-00000000000b', null,
   'tap global future', (current_date + 7) + time '10:00', 'Europe/London', 'Everywhere', 'scheduled'),
  ('82000000-0000-4000-8000-00000000000c', '00000000-0000-4000-8000-000000000001',
   'tap glasgow cancelled', (current_date + 6) + time '19:00', 'Europe/London', 'Glasgow', 'cancelled'),
  ('82000000-0000-4000-8000-00000000000d', '00000000-0000-4000-8000-000000000001',
   'tap glasgow past', (current_date - 3) + time '11:00', 'Europe/London', 'Glasgow', 'scheduled'),
  ('82000000-0000-4000-8000-00000000000e', '00000000-0000-4000-8000-000000000002',
   'tap berlin future', (current_date + 8) + time '19:00', 'Europe/Berlin', 'Berlin', 'scheduled');

insert into public.rsvps (id, event_id, profile_id, status) values
  ('84000000-0000-4000-8000-00000000000a', '82000000-0000-4000-8000-00000000000a',
   '92000000-0000-4000-8000-00000000000a', 'going'),
  ('84000000-0000-4000-8000-00000000000b', '82000000-0000-4000-8000-00000000000a',
   '92000000-0000-4000-8000-00000000000e', 'interested'),
  ('84000000-0000-4000-8000-00000000000c', '82000000-0000-4000-8000-00000000000b',
   '92000000-0000-4000-8000-00000000000a', 'going');

-- === Guest =================================================================
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

select is((select count(*) from public.events where title like 'tap %')::int, 5,
  'a guest reads every event, whatever its state (deep links never 404, docs/spec/11)');
select throws_ok(
  $$insert into public.events (branch_id, title, starts_at_local, timezone)
    values ('00000000-0000-4000-8000-000000000001', 'tap guest event',
            (current_date + 9) + time '10:00', 'Europe/London')$$,
  '42501', null, 'a guest cannot create an event');
select throws_ok(
  $$update public.events set title = 'tap defaced'
    where id = '82000000-0000-4000-8000-00000000000a'$$,
  '42501', null, 'a guest cannot update an event');
select throws_ok(
  $$select count(*) from public.rsvps$$,
  '42501', null, 'a guest cannot read the rsvps table at all');
select throws_ok(
  $$insert into public.rsvps (event_id, profile_id, status)
    values ('82000000-0000-4000-8000-00000000000a',
            '92000000-0000-4000-8000-00000000000a', 'going')$$,
  '42501', null, 'a guest cannot RSVP (the app gates first, the DB refuses regardless)');

-- === Glasgow member ========================================================
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"92000000-0000-4000-8000-00000000000a","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001"}';

select is((select count(*) from public.events where title like 'tap %')::int, 5,
  'a member reads every event');
select is((select count(*) from public.rsvps)::int, 2,
  'a member sees exactly their own RSVPs, never another member''s');
select throws_ok(
  $$insert into public.events (branch_id, title, starts_at_local, timezone)
    values ('00000000-0000-4000-8000-000000000001', 'tap member event',
            (current_date + 9) + time '10:00', 'Europe/London')$$,
  '42501', null, 'a member cannot create an event');
select lives_ok(
  $$update public.events set title = 'tap member defaced'
    where id = '82000000-0000-4000-8000-00000000000a'$$,
  'a member''s event update runs (and matches zero rows)');
reset role;
set local request.jwt.claims to '{}';
select is((select title from public.events where id = '82000000-0000-4000-8000-00000000000a'),
  'tap glasgow future', 'the member''s update touched nothing');

-- === Berlin member =========================================================
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"92000000-0000-4000-8000-00000000000e","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000002"}';

select is((select count(*) from public.rsvps)::int, 1,
  'the Berlin member sees only their own RSVP');
select lives_ok(
  $$insert into public.rsvps (event_id, profile_id, status)
    values ('82000000-0000-4000-8000-00000000000e',
            '92000000-0000-4000-8000-00000000000e', 'going')$$,
  'a member RSVPs to a scheduled future event');

-- === Glasgow leader ========================================================
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"92000000-0000-4000-8000-00000000000b","role":"authenticated","user_role":"leader","branch_id":"00000000-0000-4000-8000-000000000001"}';

select is((select count(*) from public.rsvps
    where event_id = '82000000-0000-4000-8000-00000000000a')::int, 2,
  'a leader sees who is coming to their own branch''s event');
select is((select count(*) from public.rsvps
    where event_id = '82000000-0000-4000-8000-00000000000b')::int, 0,
  'a ministry-wide event''s RSVP list stays admin-only');
select lives_ok(
  $$update public.events set location = 'tap moved venue'
    where id = '82000000-0000-4000-8000-00000000000a'$$,
  'a leader updates their own branch''s event');
reset role;
set local request.jwt.claims to '{}';
select is((select location from public.events where id = '82000000-0000-4000-8000-00000000000a'),
  'tap moved venue', 'the leader''s in-branch update landed');
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"92000000-0000-4000-8000-00000000000b","role":"authenticated","user_role":"leader","branch_id":"00000000-0000-4000-8000-000000000001"}';
select lives_ok(
  $$update public.events set title = 'tap leader defaced'
    where id = '82000000-0000-4000-8000-00000000000e'$$,
  'a leader''s update on another branch''s event runs (and matches zero rows)');
reset role;
set local request.jwt.claims to '{}';
select is((select title from public.events where id = '82000000-0000-4000-8000-00000000000e'),
  'tap berlin future', 'the other branch''s event is untouched');
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"92000000-0000-4000-8000-00000000000b","role":"authenticated","user_role":"leader","branch_id":"00000000-0000-4000-8000-000000000001"}';
select lives_ok(
  $$insert into public.events (branch_id, title, starts_at_local, timezone)
    values ('00000000-0000-4000-8000-000000000001', 'tap leader created',
            (current_date + 10) + time '18:00', 'Europe/London')$$,
  'a leader creates an event in their own branch');
select throws_ok(
  $$insert into public.events (branch_id, title, starts_at_local, timezone)
    values (null, 'tap leader global', (current_date + 10) + time '18:00', 'Europe/London')$$,
  '42501', null, 'a leader cannot create a ministry-wide event');

-- === Berlin leader =========================================================
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"92000000-0000-4000-8000-00000000000c","role":"authenticated","user_role":"leader","branch_id":"00000000-0000-4000-8000-000000000002"}';

select is((select count(*) from public.rsvps
    where event_id = '82000000-0000-4000-8000-00000000000a')::int, 0,
  'a leader sees nothing of another branch''s RSVP list');

-- === Admin =================================================================
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"92000000-0000-4000-8000-00000000000d","role":"authenticated","user_role":"admin","branch_id":"00000000-0000-4000-8000-000000000001"}';

select is((select count(*) from public.rsvps r
    where exists (select 1 from public.events e
                  where e.id = r.event_id and e.title like 'tap %'))::int, 4,
  'an admin sees every RSVP, ministry-wide included');
select lives_ok(
  $$insert into public.events (branch_id, title, starts_at_local, timezone)
    values (null, 'tap admin global', (current_date + 12) + time '10:00', 'Europe/London')$$,
  'an admin creates a ministry-wide event');

select * from finish();
rollback;
