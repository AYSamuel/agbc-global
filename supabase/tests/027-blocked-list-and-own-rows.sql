-- W2.6 · The two reads the post-actions menu and the Blocked members screen need, and
-- the two things neither of them is allowed to become.
--
--   1. `blocked_members` names the people YOU blocked, and answers nothing in the other
--      direction. "Who blocked me" stayed undisclosed when the block list was two bare
--      uuids (010); it has to stay undisclosed now that a name hangs off it.
--   2. `is_mine` hands an author their own row back WITHOUT weakening anonymity. The
--      whole reason the column exists is the anonymous request whose author_id the feed
--      refuses to disclose, so the assertion that matters is both at once: is_mine true
--      AND author_id still null, on the same row, for the same caller.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (id, email) values
  ('93000000-0000-4000-8000-00000000000a', 'w26-author@test.local'),
  ('93000000-0000-4000-8000-00000000000b', 'w26-blocker@test.local'),
  ('93000000-0000-4000-8000-00000000000c', 'w26-bystander@test.local'),
  ('93000000-0000-4000-8000-00000000000d', 'w26-leaving@test.local');
insert into public.profiles
  (id, email, display_name, branch_id, role, onboarded_at, age_confirmed_at)
values
  ('93000000-0000-4000-8000-00000000000a', 'w26-author@test.local', 'Named Author',
   '00000000-0000-4000-8000-000000000001', 'member', now(), now()),
  ('93000000-0000-4000-8000-00000000000b', 'w26-blocker@test.local', 'The Blocker',
   '00000000-0000-4000-8000-000000000001', 'member', now(), now()),
  ('93000000-0000-4000-8000-00000000000c', 'w26-bystander@test.local', 'Bystander',
   '00000000-0000-4000-8000-000000000001', 'member', now(), now()),
  ('93000000-0000-4000-8000-00000000000d', 'w26-leaving@test.local', 'Leaving Soon',
   '00000000-0000-4000-8000-000000000001', 'member', now(), now());

-- ===========================================================================
-- 1. blocked_members: your own list, and nobody else's.
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"93000000-0000-4000-8000-00000000000b","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001"}';

select is(
  (select count(*) from public.blocked_members)::int,
  0, 'a member who has blocked nobody has an empty list');

select lives_ok(
  $$insert into public.blocked_users (blocker_id, blocked_id)
    values ('93000000-0000-4000-8000-00000000000b',
            '93000000-0000-4000-8000-00000000000a')$$,
  'the blocker blocks the author');
select lives_ok(
  $$insert into public.blocked_users (blocker_id, blocked_id)
    values ('93000000-0000-4000-8000-00000000000b',
            '93000000-0000-4000-8000-00000000000d')$$,
  'and somebody who is about to delete their account');

select is(
  (select display_name from public.blocked_members
    where blocked_id = '93000000-0000-4000-8000-00000000000a'),
  'Named Author',
  'the list carries the name, which is the only thing that makes Unblock actionable');

-- The bystander blocks somebody too, so "only my own rows" is a real question rather
-- than a table that happens to hold one member's data.
set local request.jwt.claims to
  '{"sub":"93000000-0000-4000-8000-00000000000c","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001"}';
select lives_ok(
  $$insert into public.blocked_users (blocker_id, blocked_id)
    values ('93000000-0000-4000-8000-00000000000c',
            '93000000-0000-4000-8000-00000000000a')$$,
  'the bystander blocks the author as well');
select is(
  (select count(*) from public.blocked_members)::int,
  1, 'and sees exactly their own one block, not the blocker''s two');

set local request.jwt.claims to
  '{"sub":"93000000-0000-4000-8000-00000000000b","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001"}';
select is(
  (select count(*) from public.blocked_members)::int,
  2, 'and the blocker still sees exactly their own two');

-- The direction that must stay shut. The author has been blocked twice over by now.
set local request.jwt.claims to
  '{"sub":"93000000-0000-4000-8000-00000000000a","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001"}';
select is(
  (select count(*) from public.blocked_members)::int,
  0, 'the blocked member learns nothing: the view is keyed on the blocker, not the blocked');
select is(
  (select count(*) from public.blocked_members
    where blocked_id = '93000000-0000-4000-8000-00000000000a')::int,
  0, 'and no filter recovers it, because the predicate is the view and not the query');

-- Guests have no block list to read, and the default privilege that would have handed
-- them one is the exact thing the family migration exists to revoke.
select ok(
  not has_table_privilege('anon', 'public.blocked_members', 'select'),
  'anon holds no SELECT on the view');
select ok(
  has_table_privilege('authenticated', 'public.blocked_members', 'select'),
  'members do');

-- A deleted account is gone from the app, so its name stops surfacing on a list whose
-- only purpose is deciding whether to let somebody back in.
reset role;
set local request.jwt.claims to '{}';
update public.profiles set deleted_at = now()
  where id = '93000000-0000-4000-8000-00000000000d';

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"93000000-0000-4000-8000-00000000000b","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001"}';
select is(
  (select count(*) from public.blocked_members)::int,
  1, 'a blocked member who deleted their account drops off the list');

-- ===========================================================================
-- 2. is_mine: your own row, without undoing anonymity.
-- ===========================================================================
reset role;
set local request.jwt.claims to '{}';
insert into public.prayers
  (id, author_id, branch_id, body, is_anonymous, status, consent_version)
values
  ('88000000-0000-4000-8000-00000000000a', '93000000-0000-4000-8000-00000000000a',
   '00000000-0000-4000-8000-000000000001', 'w26 anonymous request', true,
   'approved', 'content-share-v1');
insert into public.testimonies
  (id, author_id, branch_id, body, status, consent_version)
values
  ('89000000-0000-4000-8000-00000000000a', '93000000-0000-4000-8000-00000000000a',
   '00000000-0000-4000-8000-000000000001', 'w26 named testimony',
   'approved', 'content-share-v1');

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"93000000-0000-4000-8000-00000000000a","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001"}';

-- The assertion this migration exists for: both facts about the same row, at once.
select results_eq(
  $$select is_mine, author_id from public.prayer_feed
    where id = '88000000-0000-4000-8000-00000000000a'$$,
  $$values (true, null::uuid)$$,
  'the author of an anonymous request is handed it back as theirs, and still unnamed');
select is(
  (select is_mine from public.testimony_feed
    where id = '89000000-0000-4000-8000-00000000000a'),
  true, 'and their testimony is theirs too');

-- The bystander blocked this author above, so ask a caller who did not.
set local request.jwt.claims to
  '{"sub":"93000000-0000-4000-8000-00000000000d","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001"}';
select results_eq(
  $$select is_mine from public.prayer_feed
    where id = '88000000-0000-4000-8000-00000000000a'$$,
  $$values (false)$$,
  'another member is told it is not theirs, which is all they are told');

set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select is(
  (select bool_or(is_mine) from public.testimony_feed),
  false, 'a guest owns nothing: null uid coalesces to false rather than to null');

select * from finish();
rollback;
