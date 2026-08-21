-- W3.5 slice 5a: closing a branch (20260820180000).
--
-- The claim under test is `17` §5's sentence, which is really five: archiving is admin-only
-- and blocked until the leaders are gone; it stops the branch's reminders and broadcasts; it
-- hides the branch; it escalates the residual moderation to admins; and it prompts the
-- members to choose a new home. Three of those were already true before this migration (the
-- app's shared branch query, `service_reminder_batch`'s join, `moderation_alert_batch`'s
-- no-leaders fallback), and the assertions below pin them anyway, because "already true" is
-- a property of today's code rather than of tomorrow's.
--
-- THE RISK THIS FILE EXISTS FOR IS THE SILENT ONE, twice over. An UPDATE a caller is not
-- entitled to make is FILTERED by RLS rather than refused: zero rows, no error, no sign that
-- anything was denied. And a broadcast released to a closed branch would be recorded as
-- `sent` having reached nobody. So several assertions below count rows rather than catch
-- exceptions, and the ones that matter most assert a ZERO or an unchanged row.
--
-- TRAP (see 009's header): `reset role` drops the ROLE but leaves `request.jwt.claims`, so
-- every privileged block below resets both. It matters here more than usual because half
-- these functions behave one way for a member and another for a trusted caller, and a
-- leftover claim would silently test the wrong path.
--
-- TRAP (see 019): never CALL a function the current role lacks EXECUTE on; the backend
-- segfaults. The ACL assertions read the catalogue and never probe by invoking.
--
-- TRAP (see 038/041/044/046): these functions read LIVE STATE, and the dev seed carries four
-- branches, real events and real members. Every count below is scoped to this file's own
-- fixtures, and the branch being closed is one this file creates rather than a seeded one.
begin;
create extension if not exists pgtap with schema extensions;
select plan(55);

-- ===========================================================================
-- 0. Fixtures.
-- ===========================================================================

\set closing '98000000-0000-4000-8000-0000000000b1'
\set glasgow '00000000-0000-4000-8000-000000000001'
\set berlin  '00000000-0000-4000-8000-000000000002'

\set admin_a '98000000-0000-4000-8000-00000000000a'
\set admin_b '98000000-0000-4000-8000-00000000000b'
\set leader  '98000000-0000-4000-8000-00000000000c'
\set cooldown_member '98000000-0000-4000-8000-00000000000d'
\set asking_member   '98000000-0000-4000-8000-00000000000e'
\set open_member     '98000000-0000-4000-8000-00000000000f'

\set future_event '98000000-0000-4000-8000-0000000000e1'
\set past_event   '98000000-0000-4000-8000-0000000000e2'
\set sending_cast '98000000-0000-4000-8000-0000000000c1'
\set waiting_cast '98000000-0000-4000-8000-0000000000c2'
\set family_cast  '98000000-0000-4000-8000-0000000000c3'
\set later_cast   '98000000-0000-4000-8000-0000000000c4'
\set waiting_post '98000000-0000-4000-8000-00000000000d'

-- A branch of this file's own, so nothing here disturbs a seeded one and every count can be
-- scoped to it.
insert into public.branches
  (id, slug, name, city, country, is_hq, timezone, languages, email, lat, lng, "order")
values
  (:'closing', 'test-closing', 'AGBC Test Closing', 'Testville', 'Scotland', false,
   'Europe/London', 'English', 'closing@test.local', 55.86, -4.25, 99);

insert into public.branch_services (branch_id, weekday, start_time, kind, duration_min, label)
values (:'closing', 0, '11:00', 'sunday', 120, 'Sunday Worship');

insert into auth.users (id, email) values
  (:'admin_a', 'closing-admin-a@test.local'),
  (:'admin_b', 'closing-admin-b@test.local'),
  (:'leader', 'closing-leader@test.local'),
  (:'cooldown_member', 'closing-cooldown@test.local'),
  (:'asking_member', 'closing-asking@test.local'),
  (:'open_member', 'closing-open@test.local');

insert into public.profiles
  (id, email, display_name, branch_id, role, onboarded_at, age_confirmed_at)
values
  (:'admin_a', 'closing-admin-a@test.local', 'Admin A', :'glasgow', 'admin', now(), now()),
  (:'admin_b', 'closing-admin-b@test.local', 'Admin B', :'glasgow', 'admin', now(), now()),
  (:'leader', 'closing-leader@test.local', 'Closing Leader', :'closing', 'leader',
   now(), now()),
  (:'cooldown_member', 'closing-cooldown@test.local', 'Recently Moved', :'closing', 'member',
   now(), now()),
  (:'asking_member', 'closing-asking@test.local', 'Already Asking', :'closing', 'member',
   now(), now()),
  (:'open_member', 'closing-open@test.local', 'Still Open', :'glasgow', 'member',
   now(), now());

-- Its diary: one still to come, one already held.
insert into public.events
  (id, branch_id, title, description, starts_at_local, location, status, rsvp_enabled,
   timezone)
values
  (:'future_event', :'closing', 'Closing Branch Picnic', 'Before the news',
   (now() + interval '30 days')::timestamp, 'The park', 'scheduled', true, ''),
  (:'past_event', :'closing', 'Last Easter', 'Already held',
   (now() - interval '120 days')::timestamp, 'The hall', 'scheduled', true, '');

-- Its post: one going out, one waiting for an approver, one from the whole family, and one
-- that turns up AFTER the branch has closed (section 4 needs a fresh pending row, because
-- archiving rejects the ones it finds).
-- `broadcasts_sent_rows_are_approved` insists a row past the composer names its approver, so
-- the two in flight carry one. That constraint is the four-eyes rule as data (20260819180000)
-- and a fixture that dodged it would be testing a row the schema does not allow.
insert into public.broadcasts
  (id, author_id, scope, branch_id, title, body, status, approved_by)
values
  (:'sending_cast', :'admin_a', 'branch', :'closing', 'Half sent', 'Body', 'sending',
   :'admin_b'),
  (:'waiting_cast', :'admin_a', 'branch', :'closing', 'Waiting', 'Body', 'pending_approval',
   null),
  (:'family_cast', :'admin_a', 'ministry', null, 'Everyone', 'Body', 'sending', :'admin_b'),
  (:'later_cast', :'admin_a', 'branch', :'closing', 'Written later', 'Body', 'draft', null);

-- Something left unmoderated on the branch that is about to close.
insert into public.testimonies
  (id, author_id, branch_id, body, language, status, consent_version, created_at)
values
  (:'waiting_post', :'asking_member', :'closing', 'Still waiting for a leader', 'en',
   'pending', 'content-share-v1', now());

-- A move this member completed days ago, so the 90-day cooldown is live against them.
insert into public.branch_change_requests (id, profile_id, from_branch_id, to_branch_id)
values ('98000000-0000-4000-8000-0000000000f1', :'cooldown_member', :'closing', :'berlin');
update public.branch_change_requests
   set status = 'approved'
 where id = '98000000-0000-4000-8000-0000000000f1';
-- The guard stamps decided_at = now(), which is what makes it a live cooldown.
update public.profiles set branch_id = :'closing' where id = :'cooldown_member';

-- And a move this member has open right now.
insert into public.branch_change_requests (id, profile_id, from_branch_id, to_branch_id)
values ('98000000-0000-4000-8000-0000000000f2', :'asking_member', :'closing', :'berlin');

-- ===========================================================================
-- 1. The three columns nobody may name.
-- ===========================================================================
-- `status`, `archived_at` and `archived_by` are outside the column grant, so the refusal is
-- 42501 at the GRANT layer, before RLS is consulted. That is the point of doing it this way:
-- archiving cannot be reached by writing the column, so it has to go through the function
-- that carries the preconditions.

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"98000000-0000-4000-8000-00000000000a","role":"authenticated","user_role":"admin","aal":"aal2"}';

