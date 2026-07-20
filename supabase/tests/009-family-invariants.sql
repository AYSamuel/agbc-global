-- Every Family write-path invariant from docs/spec/02, attempted as a real client
-- and asserted to fail (docs/spec/21 §4). This file is the reason the app can claim
-- "nothing publishes without a leader's approval" without hedging: the client here
-- has a valid session and sets whatever columns it likes, and still cannot do it.
--
-- The app writes with the anon key plus a user JWT, so anything a policy or trigger
-- does not forbid, a determined client CAN do. Read every lives_ok below as "this is
-- allowed on purpose" and every throws_ok as a door that must stay shut.
--
-- TRAP, for anyone writing the next suite: `reset role` drops the ROLE but leaves
-- `request.jwt.claims` exactly where it was, so auth.uid() keeps returning the last
-- member. Privileged setup after it then runs through the member write path (forced
-- pending, forced authorship, quota checks) and the fixtures come out wrong in ways
-- that look like guard bugs. Always pair it with `set local request.jwt.claims to
-- '{}'`, as every privileged block below does.
begin;
create extension if not exists pgtap with schema extensions;
select plan(48);

-- Cast: an author and a second member in Glasgow, a Glasgow leader, an admin, one
-- member who never finished AUTH-3, one deleted account, and a would-be spammer.
insert into auth.users (id, email) values
  ('91000000-0000-4000-8000-00000000000a', 'inv-author@test.local'),
  ('91000000-0000-4000-8000-00000000000b', 'inv-other@test.local'),
  ('91000000-0000-4000-8000-00000000000c', 'inv-leader@test.local'),
  ('91000000-0000-4000-8000-00000000000d', 'inv-admin@test.local'),
  ('91000000-0000-4000-8000-00000000000e', 'inv-halfway@test.local'),
  ('91000000-0000-4000-8000-00000000000f', 'inv-deleted@test.local'),
  ('91000000-0000-4000-8000-000000000010', 'inv-spammer@test.local');
insert into public.profiles
  (id, email, display_name, branch_id, role, onboarded_at, age_confirmed_at)
values
  ('91000000-0000-4000-8000-00000000000a', 'inv-author@test.local', 'Author',
   '00000000-0000-4000-8000-000000000001', 'member', now(), now()),
  ('91000000-0000-4000-8000-00000000000b', 'inv-other@test.local', 'Other',
   '00000000-0000-4000-8000-000000000001', 'member', now(), now()),
  ('91000000-0000-4000-8000-00000000000c', 'inv-leader@test.local', 'Leader',
   '00000000-0000-4000-8000-000000000001', 'leader', now(), now()),
  ('91000000-0000-4000-8000-00000000000d', 'inv-admin@test.local', 'Admin',
   '00000000-0000-4000-8000-000000000001', 'admin', now(), now()),
  ('91000000-0000-4000-8000-000000000010', 'inv-spammer@test.local', 'Spammer',
   '00000000-0000-4000-8000-000000000001', 'member', now(), now());
-- Signed in, but abandoned AUTH-3: no onboarded_at, so no writes (docs/spec/03).
insert into public.profiles
  (id, email, display_name, branch_id, role, onboarded_at)
values
  ('91000000-0000-4000-8000-00000000000e', 'inv-halfway@test.local', 'Halfway',
   '00000000-0000-4000-8000-000000000001', 'member', null);
-- Deleted account whose second device still holds a valid token (docs/spec/02).
insert into public.profiles
  (id, email, display_name, branch_id, role, onboarded_at, age_confirmed_at, deleted_at)
values
  ('91000000-0000-4000-8000-00000000000f', 'inv-deleted@test.local', 'Deleted',
   '00000000-0000-4000-8000-000000000001', 'member', now(), now(), now());

-- ===========================================================================
-- Content is born pending, and authorship cannot be forged.
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"91000000-0000-4000-8000-00000000000a","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001"}';

-- The client sets every column it wishes it controlled, in one go.
select lives_ok(
  $$insert into public.testimonies
      (id, author_id, branch_id, body, status, consent_version,
       moderated_by, moderated_at, glory_count)
    values ('82000000-0000-4000-8000-00000000000a',
            '91000000-0000-4000-8000-00000000000b',
            '00000000-0000-4000-8000-000000000002',
            'inv forged everything', 'approved', 'tap-v1',
            '91000000-0000-4000-8000-00000000000d', now(), 9999)$$,
  'a member may post a testimony, however they fill in the columns');

