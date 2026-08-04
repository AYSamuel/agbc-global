-- W2.5 · The loop, walked end to end at the data layer, plus the read path the screens
-- needed to walk it honestly.
--
-- docs/spec/09 calls this the emotional spine of the app: prayer -> approved -> answered ->
-- testimony -> approved -> a ribbon that links both ways. The invariants that REFUSE things
-- along the way are asserted in 009 (link stealing, removed prayers, the mark-answered
-- preconditions). This file asserts the arc itself, and the two rules that only become
-- visible once it is walked in order:
--
--   1. `my_answer_testimony_status` and `answer_testimony_id` disagree ON PURPOSE while a
--      testimony is pending. The first exists to predict `prayer_has_live_testimony()`, which
--      is what refuses the undo; the second drives the public reverse link, which must wait
--      for a leader. A test that only ever looked at approved rows would find them identical
--      and never notice which one the confirm sheet has to read.
--   2. Both links DEGRADE rather than break. A ribbon whose origin prayer is withdrawn stops
--      being a link and stays a label, and the reverse link disappears when the testimony
--      stops being public (docs/spec/09 §Answered-prayer ribbon).
--
-- TRAP (see 009's header): `reset role` drops the ROLE but leaves `request.jwt.claims`, so
-- every privileged block below resets both. Fixtures are inserted privileged deliberately:
-- the member path is capped at 5 posts per 24h and this cast would spend the whole budget on
-- setup, leaving the writes actually under test to fail for the wrong reason.
begin;
create extension if not exists pgtap with schema extensions;
select plan(23);

-- Cast: the author who walks the loop, a stranger who must learn nothing from it, the
-- Glasgow leader who approves, and an admin, who is the one caller allowed to link a
-- testimony to somebody else's request.
insert into auth.users (id, email) values
  ('94000000-0000-4000-8000-00000000000a', 'loop-author@test.local'),
  ('94000000-0000-4000-8000-00000000000b', 'loop-stranger@test.local'),
  ('94000000-0000-4000-8000-00000000000c', 'loop-leader@test.local'),
  ('94000000-0000-4000-8000-00000000000d', 'loop-admin@test.local');
insert into public.profiles
  (id, email, display_name, branch_id, role, onboarded_at, age_confirmed_at)
values
  ('94000000-0000-4000-8000-00000000000a', 'loop-author@test.local', 'Loop Author',
   '00000000-0000-4000-8000-000000000001', 'member', now(), now()),
  ('94000000-0000-4000-8000-00000000000b', 'loop-stranger@test.local', 'Loop Stranger',
   '00000000-0000-4000-8000-000000000001', 'member', now(), now()),
  ('94000000-0000-4000-8000-00000000000c', 'loop-leader@test.local', 'Loop Leader',
   '00000000-0000-4000-8000-000000000001', 'leader', now(), now()),
  ('94000000-0000-4000-8000-00000000000d', 'loop-admin@test.local', 'Loop Admin',
   '00000000-0000-4000-8000-000000000001', 'admin', now(), now());

-- The request the family has been praying for, already through moderation.
insert into public.prayers
  (id, author_id, branch_id, body, status, consent_version)
values
  ('8a000000-0000-4000-8000-00000000000a', '94000000-0000-4000-8000-00000000000a',
   '00000000-0000-4000-8000-000000000001', 'loop mother''s recovery', 'approved',
   'content-share-v1');

-- ===========================================================================
-- 1. The arc: answered, then a testimony, then a leader, then two links.
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"94000000-0000-4000-8000-00000000000a","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001"}';

select lives_ok(
  $$update public.prayers set answered_at = now()
    where id = '8a000000-0000-4000-8000-00000000000a'$$,
  'the author marks their approved, live request answered');
select is(
  (select answered_at is not null from public.prayer_feed
    where id = '8a000000-0000-4000-8000-00000000000a'),
  true, 'and the family feed carries the answered state, not just the base table');

select lives_ok(
  $$insert into public.testimonies
      (id, author_id, branch_id, body, consent_version, from_prayer_id)
    values ('8b000000-0000-4000-8000-00000000000a',
            '94000000-0000-4000-8000-00000000000a',
            '00000000-0000-4000-8000-000000000001',
            'loop God answered', 'content-share-v1',
            '8a000000-0000-4000-8000-00000000000a')$$,
  'and writes the testimony it produced, linked to the request');

-- The pair of assertions this migration exists for. Same row, same caller, same instant:
-- the author can see there IS a testimony, and the family still cannot.
select is(
  (select my_answer_testimony_status::text from public.prayer_feed
    where id = '8a000000-0000-4000-8000-00000000000a'),
  'pending', 'the author is told their testimony is in the queue');