select throws_ok(
  format($$update public.branches set status = 'archived' where id = %L$$, :'closing'),
  '42501',
  null,
  'an admin at aal2 cannot flip status directly: archiving has one door');

select throws_ok(
  format($$update public.branches set archived_at = now() where id = %L$$, :'closing'),
  '42501',
  null,
  'nor stamp the closure themselves');

select throws_ok(
  format($$update public.branches set archived_by = %L where id = %L$$,
         :'admin_b', :'closing'),
  '42501',
  null,
  'nor put somebody else''s name on it');

-- The ordinary edit the module exists for.
update public.branches set name = 'AGBC Test Closing (renamed)' where id = :'closing';
select is(
  (select name from public.branches where id = :'closing'),
  'AGBC Test Closing (renamed)',
  'an admin at aal2 edits a branch, which is the whole of module 5''s add/edit half');

-- THE SILENT REFUSAL, and the reason this assertion counts rows instead of catching an
-- error: RLS FILTERS an update a caller may not make. A leader gets no exception, no
-- message, and no change, which is exactly what a test aimed at the wrong fixture would
-- mistake for a passing guard.
set local request.jwt.claims to
  '{"sub":"98000000-0000-4000-8000-00000000000c","role":"authenticated","user_role":"leader","branch_id":"98000000-0000-4000-8000-0000000000b1","aal":"aal2"}';