reset role;
set local request.jwt.claims to '{}';
select is(
  (select status from public.testimonies where id = '82000000-0000-4000-8000-00000000000a'),
  'pending'::public.content_status,
  'content is born pending however the client sets status');
select is(
  (select author_id from public.testimonies where id = '82000000-0000-4000-8000-00000000000a'),
  '91000000-0000-4000-8000-00000000000a'::uuid,
  'authorship is forced to the caller, not the supplied author_id');
select is(
  (select branch_id from public.testimonies where id = '82000000-0000-4000-8000-00000000000a'),
  '00000000-0000-4000-8000-000000000001'::uuid,
  'branch is forced to the author''s profile branch, not the supplied one');
select is(
  (select moderated_by from public.testimonies where id = '82000000-0000-4000-8000-00000000000a'),
  null::uuid, 'a self-supplied moderator is discarded');
select is(
  (select glory_count from public.testimonies where id = '82000000-0000-4000-8000-00000000000a'),
  0, 'a self-supplied reaction count is discarded');

-- ===========================================================================
-- Only leaders and admins move content, and counters belong to the triggers.
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"91000000-0000-4000-8000-00000000000a","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001"}';

select throws_ok(
  $$update public.testimonies set status = 'approved'
    where id = '82000000-0000-4000-8000-00000000000a'$$,
  '42501', 'moderation is a leader or admin action',
  'an author cannot approve their own testimony');
select throws_ok(
  $$update public.testimonies set glory_count = 500
    where id = '82000000-0000-4000-8000-00000000000a'$$,
  '23514', 'glory_count is maintained by triggers, not by clients',
  'an author cannot inflate their own reaction count');
select throws_ok(
  $$update public.testimonies set author_id = '91000000-0000-4000-8000-00000000000b'
    where id = '82000000-0000-4000-8000-00000000000a'$$,
  '23514', 'authorship, branch, and consent evidence are immutable',
  'an author cannot hand a post to someone else');
select throws_ok(
  $$update public.testimonies set consented_at = now() - interval '1 year'
    where id = '82000000-0000-4000-8000-00000000000a'$$,
  '23514', 'authorship, branch, and consent evidence are immutable',
  'the Art. 9 consent evidence cannot be rewritten');

-- ===========================================================================
-- An edit to approved content re-enters moderation, and moderation is
-- compare-and-set so an edit mid-review cannot publish unreviewed words.
-- ===========================================================================
set local request.jwt.claims to
  '{"sub":"91000000-0000-4000-8000-00000000000c","role":"authenticated","user_role":"leader","branch_id":"00000000-0000-4000-8000-000000000001"}';
select lives_ok(
  $$update public.testimonies set status = 'approved'
    where id = '82000000-0000-4000-8000-00000000000a'$$,
  'the branch leader approves it');

set local request.jwt.claims to
  '{"sub":"91000000-0000-4000-8000-00000000000a","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001"}';
select lives_ok(
  $$update public.testimonies set body = 'inv edited after approval'
    where id = '82000000-0000-4000-8000-00000000000a'$$,
  'the author edits the approved testimony');

reset role;
set local request.jwt.claims to '{}';
select is(
  (select status from public.testimonies where id = '82000000-0000-4000-8000-00000000000a'),
  'pending'::public.content_status,
  'any author edit to approved content resets it to pending');
select is(
  (select moderated_by from public.testimonies where id = '82000000-0000-4000-8000-00000000000a'),
  null::uuid, 'and clears the previous moderator');

-- The race the compare-and-set closes: the leader reviewed version N, the author
-- edited to N+1, and the approval must not land on words nobody read.
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"91000000-0000-4000-8000-00000000000c","role":"authenticated","user_role":"leader","branch_id":"00000000-0000-4000-8000-000000000001"}';
select throws_ok(
  $$update public.testimonies
      set status = 'approved', updated_at = now() - interval '1 hour'
    where id = '82000000-0000-4000-8000-00000000000a'$$,
  '40001', 'content changed since review',
  'approving a version that has since changed is refused');

-- ===========================================================================
-- `removed` is terminal for the author; only an admin restores it.
-- ===========================================================================
set local request.jwt.claims to
  '{"sub":"91000000-0000-4000-8000-00000000000d","role":"authenticated","user_role":"admin","branch_id":"00000000-0000-4000-8000-000000000001"}';
select lives_ok(
  $$update public.testimonies set status = 'removed', rejection_reason = 'tap removal'
    where id = '82000000-0000-4000-8000-00000000000a'$$,
  'an admin removes the testimony');

