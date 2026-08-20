-- W3.5 slice 3: what a composer may read and write (20260819210000).
--
-- The dashboard checks authority too, through `authorize()`, and that is not what this file
-- is about. `authenticated` can call these functions DIRECTLY with a crafted payload, with
-- no route in the way, so every refusal below is the one that actually holds: the dashboard
-- decides what a screen offers, and these decide what is allowed.
--
-- TRAP (see 009's header): `reset role` drops the ROLE but leaves `request.jwt.claims`, and
-- these functions read `auth.uid()` inside a SECURITY DEFINER body, so a leftover claim
-- would test the wrong person entirely.
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

insert into auth.users (id, email) values
  ('91100000-0000-4000-8000-00000000000a', 'comp-leader@test.local'),
  ('91100000-0000-4000-8000-00000000000b', 'comp-admin@test.local'),
  ('91100000-0000-4000-8000-00000000000c', 'comp-member@test.local'),
  ('91100000-0000-4000-8000-00000000000d', 'comp-other@test.local');
insert into public.profiles
  (id, email, display_name, branch_id, role, onboarded_at, age_confirmed_at)
values
  ('91100000-0000-4000-8000-00000000000a', 'comp-leader@test.local', 'Comp Leader',
   '00000000-0000-4000-8000-000000000001', 'leader', now(), now()),
  ('91100000-0000-4000-8000-00000000000b', 'comp-admin@test.local', 'Comp Admin',
   '00000000-0000-4000-8000-000000000002', 'admin', now(), now()),
  ('91100000-0000-4000-8000-00000000000c', 'comp-member@test.local', 'Comp Member',
   '00000000-0000-4000-8000-000000000001', 'member', now(), now()),
  ('91100000-0000-4000-8000-00000000000d', 'comp-other@test.local', 'Comp Other Leader',
   '00000000-0000-4000-8000-000000000003', 'leader', now(), now());

-- ===========================================================================
-- 1. Who may write one at all.
-- ===========================================================================

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"91100000-0000-4000-8000-00000000000c","role":"authenticated","user_role":"member"}';

select throws_ok(
  $$select public.create_broadcast_draft('branch', null, 'Hi', 'Body')$$,
  '42501', 'only staff may write a broadcast',
  'a member calling the function directly is refused, with no route in the way');

-- ===========================================================================
-- 2. Ministry scope is admins only, in SQL and not merely in the dashboard.
-- ===========================================================================

set local request.jwt.claims to
  '{"sub":"91100000-0000-4000-8000-00000000000a","role":"authenticated","user_role":"leader","branch_id":"00000000-0000-4000-8000-000000000001"}';

select throws_ok(
  $$select public.create_broadcast_draft('ministry', null, 'Everyone', 'Body')$$,
  '42501', 'only an admin may write to the whole ministry',
  'a leader who posts a crafted payload asking for ministry scope is refused HERE');

-- ===========================================================================
-- 3. A leader gets their own branch, whatever they ask for.
-- ===========================================================================

select lives_ok(
  $$select public.create_broadcast_draft(
      'branch', '00000000-0000-4000-8000-000000000003', 'Mine', 'Body')$$,
  'a leader may write for their branch, and may NAME another one without being refused');

-- Back to the owner to READ: `authenticated` has no SELECT on `broadcasts` by design
-- (`02`'s matrix), so the assertions cannot run as the caller who just wrote the row.
reset role;
set local request.jwt.claims to '{}';

select is(
  (select branch_id from public.broadcasts where title = 'Mine'),
  '00000000-0000-4000-8000-000000000001'::uuid,
  'but the branch is taken from their profile, never from the argument: a branch id in a payload would hand them another branch''s members');

select is(
  (select author_id from public.broadcasts where title = 'Mine'),
  '91100000-0000-4000-8000-00000000000a'::uuid,
  'and the author is the token, never an input');
select is(
  (select status from public.broadcasts where title = 'Mine'),
  'draft'::public.broadcast_status,
  'born a draft, whatever was asked for');

-- ===========================================================================
-- 4. An admin may write for any branch, and for the ministry.
-- ===========================================================================

set local request.jwt.claims to
  '{"sub":"91100000-0000-4000-8000-00000000000b","role":"authenticated","user_role":"admin"}';

select lives_ok(
  $$select public.create_broadcast_draft(
      'branch', '00000000-0000-4000-8000-000000000001', 'Admin for Glasgow', 'Body')$$,
  'an admin writes for a branch that is not their own');

reset role;
set local request.jwt.claims to '{}';
select is(
  (select branch_id from public.broadcasts where title = 'Admin for Glasgow'),
  '00000000-0000-4000-8000-000000000001'::uuid,
  'and the branch they named is the one it goes to');

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"91100000-0000-4000-8000-00000000000b","role":"authenticated","user_role":"admin"}';

