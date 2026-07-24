-- Events write-path invariants (docs/spec/02): every bypass the client could
-- attempt is attempted here and must fail. The RSVP identity is trigger-forced,
-- a cancelled or started event accepts no new intent, "cancel my RSVP" survives
-- every event state, and a past event can never come back from cancellation.
--
-- NOTE (pgTAP trap): `reset role` leaves request.jwt.claims set; every
-- privileged block re-clears it explicitly.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

-- Cast: two live members, one deleted account, one who never finished AUTH-3.
insert into auth.users (id, email) values
  ('93000000-0000-4000-8000-00000000000a', 'evi-member-a@test.local'),
  ('93000000-0000-4000-8000-00000000000b', 'evi-member-b@test.local'),
  ('93000000-0000-4000-8000-00000000000c', 'evi-deleted@test.local'),
  ('93000000-0000-4000-8000-00000000000d', 'evi-half@test.local');
insert into public.profiles
  (id, email, display_name, branch_id, role, onboarded_at, age_confirmed_at)
values
  ('93000000-0000-4000-8000-00000000000a', 'evi-member-a@test.local', 'Member A',
   '00000000-0000-4000-8000-000000000001', 'member', now(), now()),
  ('93000000-0000-4000-8000-00000000000b', 'evi-member-b@test.local', 'Member B',
   '00000000-0000-4000-8000-000000000001', 'member', now(), now()),
  ('93000000-0000-4000-8000-00000000000c', 'evi-deleted@test.local', 'Deleted',
   '00000000-0000-4000-8000-000000000001', 'member', now(), now()),
  ('93000000-0000-4000-8000-00000000000d', 'evi-half@test.local', 'Half Onboarded',
   '00000000-0000-4000-8000-000000000001', 'member', null, null);
update public.profiles set deleted_at = now()
  where id = '93000000-0000-4000-8000-00000000000c';

-- Events: future scheduled / future cancelled / past / RSVP-closed / past
-- cancelled, all Glasgow.
insert into public.events
  (id, branch_id, title, starts_at_local, timezone, status, rsvp_enabled)
values
  ('86000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-000000000001',
   'tapinv future', (current_date + 5) + time '11:00', 'Europe/London', 'scheduled', true),
  ('86000000-0000-4000-8000-00000000000b', '00000000-0000-4000-8000-000000000001',
   'tapinv cancelled', (current_date + 6) + time '19:00', 'Europe/London', 'cancelled', true),
  ('86000000-0000-4000-8000-00000000000c', '00000000-0000-4000-8000-000000000001',
   'tapinv past', (current_date - 2) + time '11:00', 'Europe/London', 'scheduled', true),
  ('86000000-0000-4000-8000-00000000000d', '00000000-0000-4000-8000-000000000001',
   'tapinv closed', (current_date + 7) + time '18:00', 'Europe/London', 'scheduled', false),
  ('86000000-0000-4000-8000-00000000000e', '00000000-0000-4000-8000-000000000001',
   'tapinv past cancelled', (current_date - 10) + time '11:00', 'Europe/London', 'cancelled', true);

-- Member A already RSVP'd to the event that later got cancelled (written
-- privileged, as history: the guard's job is the FUTURE writes against it).
insert into public.rsvps (id, event_id, profile_id, status) values
  ('85000000-0000-4000-8000-00000000000a', '86000000-0000-4000-8000-00000000000b',
   '93000000-0000-4000-8000-00000000000a', 'going');

-- === New intent against a dead or closed event ============================
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"93000000-0000-4000-8000-00000000000b","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001"}';

select throws_ok(
  $$insert into public.rsvps (event_id, profile_id, status)
    values ('86000000-0000-4000-8000-00000000000b',
            '93000000-0000-4000-8000-00000000000b', 'going')$$,
  '23514', null, 'no RSVP into a cancelled event');
select throws_ok(
  $$insert into public.rsvps (event_id, profile_id, status)
    values ('86000000-0000-4000-8000-00000000000c',
            '93000000-0000-4000-8000-00000000000b', 'going')$$,
  '23514', null, 'no RSVP into an event that has already started (late offline replays land here)');
select throws_ok(
  $$insert into public.rsvps (event_id, profile_id, status)
    values ('86000000-0000-4000-8000-00000000000d',
            '93000000-0000-4000-8000-00000000000b', 'interested')$$,
  '23514', null, 'no RSVP while RSVP is switched off for the event');

-- === Identity is server-owned =============================================
set local request.jwt.claims to
  '{"sub":"93000000-0000-4000-8000-00000000000a","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001"}';

select lives_ok(
  $$insert into public.rsvps (event_id, profile_id, status)
    values ('86000000-0000-4000-8000-00000000000a',
            '93000000-0000-4000-8000-00000000000b', 'going')$$,
  'a member may RSVP however they fill in profile_id');