set local request.jwt.claims to
  '{"sub":"91000000-0000-4000-8000-00000000000a","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001"}';
select throws_ok(
  $$update public.testimonies set body = 'inv edited after removal'
    where id = '82000000-0000-4000-8000-00000000000a'$$,
  '42501', 'removed content cannot be edited; only an admin may restore it',
  'the author cannot edit their way out of a removal');
select lives_ok(
  $$update public.testimonies set deleted_at = now()
    where id = '82000000-0000-4000-8000-00000000000a'$$,
  'but the author may still delete it (removal is not a trap)');

set local request.jwt.claims to
  '{"sub":"91000000-0000-4000-8000-00000000000c","role":"authenticated","user_role":"leader","branch_id":"00000000-0000-4000-8000-000000000001"}';
select throws_ok(
  $$update public.testimonies set status = 'approved'
    where id = '82000000-0000-4000-8000-00000000000a'$$,
  '42501', 'only an admin may restore removed content',
  'a leader cannot un-remove content an admin removed');

-- ===========================================================================
-- The prayer-testimony link cannot be stolen or squatted.
-- ===========================================================================
reset role;
set local request.jwt.claims to '{}';
insert into public.prayers (id, author_id, branch_id, body, status, consent_version)
values
  ('83000000-0000-4000-8000-00000000000a', '91000000-0000-4000-8000-00000000000a',
   '00000000-0000-4000-8000-000000000001', 'inv my request', 'approved', 'tap-v1'),
  ('83000000-0000-4000-8000-00000000000b', '91000000-0000-4000-8000-00000000000b',
   '00000000-0000-4000-8000-000000000001', 'inv their request', 'approved', 'tap-v1'),
  ('83000000-0000-4000-8000-00000000000c', '91000000-0000-4000-8000-00000000000a',
   '00000000-0000-4000-8000-000000000001', 'inv removed request', 'removed', 'tap-v1');

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"91000000-0000-4000-8000-00000000000a","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001"}';

select throws_ok(
  $$insert into public.testimonies (author_id, branch_id, body, consent_version, from_prayer_id)
    values ('91000000-0000-4000-8000-00000000000a',
            '00000000-0000-4000-8000-000000000001',
            'inv squatting a stranger''s answer', 'tap-v1',
            '83000000-0000-4000-8000-00000000000b')$$,
  '23514', 'only the prayer''s author may link a testimony to it',
  'a member cannot fabricate an answered-prayer ribbon on a stranger''s request');
select throws_ok(
  $$insert into public.testimonies (author_id, branch_id, body, consent_version, from_prayer_id)
    values ('91000000-0000-4000-8000-00000000000a',
            '00000000-0000-4000-8000-000000000001',
            'inv linking a removed request', 'tap-v1',
            '83000000-0000-4000-8000-00000000000c')$$,
  '23514', 'a removed prayer cannot be linked to a testimony',
  'and cannot link a removed request even when it is their own');
select lives_ok(
  $$insert into public.testimonies
      (id, author_id, branch_id, body, consent_version, from_prayer_id)
    values ('82000000-0000-4000-8000-00000000000b',
            '91000000-0000-4000-8000-00000000000a',
            '00000000-0000-4000-8000-000000000001',
            'inv my own answer', 'tap-v1', '83000000-0000-4000-8000-00000000000a')$$,
  'linking their own answered request is exactly what the loop is for');

-- ===========================================================================
-- Mark-answered has server-checked preconditions.
-- ===========================================================================
reset role;
set local request.jwt.claims to '{}';
insert into public.prayers (id, author_id, branch_id, body, status, consent_version)
values ('83000000-0000-4000-8000-00000000000d', '91000000-0000-4000-8000-00000000000a',
        '00000000-0000-4000-8000-000000000001', 'inv pending request', 'pending', 'tap-v1');

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"91000000-0000-4000-8000-00000000000a","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001"}';

select throws_ok(
  $$update public.prayers set answered_at = now()
    where id = '83000000-0000-4000-8000-00000000000d'$$,
  '23514', 'only an approved, live request can be marked answered',
  'a request still awaiting review cannot be marked answered');
select lives_ok(
  $$update public.prayers set answered_at = now()
    where id = '83000000-0000-4000-8000-00000000000a'$$,
  'an approved request can be');
-- Undo is blocked while the testimony it produced is still standing: otherwise the
-- ribbon would point back at a request that claims it was never answered.
select throws_ok(
  $$update public.prayers set answered_at = null
    where id = '83000000-0000-4000-8000-00000000000a'$$,
  '23514', 'delete the linked testimony before marking this request unanswered',
  'undo is refused while a linked testimony exists');