update public.branches set name = 'Leader was here' where id = :'closing';
select is(
  (select name from public.branches where id = :'closing'),
  'AGBC Test Closing (renamed)',
  'a leader''s edit of their own branch changes nothing: branch management is admin-only');

-- The same admin, without a fresh code. Also silent, and also a zero.
set local request.jwt.claims to
  '{"sub":"98000000-0000-4000-8000-00000000000a","role":"authenticated","user_role":"admin","aal":"aal1"}';

update public.branches set name = 'No second factor' where id = :'closing';
select is(
  (select name from public.branches where id = :'closing'),
  'AGBC Test Closing (renamed)',
  'an admin who has not cleared their second factor edits nothing either');

-- ===========================================================================
-- 2. What archiving refuses.
-- ===========================================================================

set local request.jwt.claims to
  '{"sub":"98000000-0000-4000-8000-00000000000e","role":"authenticated","user_role":"member"}';

select throws_ok(
  format($$select public.archive_branch(%L)$$, :'closing'),
  '42501', 'only an admin may close a branch',
  'a member calling the function directly is refused, with no route in the way');

set local request.jwt.claims to
  '{"sub":"98000000-0000-4000-8000-00000000000c","role":"authenticated","user_role":"leader","branch_id":"98000000-0000-4000-8000-0000000000b1","aal":"aal2"}';

select throws_ok(
  format($$select public.archive_branch(%L)$$, :'closing'),
  '42501', 'only an admin may close a branch',
  'and so is the branch''s own leader, who is the person archiving removes');

set local request.jwt.claims to
  '{"sub":"98000000-0000-4000-8000-00000000000a","role":"authenticated","user_role":"admin","aal":"aal1"}';

select throws_ok(
  format($$select public.archive_branch(%L)$$, :'closing'),
  '42501', 'closing a branch needs a fresh code from your authenticator',
  'an admin without a fresh code is refused: `17` puts branch management in the step-up set');

set local request.jwt.claims to
  '{"sub":"98000000-0000-4000-8000-00000000000a","role":"authenticated","user_role":"admin","aal":"aal2"}';

select throws_ok(
  format($$select public.archive_branch(%L)$$, :'glasgow'),
  '23514', null,
  'HQ cannot be closed: it is where the prompt asks everyone else to go');

select throws_ok(
  format($$select public.archive_branch(%L)$$, :'closing'),
  '23514', null,
  'nor can a branch whose leader still points at it (the `17` §5 block)');

-- ===========================================================================
-- 3. What archiving does.
-- ===========================================================================
-- The leader is dealt with the way `17` says: reassigned or demoted, through the one write
-- path to another member's profile that exists.

select public.set_member_role(:'leader', 'member', :'glasgow');

select lives_ok(
  format($$select public.archive_branch(%L)$$, :'closing'),
  'with no leaders left, an admin at aal2 closes the branch');