select is(
  (select answer_testimony_id from public.prayer_feed
    where id = '8a000000-0000-4000-8000-00000000000a'),
  null::uuid, 'while the public reverse link stays empty until a leader approves it');

-- The guard and the column agree, which is the whole point of matching its predicate.
select throws_ok(
  $$update public.prayers set answered_at = null
    where id = '8a000000-0000-4000-8000-00000000000a'$$,
  '23514', 'delete the linked testimony before marking this request unanswered',
  'and the undo is refused for exactly the testimony the author was just shown');

-- Nobody else learns that a testimony is coming. A pending post is its author's business.
set local request.jwt.claims to
  '{"sub":"94000000-0000-4000-8000-00000000000b","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001"}';
select is(
  (select my_answer_testimony_status from public.prayer_feed
    where id = '8a000000-0000-4000-8000-00000000000a'),
  null::public.content_status,
  'another member reading the same request is told nothing about it');

set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select is(
  (select my_answer_testimony_status from public.prayer_feed
    where id = '8a000000-0000-4000-8000-00000000000a'),
  null::public.content_status,
  'and a guest, whose null uid must not match a null author_id either');

-- The leader closes the loop.
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"94000000-0000-4000-8000-00000000000c","role":"authenticated","user_role":"leader","branch_id":"00000000-0000-4000-8000-000000000001"}';
select lives_ok(
  $$update public.testimonies set status = 'approved'
    where id = '8b000000-0000-4000-8000-00000000000a'$$,
  'the branch leader approves the testimony');

set local request.jwt.claims to
  '{"sub":"94000000-0000-4000-8000-00000000000a","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001"}';
select is(
  (select answer_testimony_id from public.prayer_feed
    where id = '8a000000-0000-4000-8000-00000000000a'),
  '8b000000-0000-4000-8000-00000000000a'::uuid,
  'now the request links forward to the testimony that answered it');
select is(
  (select my_answer_testimony_status::text from public.prayer_feed
    where id = '8a000000-0000-4000-8000-00000000000a'),
  'approved', 'and the author''s own view of it moves on with it');
select is(
  (select origin_prayer_id from public.testimony_feed
    where id = '8b000000-0000-4000-8000-00000000000a'),
  '8a000000-0000-4000-8000-00000000000a'::uuid,
  'and the testimony links back: the ribbon is a link, both ways at once');
select throws_ok(
  $$update public.prayers set answered_at = null
    where id = '8a000000-0000-4000-8000-00000000000a'$$,
  '23514', 'delete the linked testimony before marking this request unanswered',
  'the undo stays refused once the testimony is public, for the same reason');

-- ===========================================================================
-- 2. Degradation: a withdrawn end of the link demotes it, never breaks it.
-- ===========================================================================
reset role;
set local request.jwt.claims to '{}';
insert into public.prayers
  (id, author_id, branch_id, body, status, answered_at, consent_version)
values
  ('8a000000-0000-4000-8000-00000000000b', '94000000-0000-4000-8000-00000000000a',
   '00000000-0000-4000-8000-000000000001', 'loop withdrawn request', 'approved', now(),
   'content-share-v1'),
  ('8a000000-0000-4000-8000-00000000000c', '94000000-0000-4000-8000-00000000000a',
   '00000000-0000-4000-8000-000000000001', 'loop request whose answer was removed',
   'approved', now(), 'content-share-v1');
insert into public.testimonies
  (id, author_id, branch_id, body, status, consent_version, from_prayer_id)
values
  ('8b000000-0000-4000-8000-00000000000b', '94000000-0000-4000-8000-00000000000a',
   '00000000-0000-4000-8000-000000000001', 'loop testimony of a withdrawn request',
   'approved', 'content-share-v1', '8a000000-0000-4000-8000-00000000000b'),
  ('8b000000-0000-4000-8000-00000000000c', '94000000-0000-4000-8000-00000000000a',
   '00000000-0000-4000-8000-000000000001', 'loop removed testimony',
   'approved', 'content-share-v1', '8a000000-0000-4000-8000-00000000000c');

-- The author takes the request down. A soft delete keeps the FK (`on delete set null` is
-- for a hard one), so the testimony still knows where it came from and only stops
-- offering to take anyone there.
update public.prayers set deleted_at = now()
  where id = '8a000000-0000-4000-8000-00000000000b';
-- And a leader removes the other testimony.
update public.testimonies set status = 'removed'
  where id = '8b000000-0000-4000-8000-00000000000c';

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"94000000-0000-4000-8000-00000000000b","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001"}';

select results_eq(
  $$select from_prayer_id is not null, origin_prayer_id is null
    from public.testimony_feed
    where id = '8b000000-0000-4000-8000-00000000000b'$$,
  $$values (true, true)$$,
  'a testimony whose origin request is withdrawn keeps the ribbon and loses the link');