set local request.jwt.claims to
  '{"sub":"91000000-0000-4000-8000-00000000000b","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001"}';
select lives_ok(
  $$update public.prayers set answered_at = now()
    where id = '83000000-0000-4000-8000-00000000000a'$$,
  'another member''s mark-answered executes without error (zero rows under RLS)');

-- ===========================================================================
-- is_anonymous flips without re-moderation; everything else re-pends.
-- ===========================================================================
set local request.jwt.claims to
  '{"sub":"91000000-0000-4000-8000-00000000000a","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001"}';
select lives_ok(
  $$update public.prayers set is_anonymous = true
    where id = '83000000-0000-4000-8000-00000000000a'$$,
  'the author makes their own request anonymous');

reset role;
set local request.jwt.claims to '{}';
select is(
  (select status from public.prayers where id = '83000000-0000-4000-8000-00000000000a'),
  'approved'::public.content_status,
  'changing your own anonymity does not send the request back for review');

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"91000000-0000-4000-8000-00000000000a","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001"}';
select lives_ok(
  $$update public.prayers set body = 'inv rewritten request'
    where id = '83000000-0000-4000-8000-00000000000a'$$,
  'the author rewrites the body');

reset role;
set local request.jwt.claims to '{}';
select is(
  (select status from public.prayers where id = '83000000-0000-4000-8000-00000000000a'),
  'pending'::public.content_status,
  'but rewriting the words does send it back for review');

-- ===========================================================================
-- The two-step commitment is a one-way state machine the client cannot drive.
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"91000000-0000-4000-8000-00000000000b","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001"}';

select throws_ok(
  $$insert into public.prayer_intercessions (prayer_id, profile_id)
    values ('83000000-0000-4000-8000-00000000000d',
            '91000000-0000-4000-8000-00000000000b')$$,
  '23514', 'you can only commit to pray for a published request',
  'you cannot commit to pray for a request that was never published');
select lives_ok(
  $$insert into public.prayer_intercessions
      (id, prayer_id, profile_id, state, prayed_at, next_reminder_at, reminder_count)
    values ('84000000-0000-4000-8000-00000000000a',
            '83000000-0000-4000-8000-00000000000b',
            '91000000-0000-4000-8000-00000000000a',
            'prayed', now(), now() + interval '1 year', 99)$$,
  '"I will pray" on a published request, with every server column forged');

reset role;
set local request.jwt.claims to '{}';
select is(
  (select profile_id from public.prayer_intercessions
    where id = '84000000-0000-4000-8000-00000000000a'),
  '91000000-0000-4000-8000-00000000000b'::uuid,
  'the commitment is forced onto the caller, not the supplied profile');
select is(
  (select state from public.prayer_intercessions
    where id = '84000000-0000-4000-8000-00000000000a'),
  'committed'::public.intercession_state,
  'and starts at committed: you cannot skip straight to "I prayed"');
select is(
  (select next_reminder_at from public.prayer_intercessions
    where id = '84000000-0000-4000-8000-00000000000a'),
  null::timestamptz,
  'the reminder schedule is the server''s, so a self-set nudge is discarded');

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"91000000-0000-4000-8000-00000000000b","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001"}';
select throws_ok(
  $$update public.prayer_intercessions set next_reminder_at = now() + interval '10 years'
    where id = '84000000-0000-4000-8000-00000000000a'$$,
  '23514', 'the reminder schedule is server-controlled',
  'a member cannot silence their own reminders by writing the schedule');
select throws_ok(
  $$update public.prayer_intercessions set committed_at = now() - interval '1 year'
    where id = '84000000-0000-4000-8000-00000000000a'$$,
  '23514', 'a commitment cannot be reassigned or backdated',
  'nor backdate the commitment');
select lives_ok(
  $$update public.prayer_intercessions set state = 'prayed'
    where id = '84000000-0000-4000-8000-00000000000a'$$,
  '"I prayed" fulfils the commitment');
select throws_ok(
  $$update public.prayer_intercessions set state = 'committed'
    where id = '84000000-0000-4000-8000-00000000000a'$$,
  '23514', 'this commitment is already fulfilled',
  'and the transition is one-way: it never reverts');