reset role;
set local request.jwt.claims to '{}';
select is((select profile_id from public.rsvps
    where event_id = '86000000-0000-4000-8000-00000000000a'),
  '93000000-0000-4000-8000-00000000000a'::uuid,
  'the forged profile_id was overridden with the caller''s own');

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"93000000-0000-4000-8000-00000000000a","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001"}';
select throws_ok(
  $$insert into public.rsvps (event_id, profile_id, status)
    values ('86000000-0000-4000-8000-00000000000a',
            '93000000-0000-4000-8000-00000000000a', 'interested')$$,
  '23505', null, 'one RSVP per member per event: the second insert collides');

-- === Cancelling stays open; re-committing does not ========================
select lives_ok(
  $$update public.rsvps set status = 'cancelled'
    where id = '85000000-0000-4000-8000-00000000000a'$$,
  'cancelling your own RSVP is allowed whatever happened to the event');
reset role;
set local request.jwt.claims to '{}';
select is((select status from public.rsvps
    where id = '85000000-0000-4000-8000-00000000000a'),
  'cancelled'::public.rsvp_status, 'the cancellation landed');

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"93000000-0000-4000-8000-00000000000a","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001"}';
select throws_ok(
  $$update public.rsvps set status = 'going'
    where id = '85000000-0000-4000-8000-00000000000a'$$,
  '23514', null, 'an RSVP cannot be re-committed to a cancelled event');
select throws_ok(
  $$update public.rsvps set event_id = '86000000-0000-4000-8000-00000000000a'
    where id = '85000000-0000-4000-8000-00000000000a'$$,
  '23514', null, 'an RSVP cannot be moved to another event');
select throws_ok(
  $$update public.rsvps set profile_id = '93000000-0000-4000-8000-00000000000b'
    where id = '85000000-0000-4000-8000-00000000000a'$$,
  '23514', null, 'an RSVP cannot be handed to another member');

-- === Dead and half-created accounts cannot write ==========================
set local request.jwt.claims to
  '{"sub":"93000000-0000-4000-8000-00000000000c","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001"}';
select throws_ok(
  $$insert into public.rsvps (event_id, profile_id, status)
    values ('86000000-0000-4000-8000-00000000000a',
            '93000000-0000-4000-8000-00000000000c', 'going')$$,
  '42501', null, 'a deleted account cannot RSVP (second-device replay hole, docs/spec/02)');
set local request.jwt.claims to
  '{"sub":"93000000-0000-4000-8000-00000000000d","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001"}';
select throws_ok(
  $$insert into public.rsvps (event_id, profile_id, status)
    values ('86000000-0000-4000-8000-00000000000a',
            '93000000-0000-4000-8000-00000000000d', 'going')$$,
  '42501', null, 'an account that never finished AUTH-3 cannot RSVP');

-- === Event lifecycle invariants ===========================================
reset role;
set local request.jwt.claims to '{}';

select throws_ok(
  $$update public.events set status = 'scheduled'
    where id = '86000000-0000-4000-8000-00000000000e'$$,
  '23514', null, 'a past event cannot be reinstated, by anyone');
select lives_ok(
  $$update public.events set status = 'scheduled'
    where id = '86000000-0000-4000-8000-00000000000b'$$,
  'a future cancelled event can be reinstated');
select is((select status from public.events
    where id = '86000000-0000-4000-8000-00000000000b'),
  'scheduled'::public.event_status, 'the reinstatement landed');

insert into public.events (id, branch_id, title, starts_at_local)
values ('86000000-0000-4000-8000-00000000000f', '00000000-0000-4000-8000-000000000002',
        'tapinv tz from branch', (current_date + 9) + time '19:00');
select is((select timezone from public.events
    where id = '86000000-0000-4000-8000-00000000000f'),
  'Europe/Berlin', 'a branch event''s timezone defaults to the branch''s zone');

insert into public.events (id, branch_id, title, starts_at_local)
values ('86000000-0000-4000-8000-000000000010', null,
        'tapinv tz global', (current_date + 9) + time '10:00');
select is((select timezone from public.events
    where id = '86000000-0000-4000-8000-000000000010'),
  'Europe/London', 'a ministry-wide event''s timezone defaults to HQ''s zone');

select throws_ok(
  $$insert into public.events (branch_id, title, starts_at_local, ends_at_local, timezone)
    values ('00000000-0000-4000-8000-000000000001', 'tapinv backwards',
            (current_date + 5) + time '12:00', (current_date + 5) + time '11:00',
            'Europe/London')$$,
  '23514', null, 'an event cannot end before it starts');

select * from finish();
rollback;