-- Back to a trusted connection to READ the outcome. `broadcasts` has zero client grants by
-- design (`02`'s matrix row: service-role only), so an assertion made while still wearing
-- the admin's role would fail on the privilege rather than on the claim under test.
reset role;
set local request.jwt.claims to '{}';

select is(
  (select status::text from public.branches where id = :'closing'),
  'archived',
  'the branch is archived, never deleted (`02`): its attendance and content still point here');

select is(
  (select archived_by from public.branches where id = :'closing'),
  :'admin_a'::uuid,
  'the row carries who closed it, stamped from auth.uid() and not from the caller');

select ok(
  (select archived_at is not null from public.branches where id = :'closing'),
  'and when');

select is(
  (select status::text from public.events where id = :'future_event'),
  'cancelled',
  'its next gathering is cancelled, so event-notices tells everyone still holding an RSVP');

select is(
  (select status::text from public.events where id = :'past_event'),
  'scheduled',
  'an event already held is left exactly as it was: cancelling history announces nothing');

select is(
  (select status_changed_by from public.events where id = :'future_event'),
  :'admin_a'::uuid,
  'and the cancellation carries the name of the admin who closed the branch');

select is(
  (select status::text from public.broadcasts where id = :'sending_cast'),
  'halted',
  'a fan-out mid-flight is halted rather than left running at a branch that has closed');

select is(
  (select status::text from public.broadcasts where id = :'waiting_cast'),
  'rejected',
  'and one waiting for an approver is sent back rather than left in the queue for ever');

select matches(
  (select review_note from public.broadcasts where id = :'waiting_cast'),
  'closed',
  'with a note saying why, because the author will read it');

select is(
  (select status::text from public.broadcasts where id = :'later_cast'),
  'draft',
  'a DRAFT is left where it is: it has not gone anywhere, and the composer now refuses another');

select is(
  (select status::text from public.broadcasts where id = :'family_cast'),
  'sending',
  'the whole family''s broadcast is untouched: closing one branch is not a halt on everything');

-- ===========================================================================
-- 4. Where a closed branch stops reaching people.
-- ===========================================================================

reset role;
set local request.jwt.claims to '{}';

select is(
  (select count(*)::integer from public.broadcast_recipients(:'sending_cast')),
  0,
  'the halted branch broadcast now has no audience at all, so resuming it would send nothing');

-- THE OTHER HALF, and the one worth reading twice: `02` withholds the branch TIER from these
-- members, not everything. Until they re-home, the whole family speaking is the only voice
-- that can still reach them.
select is(
  (select count(*)::integer
     from public.broadcast_recipients(:'family_cast') r
    where r.profile_id in (:'asking_member', :'cooldown_member')),
  2,
  'a MINISTRY broadcast still reaches both members of the closed branch');

select is(
  (select count(*)::integer
     from public.service_reminder_batch(now(), 60, 15) b
    where b.branch_id = :'closing'),
  0,
  'no service reminder is ever due for it again, whatever the hour');

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"98000000-0000-4000-8000-00000000000a","role":"authenticated","user_role":"admin","aal":"aal2"}';

select throws_ok(
  format($$select public.create_broadcast_draft('branch', %L, 'Hello', 'Body')$$, :'closing'),
  '23514', null,
  'the composer refuses to start a message to it, rather than showing a count of zero later');

select throws_ok(
  format($$insert into public.events
             (branch_id, title, description, starts_at_local, location, timezone)
           values (%L, 'After the close', '', %L, 'Somewhere', '')$$,
         :'closing', (now() + interval '10 days')::timestamp),
  '23514', null,
  'and nothing new goes on its diary');

reset role;
set local request.jwt.claims to '{}';

-- The trusted door every guard in this schema leaves open, so a dump restore and a pgTAP
-- fixture can both hold an archived branch's history.
select lives_ok(
  format($$insert into public.events
             (branch_id, title, description, starts_at_local, location, timezone)
           values (%L, 'Restored history', '', %L, 'Somewhere', '')$$,
         :'closing', (now() - interval '300 days')::timestamp),
  'a trusted caller with no user context may still write its history');

