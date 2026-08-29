-- W3.5 slice 1: the broadcast domain and its state machine (20260819180000, 20260819190000).
--
-- The rule under test is one sentence, and almost every assertion here is a way of trying to
-- get around it: EVERY broadcast is released by an admin who is not its author. It replaces
-- `02`'s branch-scope direct send and `17`'s daily send caps (decided with Ayo 2026-08-19),
-- so the tests that matter most are the REFUSALS, and specifically the ones an ordinary
-- happy-path suite would never attempt: a leader approving their own, an admin approving
-- their own, a member calling the function directly, and an edit slipped in after approval
-- was granted.
--
-- TRAP (see 009's header): `reset role` drops the ROLE but leaves `request.jwt.claims`, and
-- it matters more here than usual: every function below reads `auth.uid()` from those claims
-- INSIDE a SECURITY DEFINER body, which is the whole reason the dashboard can use the staff
-- member's own token. A leftover claim would silently test the wrong person.
--
-- TRAP (see 019): never CALL a function the current role lacks EXECUTE on; the backend
-- segfaults. The ACL assertions read the catalogue and never probe by invoking.
begin;
create extension if not exists pgtap with schema extensions;
select plan(50);

-- Cast: a Glasgow leader who writes, two admins who review, and a member who should reach
-- none of it. Plus, since W3.6 slice 1, a BERLIN member, who exists only to be the person a
-- Glasgow broadcast must not reach.
insert into auth.users (id, email) values
  ('93000000-0000-4000-8000-00000000000a', 'bc-leader@test.local'),
  ('93000000-0000-4000-8000-00000000000b', 'bc-admin1@test.local'),
  ('93000000-0000-4000-8000-00000000000c', 'bc-admin2@test.local'),
  ('93000000-0000-4000-8000-00000000000d', 'bc-member@test.local'),
  ('93000000-0000-4000-8000-00000000000e', 'bc-berlin@test.local');
insert into public.profiles
  (id, email, display_name, branch_id, role, onboarded_at, age_confirmed_at)
values
  ('93000000-0000-4000-8000-00000000000a', 'bc-leader@test.local', 'BC Leader',
   '00000000-0000-4000-8000-000000000001', 'leader', now(), now()),
  ('93000000-0000-4000-8000-00000000000b', 'bc-admin1@test.local', 'BC Admin One',
   '00000000-0000-4000-8000-000000000001', 'admin', now(), now()),
  ('93000000-0000-4000-8000-00000000000c', 'bc-admin2@test.local', 'BC Admin Two',
   '00000000-0000-4000-8000-000000000001', 'admin', now(), now()),
  ('93000000-0000-4000-8000-00000000000d', 'bc-member@test.local', 'BC Member',
   '00000000-0000-4000-8000-000000000001', 'member', now(), now()),
  ('93000000-0000-4000-8000-00000000000e', 'bc-berlin@test.local', 'BC Berlin',
   '00000000-0000-4000-8000-000000000002', 'member', now(), now());

-- ===========================================================================
-- 1. Shape and posture.
-- ===========================================================================

select ok(
  (select relforcerowsecurity from pg_class where oid = 'public.broadcasts'::regclass),
  'broadcasts forces RLS on its owner too');
select ok(
  (select relforcerowsecurity
   from pg_class where oid = 'public.broadcast_deliveries'::regclass),
  'and so does the delivery ledger');

select is(
  (select count(*)::int from pg_policies
   where schemaname = 'public' and tablename in ('broadcasts', 'broadcast_deliveries')),
  0,
  'ZERO client policies on both (docs/spec/02 matrix): staff act through the functions');

select is(
  has_table_privilege('authenticated', 'public.broadcasts', 'select'), false,
  'a signed-in member cannot read broadcasts directly');
select is(
  has_table_privilege('anon', 'public.broadcasts', 'select'), false,
  'and neither can a guest');
select is(
  has_table_privilege('authenticated', 'public.broadcast_deliveries', 'select'), false,
  'nobody learns which of their devices a broadcast failed on');

-- The line W3.3 deliberately left for this item (20260816120000's header).
select col_is_fk('public', 'notifications', 'broadcast_id',
  'notifications.broadcast_id finally has its foreign key');

-- ===========================================================================
-- 2. A broadcast is born a draft, authored by whoever is holding the token.
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"93000000-0000-4000-8000-00000000000a","role":"authenticated","user_role":"leader","branch_id":"00000000-0000-4000-8000-000000000001"}';
reset role;

insert into public.broadcasts (id, author_id, scope, branch_id, title, body, status, approved_by)
values ('93000000-0000-4000-8000-0000000000b1',
        '93000000-0000-4000-8000-00000000000a', 'branch',
        '00000000-0000-4000-8000-000000000001', 'Sunday is moving', 'We meet at 10.',
        'sending', '93000000-0000-4000-8000-00000000000b');

select is(
  (select status from public.broadcasts where id = '93000000-0000-4000-8000-0000000000b1'),
  'draft'::public.broadcast_status,
  'a forged status is discarded: every broadcast starts as a draft');
select is(
  (select approved_by from public.broadcasts
   where id = '93000000-0000-4000-8000-0000000000b1'),
  null,
  'and a forged approver with it');

set local request.jwt.claims to '{}';

-- ===========================================================================
-- 3. The transition whitelist.
-- ===========================================================================

select throws_ok(
  $$update public.broadcasts set status = 'sent'
    where id = '93000000-0000-4000-8000-0000000000b1'$$,
  '23514', 'a broadcast cannot go from draft to sent',
  'a draft cannot jump straight to sent, even from the service role');

select throws_ok(
  $$update public.broadcasts set status = 'sending'
    where id = '93000000-0000-4000-8000-0000000000b1'$$,
  '23514', 'a broadcast cannot go from draft to sending',
  'nor skip the approval it now always needs');

-- ===========================================================================
-- 4. Submitting: the author's act, and only theirs.
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"93000000-0000-4000-8000-00000000000b","role":"authenticated","user_role":"admin"}';