select lives_ok(
  $$select public.create_broadcast_draft('ministry', null, 'Everyone', 'Body')$$,
  'and to the whole ministry');

reset role;
set local request.jwt.claims to '{}';
select is(
  (select branch_id from public.broadcasts where title = 'Everyone'),
  null,
  'which carries no branch at all (the CHECK ties the pair together)');

-- ===========================================================================
-- 5. Editing: the author only, and only while it is still theirs.
-- ===========================================================================

-- The ids are stashed as the OWNER, because a caller who may call these functions still
-- cannot SELECT the table to find a row's id. That is the posture working, not a nuisance:
-- the dashboard gets its ids from `visible_broadcasts()`, which is scoped.
select set_config('test.mine',
  (select id::text from public.broadcasts where title = 'Mine'), true);
select set_config('test.everyone',
  (select id::text from public.broadcasts where title = 'Everyone'), true);

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"91100000-0000-4000-8000-00000000000b","role":"authenticated","user_role":"admin"}';

select throws_ok(
  $$select public.update_broadcast_draft(
      current_setting('test.mine')::uuid,
      'branch', null, 'Rewritten', 'By somebody else')$$,
  '42501', 'only the author may edit this broadcast',
  'not even an admin rewrites somebody else''s words');

reset role;
set local request.jwt.claims to '{}';
update public.broadcasts set status = 'pending_approval' where title = 'Everyone';
update public.broadcasts
  set status = 'sending', approved_by = '91100000-0000-4000-8000-00000000000a'
  where title = 'Everyone';

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"91100000-0000-4000-8000-00000000000b","role":"authenticated","user_role":"admin"}';

select throws_ok(
  $$select public.update_broadcast_draft(
      current_setting('test.everyone')::uuid,
      'ministry', null, 'Everyone', 'Changed mid-flight')$$,
  '23514', 'a broadcast that has been released cannot be edited',
  'and nobody edits one that is already going out');

-- ===========================================================================
-- 6. What each caller may SEE.
-- ===========================================================================

set local request.jwt.claims to
  '{"sub":"91100000-0000-4000-8000-00000000000d","role":"authenticated","user_role":"leader","branch_id":"00000000-0000-4000-8000-000000000003"}';

select is(
  (select count(*)::int from public.visible_broadcasts()
   where title in ('Mine', 'Admin for Glasgow')),
  0,
  'a leader in another branch sees neither Glasgow broadcast');

set local request.jwt.claims to
  '{"sub":"91100000-0000-4000-8000-00000000000a","role":"authenticated","user_role":"leader","branch_id":"00000000-0000-4000-8000-000000000001"}';

select is(
  (select count(*)::int from public.visible_broadcasts()
   where title in ('Mine', 'Admin for Glasgow')),
  2,
  'the Glasgow leader sees their own and their branch''s');

set local request.jwt.claims to
  '{"sub":"91100000-0000-4000-8000-00000000000b","role":"authenticated","user_role":"admin"}';

select is(
  (select count(*)::int from public.visible_broadcasts()
   where title in ('Mine', 'Admin for Glasgow', 'Everyone')),
  3,
  'and an admin sees everything, because the approval queue IS everything waiting');

reset role;
set local request.jwt.claims to '{}';

select * from finish();
rollback;