-- A draft that reaches the approver AFTER the branch closed: archiving rejected the ones it
-- found, and this is the one that arrives later.
insert into public.broadcasts (id, author_id, scope, branch_id, title, body, status)
values ('98000000-0000-4000-8000-0000000000c5', :'admin_a', 'branch', :'closing',
        'Late arrival', 'Body', 'pending_approval');

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"98000000-0000-4000-8000-00000000000b","role":"authenticated","user_role":"admin","aal":"aal2"}';

select throws_ok(
  $$select public.approve_broadcast('98000000-0000-4000-8000-0000000000c5')$$,
  '23514', null,
  'releasing it is refused: "sent to nobody" is the silent outcome this repo will not record');

-- ===========================================================================
-- 5. The member's own way out.
-- ===========================================================================

set local request.jwt.claims to
  '{"sub":"98000000-0000-4000-8000-00000000000f","role":"authenticated","user_role":"member"}';

select throws_ok(
  format($$select public.rehome_from_archived_branch(%L)$$, :'berlin'),
  '42501', 'your branch is open; a move asks its leader first',
  'a member whose branch is fine cannot use this door: it is an approval and cooldown bypass');

set local request.jwt.claims to
  '{"sub":"98000000-0000-4000-8000-00000000000e","role":"authenticated","user_role":"member"}';

select throws_ok(
  format($$select public.rehome_from_archived_branch(%L)$$, :'closing'),
  '23514', 'that branch is not accepting members',
  'and nobody moves INTO a closed branch, including back into their own');

select lives_ok(
  format($$select public.rehome_from_archived_branch(%L)$$, :'glasgow'),
  'a member of a closed branch picks a new home with nobody''s approval');

select is(
  (select branch_id from public.profiles where id = :'asking_member'),
  :'glasgow'::uuid,
  'and it takes: the profile moves, which no other self-service path can do');

-- Trusted again to read the ledger: `privileged_actions` is admin-read-only (ADR 0015), and
-- the member whose move it records is exactly the reader RLS keeps out of it. Asserting from
-- inside their session would count zero and read as "the trigger never fired", which is the
-- silent failure this file's header is about.
reset role;
set local request.jwt.claims to '{}';

select is(
  (select count(*)::integer
     from public.privileged_actions a
    where a.target_id = :'asking_member' and a.action = 'branch_changed'),
  1,
  'the audit row is written by the trigger, not by the function, and it is the member''s own act');

select is(
  (select actor_id from public.privileged_actions a
    where a.target_id = :'asking_member' and a.action = 'branch_changed'),
  :'asking_member'::uuid,
  'with the member as the actor: nobody assigned this, they chose it');

select is(
  (select status::text from public.branch_change_requests
    where id = '98000000-0000-4000-8000-0000000000f2'),
  'cancelled',
  'the move they had open is closed with it: otherwise a leader approves it next week and moves them twice');

-- THE COOLDOWN, which is the whole reason `02` calls this out as the exception. This member
-- completed a move minutes ago in fixture time; an ordinary request would be refused for 90
-- days, and there is no branch left for them to wait in.
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"98000000-0000-4000-8000-00000000000d","role":"authenticated","user_role":"member"}';

select throws_ok(
  format($$insert into public.branch_change_requests (to_branch_id) values (%L)$$, :'glasgow'),
  '23514', null,
  'an ordinary request from this member is still refused by the 90-day cooldown');

select lives_ok(
  format($$select public.rehome_from_archived_branch(%L)$$, :'glasgow'),
  'and the archived-branch prompt ignores it, because there is no branch left to stay in');

-- ===========================================================================
-- 6. Opening it again.
-- ===========================================================================

set local request.jwt.claims to
  '{"sub":"98000000-0000-4000-8000-00000000000e","role":"authenticated","user_role":"member"}';

select throws_ok(
  format($$select public.restore_branch(%L)$$, :'closing'),
  '42501', 'only an admin may open a branch',
  'a member cannot re-open a branch either');