select throws_ok(
  $$select public.submit_broadcast('93000000-0000-4000-8000-0000000000b1')$$,
  '42501', 'only the author may submit this broadcast',
  'even an admin cannot submit somebody else''s draft: the name on it chose the words');

set local request.jwt.claims to
  '{"sub":"93000000-0000-4000-8000-00000000000a","role":"authenticated","user_role":"leader","branch_id":"00000000-0000-4000-8000-000000000001"}';

select lives_ok(
  $$select public.submit_broadcast('93000000-0000-4000-8000-0000000000b1')$$,
  'the author submits it for approval');

reset role;
set local request.jwt.claims to '{}';

select is(
  (select status from public.broadcasts where id = '93000000-0000-4000-8000-0000000000b1'),
  'pending_approval'::public.broadcast_status,
  'and it is waiting');
select isnt(
  (select recipient_count from public.broadcasts
   where id = '93000000-0000-4000-8000-0000000000b1'),
  null,
  'carrying the recipient count the approver will be shown');

-- ===========================================================================
-- 5. THE RULE. Every way of approving your own.
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"93000000-0000-4000-8000-00000000000a","role":"authenticated","user_role":"leader","branch_id":"00000000-0000-4000-8000-000000000001"}';

select throws_ok(
  $$select public.approve_broadcast('93000000-0000-4000-8000-0000000000b1')$$,
  '42501', 'only an admin may approve a broadcast',
  'the author, being a leader, cannot approve their own');

set local request.jwt.claims to
  '{"sub":"93000000-0000-4000-8000-00000000000d","role":"authenticated","user_role":"member"}';
select throws_ok(
  $$select public.approve_broadcast('93000000-0000-4000-8000-0000000000b1')$$,
  '42501', 'only an admin may approve a broadcast',
  'a member who calls the function directly gets nowhere');

-- The case the four-eyes rule is really about: an ADMIN approving their own words. The
-- role check would pass; the author check is what stops it.
reset role;
set local request.jwt.claims to '{}';
insert into public.broadcasts (id, author_id, scope, title, body, status)
values ('93000000-0000-4000-8000-0000000000b2',
        '93000000-0000-4000-8000-00000000000b', 'ministry',
        'From the whole family', 'Grace and peace.', 'pending_approval');

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"93000000-0000-4000-8000-00000000000b","role":"authenticated","user_role":"admin"}';
select throws_ok(
  $$select public.approve_broadcast('93000000-0000-4000-8000-0000000000b2')$$,
  '42501', 'a broadcast cannot be approved by its author',
  'AN ADMIN CANNOT APPROVE THEIR OWN: no one reaches everyone alone');

