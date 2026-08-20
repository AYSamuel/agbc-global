-- W3.5 slice 4: the event notices (20260820120000).
--
-- The claim under test is `11`'s promise, which has two halves: a posted event reaches the
-- right audience at the right scope, and "cancelling or rescheduling a published event
-- notifies every non-cancelled RSVP". Both are derived in SQL, so both are provable here.
--
-- The risk this file exists for is the SILENT one. Every failure mode in this design is a
-- notification that does not happen, or one that happens to the wrong people: a cancellation
-- swallowed by a key already used, a member who switched branch news off never hearing that
-- the event they booked is off, an undo that announces itself anyway. None of those raise an
-- error, and none are visible from the dashboard. So most assertions below are counts of who
-- is due, and the ones that matter most assert a ZERO.
--
-- TRAP (see 009's header): `reset role` drops the ROLE but leaves `request.jwt.claims`, so
-- every privileged block below resets both. It matters here because the update guard behaves
-- one way for a member and another for a trusted caller, and a leftover claim would silently
-- test the wrong path.
--
-- TRAP (see 019): never CALL a function the current role lacks EXECUTE on; the backend
-- segfaults. The ACL assertions read the catalogue and never probe by invoking.
--
-- TRAP (see 038/041/044): these functions read LIVE STATE, and the dev seed carries events of
-- its own. Every count below is scoped to this file's own fixtures.
begin;
create extension if not exists pgtap with schema extensions;
select plan(52);

-- ===========================================================================
-- 0. Fixtures.
-- ===========================================================================

insert into auth.users (id, email) values
  ('97000000-0000-4000-8000-00000000000a', 'notice-going@test.local'),
  ('97000000-0000-4000-8000-00000000000b', 'notice-interested@test.local'),
  ('97000000-0000-4000-8000-00000000000c', 'notice-cancelled@test.local'),
  ('97000000-0000-4000-8000-00000000000d', 'notice-quiet@test.local'),
  ('97000000-0000-4000-8000-00000000000e', 'notice-glasgow@test.local'),
  ('97000000-0000-4000-8000-00000000000f', 'notice-leader@test.local');

insert into public.profiles
  (id, email, display_name, branch_id, role, onboarded_at, age_confirmed_at)
values
  ('97000000-0000-4000-8000-00000000000a', 'notice-going@test.local', 'Going',
   '00000000-0000-4000-8000-000000000002', 'member', now(), now()),
  ('97000000-0000-4000-8000-00000000000b', 'notice-interested@test.local', 'Interested',
   '00000000-0000-4000-8000-000000000002', 'member', now(), now()),
  ('97000000-0000-4000-8000-00000000000c', 'notice-cancelled@test.local', 'Not Coming',
   '00000000-0000-4000-8000-000000000002', 'member', now(), now()),
  -- Berlin, but with branch news switched off: the member the two tiers disagree about.
  ('97000000-0000-4000-8000-00000000000d', 'notice-quiet@test.local', 'Quiet',
   '00000000-0000-4000-8000-000000000002', 'member', now(), now()),
  ('97000000-0000-4000-8000-00000000000e', 'notice-glasgow@test.local', 'Glasgow',
   '00000000-0000-4000-8000-000000000001', 'member', now(), now()),
  ('97000000-0000-4000-8000-00000000000f', 'notice-leader@test.local', 'Berlin Leader',
   '00000000-0000-4000-8000-000000000002', 'leader', now(), now());

update public.notification_prefs
set branch_updates = false, ministry_announcements = false
where profile_id = '97000000-0000-4000-8000-00000000000d';

-- ===========================================================================
-- 1. The kind. Pure arithmetic on what was said versus what is true.
-- ===========================================================================

select is(
  public.event_notice_kind(null, null, null, 'scheduled', '2026-09-05 19:00', 'Hall'),
  'posted',
  'an event nobody has been told about is a posting');

select is(
  public.event_notice_kind(null, null, null, 'cancelled', '2026-09-05 19:00', 'Hall'),
  null,
  'and one cancelled before anyone was told is nothing at all');

select is(
  public.event_notice_kind('scheduled', '2026-09-05 19:00', 'Hall',
                           'cancelled', '2026-09-05 19:00', 'Hall'),
  'cancelled',
  'off after being announced is a cancellation');

select is(
  public.event_notice_kind('cancelled', '2026-09-05 19:00', 'Hall',
                           'scheduled', '2026-09-05 19:00', 'Hall'),
  'reinstated',
  'and back on again is its own notice, not another cancellation');

select is(
  public.event_notice_kind('scheduled', '2026-09-05 19:00', 'Hall',
                           'scheduled', '2026-09-05 20:00', 'Hall'),
  'moved',
  'a new time is a move');

select is(
  public.event_notice_kind('scheduled', '2026-09-05 19:00', 'Hall',
                           'scheduled', '2026-09-05 19:00', 'The Annexe'),
  'moved',
  'so is a new venue (docs/spec/11: "changing time or venue")');

select is(
  public.event_notice_kind('scheduled', '2026-09-05 19:00', 'Hall',
                           'scheduled', '2026-09-05 19:00', 'Hall'),
  null,
  'and an identical plan owes nobody anything: this is the undo');

select is(
  public.event_notice_kind('cancelled', '2026-09-05 19:00', 'Hall',
                           'cancelled', '2026-09-05 20:00', 'Hall'),
  null,
  'moving an event that is already off tells nobody: it is still off');

-- ===========================================================================
-- 2. The key. `02`'s rule, and the collision the rule alone does not cover.
-- ===========================================================================

select is(
  public.event_notice_key('moved', '97000000-0000-4000-8000-0000000000e1',
                          '2026-09-05 19:00', 2),
  'event_moved:97000000-0000-4000-8000-0000000000e1:2026-09-05T19:00:r2',
  'the key carries the occurrence it announces, including its local start (docs/spec/02)');

select isnt(
  public.event_notice_key('moved', '97000000-0000-4000-8000-0000000000e1',
                          '2026-09-05 19:00', 2),
  public.event_notice_key('moved', '97000000-0000-4000-8000-0000000000e1',
                          '2026-09-05 20:00', 3),
  'a rescheduled event mints a new key, so its notice is not swallowed by the old one');

select isnt(
  public.event_notice_key('moved', '97000000-0000-4000-8000-0000000000e1',
                          '2026-09-05 19:00', 2),
  public.event_notice_key('moved', '97000000-0000-4000-8000-0000000000e1',
                          '2026-09-05 19:00', 4),
  'and an event moved BACK to a time it already had mints another: the revision is why');

select isnt(
  public.event_notice_key('cancelled', '97000000-0000-4000-8000-0000000000e1',
                          '2026-09-05 19:00', 2),
  public.event_notice_key('reinstated', '97000000-0000-4000-8000-0000000000e1',
                          '2026-09-05 19:00', 2),
  'two different things said about one occurrence are two different keys');

-- ===========================================================================
-- 3. A new event is unannounced, and a leader cannot say otherwise.
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims = '{"sub":"97000000-0000-4000-8000-00000000000f","role":"authenticated"}';

insert into public.events
  (id, branch_id, title, starts_at_local, timezone, location, status, rsvp_enabled,
   announced_status, announced_starts_at_local, announced_location)
values
  ('97000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-000000000002',
   'Night of Worship', (current_date + 30) + time '19:00', 'Europe/Berlin',
   'Prinzenstr. 84', 'scheduled', true,
   -- The forgery: a leader claiming the audience has already been told, which would silence
   -- every notice this event will ever owe.
   'scheduled', (current_date + 30) + time '19:00', 'Prinzenstr. 84');

reset role;
reset request.jwt.claims;

select is(
  (select announced_status from public.events
   where id = '97000000-0000-4000-8000-0000000000e1'),
  null,
  'the writer does not get to say what has been announced: the guard clears it');

select is(
  (select notice_revision from public.events
   where id = '97000000-0000-4000-8000-0000000000e1'),
  1,
  'and a new event starts at revision 1');

-- ===========================================================================
-- 4. The settle window is the undo.
-- ===========================================================================

select is(
  (select count(*)::int from public.due_event_notices(now())
   where event_id = '97000000-0000-4000-8000-0000000000e1'),
  0,
  'an event saved a moment ago is not announced yet: it has not settled');

select is(
  (select kind from public.due_event_notices(now() + interval '5 minutes')
   where event_id = '97000000-0000-4000-8000-0000000000e1'),
  'posted',
  'once it has been still for two minutes, the posting is due');

-- The cancellation nobody hears, because it was undone inside the window. This is the
-- decision Ayo took in place of four-eyes on a cancel, so it gets its own assertion.
update public.events set announced_status = 'scheduled',
       announced_starts_at_local = starts_at_local, announced_location = location
where id = '97000000-0000-4000-8000-0000000000e1';

set local role authenticated;
set local request.jwt.claims = '{"sub":"97000000-0000-4000-8000-00000000000f","role":"authenticated"}';
update public.events set status = 'cancelled'
where id = '97000000-0000-4000-8000-0000000000e1';
update public.events set status = 'scheduled'
where id = '97000000-0000-4000-8000-0000000000e1';
reset role;
reset request.jwt.claims;

select is(
  (select count(*)::int from public.due_event_notices(now() + interval '5 minutes')
   where event_id = '97000000-0000-4000-8000-0000000000e1'),
  0,
  'cancelled and reinstated inside the window announces NOTHING: nothing changed');

select cmp_ok(
  (select notice_revision from public.events
   where id = '97000000-0000-4000-8000-0000000000e1'),
  '>',
  1,
  'though the revision moved, which is what keeps the next key unique');

-- ===========================================================================
-- 5. A posting reaches the branch, and only the branch, and only the willing.
-- ===========================================================================

update public.events
set announced_status = null, announced_starts_at_local = null, announced_location = null
where id = '97000000-0000-4000-8000-0000000000e1';

select is(
  (select count(*)::int
   from public.event_notice_recipients('97000000-0000-4000-8000-0000000000e1')
   where profile_id in ('97000000-0000-4000-8000-00000000000a',
                        '97000000-0000-4000-8000-00000000000b',
                        '97000000-0000-4000-8000-00000000000c',
                        '97000000-0000-4000-8000-00000000000f')),
  4,
  'a posted branch event reaches that branch, RSVP or not');

select is(
  (select count(*)::int
   from public.event_notice_recipients('97000000-0000-4000-8000-0000000000e1')
   where profile_id = '97000000-0000-4000-8000-00000000000e'),
  0,
  'and stays in it: Glasgow hears nothing about a Berlin event');

select is(
  (select count(*)::int
   from public.event_notice_recipients('97000000-0000-4000-8000-0000000000e1')
   where profile_id = '97000000-0000-4000-8000-00000000000d'),
  0,
  'a member who switched branch updates off is not told about a new one (docs/spec/15)');

-- ===========================================================================
-- 6. A ministry-wide event reaches every branch.
-- ===========================================================================

insert into public.events
  (id, branch_id, title, starts_at_local, timezone, location, status, rsvp_enabled)
values
  ('97000000-0000-4000-8000-0000000000e2', null,
   'Global Family Sunday', (current_date + 40) + time '10:00', 'Europe/London',
   'Every branch', 'scheduled', true);

select is(
  (select branch_id from public.due_event_notices(now() + interval '5 minutes')
   where event_id = '97000000-0000-4000-8000-0000000000e2'),
  null,
  'branch_id IS NULL is the single source of truth for ministry-wide (docs/spec/02)');

select is(
  (select count(*)::int
   from public.event_notice_recipients('97000000-0000-4000-8000-0000000000e2')
   where profile_id in ('97000000-0000-4000-8000-00000000000a',
                        '97000000-0000-4000-8000-00000000000e')),
  2,
  'a ministry-wide event reaches Berlin AND Glasgow: the whole family (docs/spec/11)');

select is(
  (select count(*)::int
   from public.event_notice_recipients('97000000-0000-4000-8000-0000000000e2')
   where profile_id = '97000000-0000-4000-8000-00000000000d'),
  0,
  'gated on ministry_announcements, which is the tier it arrives on');

-- ===========================================================================
-- 7. A change reaches the people who said they were coming, and nobody else.
-- ===========================================================================

insert into public.rsvps (event_id, profile_id, status) values
  ('97000000-0000-4000-8000-0000000000e1', '97000000-0000-4000-8000-00000000000a', 'going'),
  ('97000000-0000-4000-8000-0000000000e1', '97000000-0000-4000-8000-00000000000b', 'interested'),
  ('97000000-0000-4000-8000-0000000000e1', '97000000-0000-4000-8000-00000000000c', 'cancelled'),
  ('97000000-0000-4000-8000-0000000000e1', '97000000-0000-4000-8000-00000000000d', 'going');

update public.events
set announced_status = 'scheduled',
    announced_starts_at_local = starts_at_local,
    announced_location = location
where id = '97000000-0000-4000-8000-0000000000e1';

set local role authenticated;
set local request.jwt.claims = '{"sub":"97000000-0000-4000-8000-00000000000f","role":"authenticated"}';
update public.events set status = 'cancelled'
where id = '97000000-0000-4000-8000-0000000000e1';
reset role;
reset request.jwt.claims;

select is(
  (select kind from public.due_event_notices(now() + interval '5 minutes')
   where event_id = '97000000-0000-4000-8000-0000000000e1'),
  'cancelled',
  'a cancelled event owes a cancellation notice');

select is(
  (select count(*)::int
   from public.event_notice_recipients('97000000-0000-4000-8000-0000000000e1')),
  3,
  'to every non-cancelled RSVP, and to nobody else in the branch (docs/spec/11)');

select is(
  (select count(*)::int
   from public.event_notice_recipients('97000000-0000-4000-8000-0000000000e1')
   where profile_id = '97000000-0000-4000-8000-00000000000d'),
  1,
  'INCLUDING the member who turned branch news off: this one answers what they did');

select is(
  (select count(*)::int
   from public.event_notice_recipients('97000000-0000-4000-8000-0000000000e1')
   where profile_id = '97000000-0000-4000-8000-00000000000c'),
  0,
  'and excluding the member who cancelled their own RSVP');

-- ===========================================================================
-- 8. The anti-join is the cursor: told once, and only once.
-- ===========================================================================

insert into public.notifications (profile_id, type, template_key, params, deep_link, dedupe_key)
select
  r.profile_id,
  'event_change',
  'event.cancelled',
  '{}'::jsonb,
  '/event/97000000-0000-4000-8000-0000000000e1',
  d.dedupe_key
from public.due_event_notices(now() + interval '5 minutes') d
cross join lateral public.event_notice_recipients(d.event_id) r
where d.event_id = '97000000-0000-4000-8000-0000000000e1';

select is(
  (select count(*)::int
   from public.event_notice_recipients('97000000-0000-4000-8000-0000000000e1')),
  0,
  'a member holding this notice drops off the page: the claim IS the cursor (ADR 0022)');

-- What the job does last, and the reason the next assertion reads 'reinstated' rather than
-- 'moved': the audience's record only advances when the run says it has.
select public.mark_event_announced(
  '97000000-0000-4000-8000-0000000000e1', 'cancelled',
  (current_date + 30) + time '19:00', 'Prinzenstr. 84');

-- And the same members are owed again the moment the plan moves again.
set local role authenticated;
set local request.jwt.claims = '{"sub":"97000000-0000-4000-8000-00000000000f","role":"authenticated"}';
update public.events set status = 'scheduled', starts_at_local = (current_date + 31) + time '19:00'
where id = '97000000-0000-4000-8000-0000000000e1';
reset role;
reset request.jwt.claims;

select is(
  (select kind from public.due_event_notices(now() + interval '5 minutes')
   where event_id = '97000000-0000-4000-8000-0000000000e1'),
  'reinstated',
  'back on at a new time is a reinstatement, which is the notice the member needs');

select is(
  (select count(*)::int
   from public.event_notice_recipients('97000000-0000-4000-8000-0000000000e1')),
  3,
  'and everyone still holding an RSVP is owed it, cancellation notice or not');

-- ===========================================================================
-- 9. A past event is never announced.
-- ===========================================================================

insert into public.events
  (id, branch_id, title, starts_at_local, timezone, location, status, rsvp_enabled)
values
  ('97000000-0000-4000-8000-0000000000e3', '00000000-0000-4000-8000-000000000002',
   'Last Month', (current_date - 5) + time '19:00', 'Europe/Berlin',
   'Prinzenstr. 84', 'scheduled', true);

select is(
  (select count(*)::int from public.due_event_notices(now() + interval '5 minutes')
   where event_id = '97000000-0000-4000-8000-0000000000e3'),
  0,
  'an event that has already happened owes nobody a notice, whatever changed');

-- ===========================================================================
-- 10. Reinstatement stays future-only, and the mark records what it was given.
-- ===========================================================================

update public.events set status = 'cancelled'
where id = '97000000-0000-4000-8000-0000000000e3';

set local role authenticated;
set local request.jwt.claims = '{"sub":"97000000-0000-4000-8000-00000000000f","role":"authenticated"}';
select throws_ok(
  $$update public.events set status = 'scheduled'
    where id = '97000000-0000-4000-8000-0000000000e3'$$,
  '23514',
  'a past event cannot be reinstated',
  'a past event stays cancelled (docs/spec/11), which W1.7 built and this slice keeps');
reset role;
reset request.jwt.claims;

select lives_ok(
  $$select public.mark_event_announced(
      '97000000-0000-4000-8000-0000000000e1',
      'scheduled', (current_date + 31) + time '19:00', 'Prinzenstr. 84')$$,
  'the job records what it announced');

select is(
  (select count(*)::int from public.due_event_notices(now() + interval '5 minutes')
   where event_id = '97000000-0000-4000-8000-0000000000e1'),
  0,
  'and the event stops being due, without any second query deciding so');

-- A plan that moved WHILE the run was delivering is not swallowed by the mark.
set local role authenticated;
set local request.jwt.claims = '{"sub":"97000000-0000-4000-8000-00000000000f","role":"authenticated"}';
update public.events set starts_at_local = (current_date + 32) + time '19:00'
where id = '97000000-0000-4000-8000-0000000000e1';
reset role;
reset request.jwt.claims;

select is(
  (select count(*)::int from public.mark_event_announced(
     '97000000-0000-4000-8000-0000000000e1',
     'scheduled', (current_date + 31) + time '19:00', 'Prinzenstr. 84')),
  1,
  'a stale mark confirms only the plan it was given');

select is(
  (select kind from public.due_event_notices(now() + interval '5 minutes')
   where event_id = '97000000-0000-4000-8000-0000000000e1'),
  'moved',
  'so the newer plan is still owed on the next tick rather than lost');

-- ===========================================================================
-- 10b. The number on the cancel screen is the number that receives.
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims = '{"sub":"97000000-0000-4000-8000-00000000000f","role":"authenticated"}';

select is(
  (select reachable from public.event_rsvp_audience('97000000-0000-4000-8000-0000000000e1')),
  3,
  'the leader is shown exactly the audience the notice reaches: going + interested, live accounts');

select is(
  (select going from public.event_rsvp_audience('97000000-0000-4000-8000-0000000000e1')),
  2,
  'split the way the confirm screen splits it');

reset role;
reset request.jwt.claims;

-- A Glasgow leader asking about a Berlin event.
set local role authenticated;
set local request.jwt.claims = '{"sub":"97000000-0000-4000-8000-00000000000e","role":"authenticated"}';

select is(
  (select reachable from public.event_rsvp_audience('97000000-0000-4000-8000-0000000000e1')),
  0,
  'and another branch''s leader is told nothing about the size of this one');

reset role;
reset request.jwt.claims;

-- ===========================================================================
-- 10c. The number on the NEW EVENT form is the number that receives.
-- ===========================================================================

-- The truth, computed with no role in the way. Counted rather than hard-coded, so the dev
-- seed cannot move this assertion (038's lesson).
create temporary table expected_audience as
select count(*)::int as n
from public.profiles p
left join public.notification_prefs np on np.profile_id = p.id
where p.deleted_at is null
  and p.branch_id = '00000000-0000-4000-8000-000000000002'
  and coalesce(np.branch_updates, true);
-- The role switch below reaches this table too, and a temp table grants nothing by default.
grant select on expected_audience to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub":"97000000-0000-4000-8000-00000000000f","role":"authenticated"}';

-- AND THIS IS WHY THE COUNT IS A DEFINER FUNCTION rather than a query from the dashboard.
-- `notification_prefs` is the member's OWN row and RLS says so, so the same query run as a
-- leader sees no prefs at all, reads every absent row as the column default, and answers one
-- HIGHER than the notice will actually reach. Caught here on the first run (2026-08-20).
select is(
  (select public.event_posting_audience('00000000-0000-4000-8000-000000000002')),
  (select n from expected_audience),
  'the count a leader is shown applies the pref gate the notice applies');

select cmp_ok(
  (select public.event_posting_audience('00000000-0000-4000-8000-000000000002')),
  '<',
  (select count(*)::int from public.profiles
   where deleted_at is null
     and branch_id = '00000000-0000-4000-8000-000000000002'),
  'which is fewer than the branch: the member who switched branch news off is not promised');

select is(
  (select public.event_posting_audience('00000000-0000-4000-8000-000000000001')),
  0,
  'and a leader cannot size another branch');

reset role;
reset request.jwt.claims;

-- ===========================================================================
-- 11. Nobody but the job may ask these questions.
-- ===========================================================================
--
-- Read from the catalogue, never by invoking (019's segfault).

select is(
  has_function_privilege('authenticated', 'public.due_event_notices(timestamptz, interval)', 'execute'),
  false,
  'a member cannot ask which events are about to be announced');

select is(
  has_function_privilege('anon', 'public.event_notice_recipients(uuid, integer)', 'execute'),
  false,
  'and nobody signed out can enumerate a branch through the recipients function');

select is(
  has_function_privilege('authenticated', 'public.event_notice_recipients(uuid, integer)', 'execute'),
  false,
  'nor a member: the audience of a send is not theirs to read');

-- The one exception, and for the reason `broadcast_recipient_count` is the same exception:
-- a leader is deciding whether to cancel and has to see the number first. It gates on
-- can_moderate_branch inside, which is the gate `rsvps`' own SELECT policy already applies.
select is(
  has_function_privilege('authenticated', 'public.event_rsvp_audience(uuid)', 'execute'),
  true,
  'the count a leader is deciding against is theirs to read');

select is(
  has_function_privilege('service_role', 'public.mark_event_announced(uuid, public.event_status, timestamp, text)', 'execute'),
  true,
  'the job can record what it sent');

select is(
  has_function_privilege('authenticated', 'public.mark_event_announced(uuid, public.event_status, timestamp, text)', 'execute'),
  false,
  'and a leader cannot mark their own event announced to silence it');

-- The two pure functions ARE granted, because a trigger runs as the invoking role and the
-- guards call them (W3.4's 42501 lesson, `prayer_reminder_next`). They read no table and
-- disclose nothing that is not already in the row the caller is holding.
select is(
  has_function_privilege('authenticated', 'public.event_notice_kind(public.event_status, timestamp, text, public.event_status, timestamp, text)', 'execute'),
  true,
  'the kind function is pure arithmetic and stays callable, per W3.4 lesson 3');

select is(
  (select count(*)::int from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('due_event_notices', 'event_notice_recipients', 'mark_event_announced')
     and p.prosecdef
     and array_to_string(p.proconfig, ',') = 'search_path=""'),
  3,
  'every definer function pins an empty search_path (the database standard)');

select is(
  (select count(*)::int from cron.job where jobname = 'event-notices'),
  1,
  'and the schedule exists, in the migration rather than in somebody console (ADR 0016)');

select * from finish();
rollback;