set local request.jwt.claims to
  '{"sub":"98000000-0000-4000-8000-00000000000a","role":"authenticated","user_role":"admin","aal":"aal2"}';

select lives_ok(
  format($$select public.restore_branch(%L)$$, :'closing'),
  'an admin at aal2 opens it again (decided with Ayo 2026-08-20)');

select is(
  (select status::text from public.branches where id = :'closing'),
  'active',
  'the branch is a place again');

select ok(
  (select archived_at is null and archived_by is null
     from public.branches where id = :'closing'),
  'and the closure stamp is cleared with it, because it is a record of a state, not of history');

select is(
  (select status::text from public.events where id = :'future_event'),
  'cancelled',
  'its cancelled gathering STAYS cancelled: reinstating it would announce a second time');

select is(
  (select branch_id from public.profiles where id = :'asking_member'),
  :'glasgow'::uuid,
  'and a member who has already moved stays where they went: nobody is swept back');

-- ===========================================================================
-- 7. The escalation is a consequence, not a second mechanism.
-- ===========================================================================
-- Closing it again, to look at the queue it leaves behind. The two members have gone, so
-- nothing is in the way this time.

select lives_ok(
  format($$select public.archive_branch(%L)$$, :'closing'),
  'it can be closed a second time, which is what makes restoring safe to offer');

reset role;
set local request.jwt.claims to '{}';

select is(
  (select count(*)::integer
     from public.moderation_alert_batch() b
    where b.branch_id = :'closing'
      and b.recipient_id = :'admin_a'),
  1,
  'the pending post it leaves behind is now an admin''s: the no-leaders fallback IS `02`''s escalation rule');

select is(
  (select count(*)::integer
     from public.moderation_alert_batch() b
    where b.branch_id = :'closing'
      and b.recipient_role = 'leader'),
  0,
  'and no leader is asked about a branch that has none');

-- ===========================================================================
-- 8. Who may call any of it.
-- ===========================================================================
-- Read from the catalogue, never by invoking (019's segfault note).

select ok(
  not has_function_privilege('anon', 'public.archive_branch(uuid)', 'execute'),
  'anon cannot close a branch');

select ok(
  not has_function_privilege('service_role', 'public.rehome_from_archived_branch(uuid)', 'execute'),
  'and a leaked service key cannot move members between branches');

select ok(
  has_function_privilege('authenticated', 'public.rehome_from_archived_branch(uuid)', 'execute'),
  'the member holds it themselves, because it is their own choice to make');

select ok(
  not has_table_privilege('authenticated', 'public.branches', 'delete'),
  'and nobody may delete a branch: they are archived, and the absence is the enforcement');

-- ===========================================================================
-- 9. A closed branch takes no attendance (20260821140000).
-- ===========================================================================
-- `02`'s "branch_services deactivated" turned out to describe ONE caller: the reminder job
-- joins on status. Nothing else asked, so the app went on offering a check-in at a branch
-- that had stopped meeting. The screen is fixed where it is drawn; this is the half that has
-- to hold when the client is stale, deep-linked, or replaying a check-in it queued while
-- offline BEFORE the closure.

reset role;
reset request.jwt.claims;

select is(
  (select status::text from public.branches where id = :'closing'),
  'archived',
  'the branch is closed by the time this section runs (guarding the assertions below)');

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"98000000-0000-4000-8000-00000000000d","role":"authenticated","user_role":"member"}';

select throws_ok(
  format($$insert into public.attendance (branch_id) values (%L)$$, :'closing'),
  '23514',
  null,
  'a member cannot check in at a branch that has closed');

reset role;
reset request.jwt.claims;

-- The trusted path is deliberately NOT refused: it states history rather than claiming to be
-- somewhere, and a closure today must not make last month's attendance unwritable.
select lives_ok(
  format($$insert into public.attendance (profile_id, branch_id, service_date)
           values (%L, %L, current_date - 30)$$, :'cooldown_member', :'closing'),
  'but a trusted writer may still record a gathering that already happened there');

select * from finish();
rollback;