-- And the data layer says the same thing, so a route that forgot would still fail.
reset role;
set local request.jwt.claims to '{}';
select throws_ok(
  $$update public.broadcasts
      set status = 'sending', approved_by = '93000000-0000-4000-8000-00000000000b'
      where id = '93000000-0000-4000-8000-0000000000b2'$$,
  '23514', null,
  'the CHECK refuses self-approval even from the service role');

-- ===========================================================================
-- 6. A second pair of eyes releases it.
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"93000000-0000-4000-8000-00000000000c","role":"authenticated","user_role":"admin"}';

select lives_ok(
  $$select public.approve_broadcast('93000000-0000-4000-8000-0000000000b2')$$,
  'the OTHER admin approves it');

reset role;
set local request.jwt.claims to '{}';

select is(
  (select status from public.broadcasts where id = '93000000-0000-4000-8000-0000000000b2'),
  'sending'::public.broadcast_status,
  'approval and sending are one act: there is no approved-but-unsent limbo');
select is(
  (select approved_by from public.broadcasts
   where id = '93000000-0000-4000-8000-0000000000b2'),
  '93000000-0000-4000-8000-00000000000c'::uuid,
  'and the row names who released it');
select isnt(
  (select sent_at from public.broadcasts where id = '93000000-0000-4000-8000-0000000000b2'),
  null,
  'stamped when it left the dashboard');

-- ===========================================================================
-- 7. Frozen from sending onward.
-- ===========================================================================

select throws_ok(
  $$update public.broadcasts set body = 'Something else entirely'
    where id = '93000000-0000-4000-8000-0000000000b2'$$,
  '23514', 'a broadcast in flight or finished cannot be edited',
  'a message being delivered cannot change halfway through the ministry');

select lives_ok(
  $$update public.broadcasts set status = 'sent'
    where id = '93000000-0000-4000-8000-0000000000b2'$$,
  'the fan-out may finish it');
select throws_ok(
  $$update public.broadcasts set body = 'After the fact'
    where id = '93000000-0000-4000-8000-0000000000b2'$$,
  '23514', 'a broadcast in flight or finished cannot be edited',
  'and a sent broadcast is a historical record, not a document');

-- ===========================================================================
-- 8. An edit while waiting takes it back to draft.
-- ===========================================================================

select is(
  (select status from public.broadcasts where id = '93000000-0000-4000-8000-0000000000b1'),
  'pending_approval'::public.broadcast_status,
  'the leader''s broadcast is still waiting');

update public.broadcasts set body = 'We meet at 11 after all.'
  where id = '93000000-0000-4000-8000-0000000000b1';

select is(
  (select status from public.broadcasts where id = '93000000-0000-4000-8000-0000000000b1'),
  'draft'::public.broadcast_status,
  'an author edit returns it to draft: what the approver reviewed is what sends');

-- ===========================================================================
-- 9. Rejection.
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"93000000-0000-4000-8000-00000000000a","role":"authenticated","user_role":"leader","branch_id":"00000000-0000-4000-8000-000000000001"}';
select lives_ok(
  $$select public.submit_broadcast('93000000-0000-4000-8000-0000000000b1')$$,
  'the author resubmits');

set local request.jwt.claims to
  '{"sub":"93000000-0000-4000-8000-00000000000b","role":"authenticated","user_role":"admin"}';

select throws_ok(
  $$select public.reject_broadcast('93000000-0000-4000-8000-0000000000b1', '   ')$$,
  '23514', 'a rejection has to say why',
  'a rejection without a reason is refused: the note is shown to the author');

select lives_ok(
  $$select public.reject_broadcast(
      '93000000-0000-4000-8000-0000000000b1', 'Please name the venue.')$$,
  'an admin sends it back with a reason');

reset role;
set local request.jwt.claims to '{}';

select is(
  (select status || ' / ' || review_note from public.broadcasts
   where id = '93000000-0000-4000-8000-0000000000b1'),
  'rejected / Please name the venue.',
  'and the author will see why');

-- ===========================================================================
-- 10. Halting: wider than approval, and terminal.
-- ===========================================================================