-- ===========================================================================
-- Reactions land only on published content, and only for the caller.
-- ===========================================================================
select throws_ok(
  $$insert into public.glory_reactions (testimony_id, profile_id)
    values ('82000000-0000-4000-8000-00000000000b',
            '91000000-0000-4000-8000-00000000000b')$$,
  '23514', 'you can only respond to a published testimony',
  'Glory cannot be given to a testimony that is still pending review');

-- ===========================================================================
-- Half-created and deleted accounts cannot write.
-- ===========================================================================
set local request.jwt.claims to
  '{"sub":"91000000-0000-4000-8000-00000000000e","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001"}';
select throws_ok(
  $$insert into public.testimonies (author_id, branch_id, body, consent_version)
    values ('91000000-0000-4000-8000-00000000000e',
            '00000000-0000-4000-8000-000000000001', 'inv halfway', 'tap-v1')$$,
  '42501', null,
  'a session that never finished AUTH-3 cannot post');

set local request.jwt.claims to
  '{"sub":"91000000-0000-4000-8000-00000000000f","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001"}';
select throws_ok(
  $$insert into public.testimonies (author_id, branch_id, body, consent_version)
    values ('91000000-0000-4000-8000-00000000000f',
            '00000000-0000-4000-8000-000000000001', 'inv from a deleted account', 'tap-v1')$$,
  '42501', null,
  'a queued write from a deleted account is rejected, never recreating erased content');

-- ===========================================================================
-- Abuse ceilings (docs/spec/09): posting and reporting are both capped.
-- ===========================================================================
set local request.jwt.claims to
  '{"sub":"91000000-0000-4000-8000-000000000010","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001"}';

select lives_ok(
  $$insert into public.testimonies (author_id, branch_id, body, consent_version)
    select '91000000-0000-4000-8000-000000000010',
           '00000000-0000-4000-8000-000000000001',
           'inv flood ' || g, 'tap-v1'
    from generate_series(1, 3) g$$,
  'three testimonies in a day are fine');
select lives_ok(
  $$insert into public.prayers (author_id, branch_id, body, consent_version)
    select '91000000-0000-4000-8000-000000000010',
           '00000000-0000-4000-8000-000000000001',
           'inv flood request ' || g, 'tap-v1'
    from generate_series(1, 2) g$$,
  'and two requests takes them to the combined limit of five');
select throws_ok(
  $$insert into public.prayers (author_id, branch_id, body, consent_version)
    values ('91000000-0000-4000-8000-000000000010',
            '00000000-0000-4000-8000-000000000001', 'inv one too many', 'tap-v1')$$,
  '23514', 'daily sharing limit reached',
  'the sixth post in twenty-four hours is refused');

reset role;
set local request.jwt.claims to '{}';
insert into public.testimonies (id, author_id, branch_id, body, status, consent_version)
select ('85000000-0000-4000-8000-0000000000' || lpad(g::text, 2, '0'))::uuid,
       '91000000-0000-4000-8000-00000000000a',
       '00000000-0000-4000-8000-000000000001',
       'inv report target ' || g, 'approved', 'tap-v1'
from generate_series(1, 21) g;

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"91000000-0000-4000-8000-00000000000b","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001"}';
select lives_ok(
  $$insert into public.reports (testimony_id, reporter_id, reason)
    values ('85000000-0000-4000-8000-000000000001',
            '91000000-0000-4000-8000-00000000000b', 'tap first report')$$,
  'a member reports a testimony');
select throws_ok(
  $$insert into public.reports (testimony_id, reporter_id, reason)
    values ('85000000-0000-4000-8000-000000000001',
            '91000000-0000-4000-8000-00000000000b', 'tap duplicate')$$,
  '23505', null,
  're-reporting the same item is a no-op, not a second queue entry');

-- Nineteen more (seeded directly) take this reporter to twenty for the day, so the
-- next one is the one over the line. Seeded rather than looped through the client
-- because the cap, not the loop, is what is under test.
reset role;
set local request.jwt.claims to '{}';
insert into public.reports (testimony_id, reporter_id, reason)
select ('85000000-0000-4000-8000-0000000000' || lpad(g::text, 2, '0'))::uuid,
       '91000000-0000-4000-8000-00000000000b', 'tap flood'
from generate_series(2, 20) g;

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"91000000-0000-4000-8000-00000000000b","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001"}';
select throws_ok(
  $$insert into public.reports (testimony_id, reporter_id, reason)
    values ('85000000-0000-4000-8000-000000000021',
            '91000000-0000-4000-8000-00000000000b', 'tap flood')$$,
  '23514', 'daily report limit reached',
  'the twenty-first report in a day is refused (queue-flooding control)');

select * from finish();
rollback;