select is(
  (select answer_testimony_id from public.prayer_feed
    where id = '8a000000-0000-4000-8000-00000000000c'),
  null::uuid,
  'and a request whose testimony was removed stops offering to show it');
select is(
  (select answered_at is not null from public.prayer_feed
    where id = '8a000000-0000-4000-8000-00000000000c'),
  true, 'but stays answered: a removal is not evidence that God did not answer');

-- ===========================================================================
-- 3. The way back: delete the testimony, and the undo opens.
-- ===========================================================================
set local request.jwt.claims to
  '{"sub":"94000000-0000-4000-8000-00000000000a","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001"}';

select lives_ok(
  $$update public.testimonies set deleted_at = now()
    where id = '8b000000-0000-4000-8000-00000000000a'$$,
  'the author deletes the testimony the confirm sheet pointed them at');
select is(
  (select my_answer_testimony_status from public.prayer_feed
    where id = '8a000000-0000-4000-8000-00000000000a'),
  null::public.content_status,
  'and the request stops reporting one, so the sheet stops explaining');
select lives_ok(
  $$update public.prayers set answered_at = null
    where id = '8a000000-0000-4000-8000-00000000000a'$$,
  'which is exactly when the undo the sheet offers starts working');
select is(
  (select answered_at from public.prayer_feed
    where id = '8a000000-0000-4000-8000-00000000000a'),
  null::timestamptz, 'and the family sees the request back among the unanswered');

-- ===========================================================================
-- 4. The two callers the column's shape was decided by.
-- ===========================================================================
reset role;
set local request.jwt.claims to '{}';
-- An ANONYMOUS request: the one whose author the feed refuses to name, including to them.
insert into public.prayers
  (id, author_id, branch_id, body, is_anonymous, status, answered_at, consent_version)
values
  ('8a000000-0000-4000-8000-00000000000d', '94000000-0000-4000-8000-00000000000a',
   '00000000-0000-4000-8000-000000000001', 'loop anonymous request', true, 'approved',
   now(), 'content-share-v1');
insert into public.testimonies
  (id, author_id, branch_id, body, status, consent_version, from_prayer_id)
values
  ('8b000000-0000-4000-8000-00000000000d', '94000000-0000-4000-8000-00000000000a',
   '00000000-0000-4000-8000-000000000001', 'loop answer to an anonymous request',
   'pending', 'content-share-v1', '8a000000-0000-4000-8000-00000000000d');

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"94000000-0000-4000-8000-00000000000a","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001"}';
select results_eq(
  $$select my_answer_testimony_status::text, author_id from public.prayer_feed
    where id = '8a000000-0000-4000-8000-00000000000d'$$,
  $$values ('pending', null::uuid)$$,
  'the author of an anonymous request gets their answer''s state back, still unnamed');

-- An ADMIN-LINKED testimony. This is why the column asks prayer_has_live_testimony()'s
-- question rather than "did I write it": the guard counts this one, so the screen must too.
-- Tightening the column to `and t.author_id = auth.uid()` would fail exactly here, by
-- offering an undo the database then refuses.
reset role;
set local request.jwt.claims to '{}';
insert into public.prayers
  (id, author_id, branch_id, body, status, answered_at, consent_version)
values
  ('8a000000-0000-4000-8000-00000000000e', '94000000-0000-4000-8000-00000000000a',
   '00000000-0000-4000-8000-000000000001', 'loop request an admin answered for',
   'approved', now(), 'content-share-v1');

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"94000000-0000-4000-8000-00000000000d","role":"authenticated","user_role":"admin","branch_id":"00000000-0000-4000-8000-000000000001"}';
insert into public.testimonies
  (id, author_id, branch_id, body, consent_version, from_prayer_id)
values
  ('8b000000-0000-4000-8000-00000000000e', '94000000-0000-4000-8000-00000000000d',
   '00000000-0000-4000-8000-000000000001', 'loop admin wrote this answer',
   'content-share-v1', '8a000000-0000-4000-8000-00000000000e');

set local request.jwt.claims to
  '{"sub":"94000000-0000-4000-8000-00000000000a","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001"}';
select is(
  (select my_answer_testimony_status::text from public.prayer_feed
    where id = '8a000000-0000-4000-8000-00000000000e'),
  'pending',
  'a testimony an admin linked to the member''s request is reported to that member');
select throws_ok(
  $$update public.prayers set answered_at = null
    where id = '8a000000-0000-4000-8000-00000000000e'$$,
  '23514', 'delete the linked testimony before marking this request unanswered',
  'because the guard counts it, and a screen that disagreed would offer a dead action');

select * from finish();
rollback;