insert into public.broadcasts (id, author_id, scope, branch_id, title, body, status, approved_by)
values ('93000000-0000-4000-8000-0000000000b3',
        '93000000-0000-4000-8000-00000000000a', 'branch',
        '00000000-0000-4000-8000-000000000001', 'In flight', 'Going out now.',
        'sending', '93000000-0000-4000-8000-00000000000b');

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"93000000-0000-4000-8000-00000000000d","role":"authenticated","user_role":"member"}';
select throws_ok(
  $$select public.halt_broadcast('93000000-0000-4000-8000-0000000000b3')$$,
  '42501', 'only the author or an admin may halt a broadcast',
  'a member cannot pull the brake on somebody else''s send');

set local request.jwt.claims to
  '{"sub":"93000000-0000-4000-8000-00000000000a","role":"authenticated","user_role":"leader","branch_id":"00000000-0000-4000-8000-000000000001"}';
select lives_ok(
  $$select public.halt_broadcast('93000000-0000-4000-8000-0000000000b3')$$,
  'but the AUTHOR can, without being an admin: halting is a brake, not a judgement');

reset role;
set local request.jwt.claims to '{}';

select throws_ok(
  $$update public.broadcasts set status = 'sending'
    where id = '93000000-0000-4000-8000-0000000000b3'$$,
  '23514', 'a broadcast cannot go from halted to sending',
  'halted is terminal: a stopped broadcast is duplicated as a draft, never resumed');

-- ===========================================================================
-- 11. The audience: prefs yes, blocks no.
-- ===========================================================================

select is(
  (select count(*)::int from public.broadcast_recipients(
    '93000000-0000-4000-8000-0000000000b2')
   where profile_id in ('93000000-0000-4000-8000-00000000000a',
                        '93000000-0000-4000-8000-00000000000d')),
  2,
  'a ministry broadcast reaches members of every branch');

update public.notification_prefs set ministry_announcements = false
  where profile_id = '93000000-0000-4000-8000-00000000000d';
select is(
  (select count(*)::int from public.broadcast_recipients(
    '93000000-0000-4000-8000-0000000000b2')
   where profile_id = '93000000-0000-4000-8000-00000000000d'),
  0,
  'a member who turned ministry announcements off is not in it');

-- A block between two members must NOT remove either from a broadcast: `15` suppresses
-- ACTIVITY across a block, and a broadcast is the church speaking, not a member.
insert into public.blocked_users (blocker_id, blocked_id) values
  ('93000000-0000-4000-8000-00000000000a', '93000000-0000-4000-8000-00000000000b');
select is(
  (select count(*)::int from public.broadcast_recipients(
    '93000000-0000-4000-8000-0000000000b2')
   where profile_id = '93000000-0000-4000-8000-00000000000a'),
  1,
  'and blocking somebody does not opt you out of the ministry''s own news');
delete from public.blocked_users
  where blocker_id = '93000000-0000-4000-8000-00000000000a';

update public.profiles set deleted_at = now()
  where id = '93000000-0000-4000-8000-00000000000a';
select is(
  (select count(*)::int from public.broadcast_recipients(
    '93000000-0000-4000-8000-0000000000b2')
   where profile_id = '93000000-0000-4000-8000-00000000000a'),
  0,
  'a closed account receives nothing');
update public.profiles set deleted_at = null
  where id = '93000000-0000-4000-8000-00000000000a';

select is(
  (select count(*)::int from public.broadcast_recipients(
    '93000000-0000-4000-8000-0000000000b3')
   where profile_id = '93000000-0000-4000-8000-00000000000d'),
  1,
  'a BRANCH broadcast reaches that branch');

-- --- and only that branch (W3.6 slice 1) ------------------------------------------
--
-- `18`'s Phase 3 exit clause is two halves, "ministry-wide reaches all branches" AND
-- "branch stays in-branch", and until now this file only ever asked the first one of a
-- branch broadcast. Reaching the right people and reaching ONLY them are different
-- claims: a `broadcast_recipients` that lost its `p.branch_id = b.branch_id` predicate
-- would have passed every assertion above this line, because every other member in the
-- cast is a Glasgow member. That is what the Berlin member exists for.
--
-- The event tier has had both halves since 046 ("Glasgow hears nothing about a Berlin
-- event") and the service tier gets it from its per-branch ticks in 040. Broadcasts were
-- the gap, and they are the newest of the three.

select is(
  (select count(*)::int from public.broadcast_recipients(
    '93000000-0000-4000-8000-0000000000b3')
   where profile_id = '93000000-0000-4000-8000-00000000000e'),
  0,
  'and stays in it: Berlin is not in a Glasgow broadcast''s audience');

-- `branch_updates` is the column `15`'s tier table names for this tier, and before W3.6
-- it appeared nowhere in this file or in 044: the ministry pref was proven suppressive
-- and the branch pref was assumed to be.
update public.notification_prefs set branch_updates = false
  where profile_id = '93000000-0000-4000-8000-00000000000d';
select is(
  (select count(*)::int from public.broadcast_recipients(
    '93000000-0000-4000-8000-0000000000b3')
   where profile_id = '93000000-0000-4000-8000-00000000000d'),
  0,
  'a member who turned branch updates off is not in a branch broadcast');
update public.notification_prefs set branch_updates = true
  where profile_id = '93000000-0000-4000-8000-00000000000d';

-- The two columns are wired separately, which is what "prefs suppress the CORRESPONDING
-- categories" means read strictly. This member's `ministry_announcements` has been false
-- since section 11 and it must not cost them their own branch's news; one `coalesce` on
-- the wrong column in that CASE would take both tiers away at once.
select is(
  (select count(*)::int from public.broadcast_recipients(
    '93000000-0000-4000-8000-0000000000b3')
   where profile_id = '93000000-0000-4000-8000-00000000000d'),
  1,
  'and the tiers do not bleed: ministry off, the branch''s own news still arrives');

-- ===========================================================================
-- 12. The delivery ledger's two shapes.
-- ===========================================================================

insert into public.devices (id, profile_id, expo_push_token, platform) values
  ('93000000-0000-4000-8000-0000000000e1',
   '93000000-0000-4000-8000-00000000000d', 'ExponentPushToken[bc-1]', 'android');

insert into public.broadcast_deliveries (broadcast_id, profile_id, channel)
values ('93000000-0000-4000-8000-0000000000b2',
        '93000000-0000-4000-8000-00000000000d', 'in_app');

select throws_ok(
  $$insert into public.broadcast_deliveries (broadcast_id, profile_id, channel)
    values ('93000000-0000-4000-8000-0000000000b2',
            '93000000-0000-4000-8000-00000000000d', 'in_app')$$,
  '23505', null,
  'one in-app row per member: a resumed fan-out cannot write a second');

insert into public.broadcast_deliveries (broadcast_id, profile_id, channel, device_id)
values ('93000000-0000-4000-8000-0000000000b2',
        '93000000-0000-4000-8000-00000000000d', 'push',
        '93000000-0000-4000-8000-0000000000e1');

select throws_ok(
  $$insert into public.broadcast_deliveries (broadcast_id, profile_id, channel, device_id)
    values ('93000000-0000-4000-8000-0000000000b2',
            '93000000-0000-4000-8000-00000000000d', 'push',
            '93000000-0000-4000-8000-0000000000e1')$$,
  '23505', null,
  'and one push row per DEVICE, which is the other shape entirely');

select throws_ok(
  $$insert into public.broadcast_deliveries (broadcast_id, profile_id, channel, device_id)
    values ('93000000-0000-4000-8000-0000000000b2',
            '93000000-0000-4000-8000-00000000000d', 'in_app',
            '93000000-0000-4000-8000-0000000000e1')$$,
  '23514', null,
  'an in-app row cannot name a device: only push is delivered to one');

-- ===========================================================================
-- 13. Who may call what.
-- ===========================================================================

select is(has_function_privilege('authenticated',
  'public.approve_broadcast(uuid)', 'execute'), true,
  'staff call the actions with their OWN token, so the grant is to authenticated');
select is(has_function_privilege('authenticated',
  'public.broadcast_recipient_count(uuid)', 'execute'), true,
  'and see the count before deciding to send');
select is(has_function_privilege('authenticated',
  'public.broadcast_recipients(uuid)', 'execute'), false,
  'but never the LIST: a count is a decision aid, a roster is a member list');
select is(has_function_privilege('anon',
  'public.submit_broadcast(uuid)', 'execute'), false,
  'a guest reaches none of it');

select * from finish();
rollback;
