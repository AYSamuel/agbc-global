-- Moderation decisions (docs/spec/17 §1, W2.7 slice 3): who may decide, what the
-- compare-and-set actually protects, and the private note.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, email) values
  ('40000000-0000-4000-8000-0000000000a1', 't017-author@test.local'),
  ('40000000-0000-4000-8000-0000000000b1', 't017-own-leader@test.local'),
  ('40000000-0000-4000-8000-0000000000b2', 't017-other-leader@test.local'),
  ('40000000-0000-4000-8000-0000000000c1', 't017-admin@test.local');

insert into public.profiles (id, email, display_name, branch_id, role, onboarded_at) values
  ('40000000-0000-4000-8000-0000000000a1', 't017-author@test.local', 'Author',
   '00000000-0000-4000-8000-000000000002', 'member', now()),
  ('40000000-0000-4000-8000-0000000000b1', 't017-own-leader@test.local', 'Own Leader',
   '00000000-0000-4000-8000-000000000002', 'leader', now()),
  ('40000000-0000-4000-8000-0000000000b2', 't017-other-leader@test.local', 'Other Leader',
   '00000000-0000-4000-8000-000000000001', 'leader', now()),
  ('40000000-0000-4000-8000-0000000000c1', 't017-admin@test.local', 'Admin',
   '00000000-0000-4000-8000-000000000001', 'admin', now());

insert into public.testimonies
  (id, author_id, branch_id, body, language, status, consent_version)
values
  ('41000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-0000000000a1',
   '00000000-0000-4000-8000-000000000002', 'Pending, for the happy path', 'en', 'pending',
   'content-share-v1'),
  ('41000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-0000000000a1',
   '00000000-0000-4000-8000-000000000002', 'Pending, for the race', 'en', 'pending',
   'content-share-v1'),
  ('41000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-0000000000a1',
   '00000000-0000-4000-8000-000000000002', 'Pending, for the note', 'en', 'pending',
   'content-share-v1');

-- --- the private note never reaches the public read path -------------------------

select is(
  (select count(*) from information_schema.columns
    where table_schema = 'public'
      and table_name in ('testimony_feed', 'prayer_feed')
      and column_name = 'moderation_note')::int,
  0, 'moderation_note is absent from both feed views');

-- --- a leader decides in their own branch ----------------------------------------

set local role authenticated;
set local request.jwt.claims to
  '{"sub": "40000000-0000-4000-8000-0000000000b1", "role": "authenticated", "user_role": "leader", "branch_id": "00000000-0000-4000-8000-000000000002"}';

select lives_ok(
  $$update public.testimonies
      set status = 'approved',
          updated_at = (select updated_at from public.testimonies
                         where id = '41000000-0000-4000-8000-000000000001')
    where id = '41000000-0000-4000-8000-000000000001'$$,
  'a leader approves a pending item in their own branch');

select is(
  (select moderated_by from public.testimonies
    where id = '41000000-0000-4000-8000-000000000001'),
  '40000000-0000-4000-8000-0000000000b1'::uuid,
  'the audit trail records WHO decided, set by the trigger and not by the client');

select isnt(
  (select moderated_at from public.testimonies
    where id = '41000000-0000-4000-8000-000000000001'),
  null, 'and WHEN');

-- --- a leader may not reach another branch ---------------------------------------

set local request.jwt.claims to
  '{"sub": "40000000-0000-4000-8000-0000000000b2", "role": "authenticated", "user_role": "leader", "branch_id": "00000000-0000-4000-8000-000000000001"}';

-- Note the SHAPE of this refusal: not an exception. `moderators update ... in their
-- branch` filters the row out before the trigger can object, so the statement matches
-- zero rows and succeeds trivially. The database is doing its job; the application must
-- not read "no error" as "it worked", which is why moderateItem() checks that a row came
-- back and reports a foreign-branch decision as a refusal rather than a success.
update public.testimonies
   set status = 'approved',
       updated_at = (select updated_at from public.testimonies
                      where id = '41000000-0000-4000-8000-000000000002')
 where id = '41000000-0000-4000-8000-000000000002';

-- Assert from a context that can SEE the row. Reading it back as the foreign leader
-- returns no row at all, which would pass or fail for the wrong reason.
set local request.jwt.claims to
  '{"sub": "40000000-0000-4000-8000-0000000000b1", "role": "authenticated", "user_role": "leader", "branch_id": "00000000-0000-4000-8000-000000000002"}';

select is(
  (select status::text from public.testimonies
    where id = '41000000-0000-4000-8000-000000000002'),
  'pending',
  'IDOR: a leader from another branch changes nothing (RLS makes it a silent no-op)');

-- --- compare-and-set: the mechanism ----------------------------------------------
-- The SCENARIO is "the author edited between review and decision". It cannot be staged
-- here: now() is the TRANSACTION timestamp, so inside pgTAP's single transaction an
-- author edit leaves updated_at untouched and the two versions are identical by
-- construction (measured 2026-07-29). The real interleaving, across separate
-- transactions the way PostgREST serves them, is tested in
-- apps/dashboard/src/server/moderateItem.test.ts.
--
-- What IS testable here is the mechanism the scenario relies on: the updated_at a
-- moderator sends must match the row's current value, or the decision is refused.

set local request.jwt.claims to
  '{"sub": "40000000-0000-4000-8000-0000000000b1", "role": "authenticated", "user_role": "leader", "branch_id": "00000000-0000-4000-8000-000000000002"}';

select throws_ok(
  $$update public.testimonies
      set status = 'approved',
          updated_at = (select updated_at - interval '1 hour' from public.testimonies
                         where id = '41000000-0000-4000-8000-000000000002')
    where id = '41000000-0000-4000-8000-000000000002'$$,
  'PT409',
  null,
  'compare-and-set: a decision carrying a version other than the row''s current one is refused');

select is(
  (select status::text from public.testimonies
    where id = '41000000-0000-4000-8000-000000000002'),
  'pending', 'and the item stays in the queue rather than publishing unreviewed words');

-- THE TRAP, asserted so the application rule has a reason. The guard compares the
-- updated_at the CLIENT sends against the row's current value. Omit it and they are
-- identical by definition, the check passes, and a stale decision lands silently. This
-- is why the dashboard sends updated_at from one shared function that no route can
-- forget (apps/dashboard/src/server/moderateItem.ts).
select lives_ok(
  $$update public.testimonies set status = 'approved'
    where id = '41000000-0000-4000-8000-000000000002'$$,
  'a decision that omits updated_at is NOT protected: compare-and-set is opt-in');

-- --- the private note is a moderation action -------------------------------------

set local request.jwt.claims to
  '{"sub": "40000000-0000-4000-8000-0000000000a1", "role": "authenticated", "user_role": "member", "branch_id": "00000000-0000-4000-8000-000000000002"}';

select throws_ok(
  $$update public.testimonies set moderation_note = 'I am not a moderator'
    where id = '41000000-0000-4000-8000-000000000003'$$,
  null, 'moderation is a leader or admin action',
  'a member cannot write a moderation note, even on their own post');

set local request.jwt.claims to
  '{"sub": "40000000-0000-4000-8000-0000000000b1", "role": "authenticated", "user_role": "leader", "branch_id": "00000000-0000-4000-8000-000000000002"}';

select lives_ok(
  $$update public.testimonies
      set status = 'removed',
          moderation_note = 'Safeguarding: routed to the branch lead pastor.',
          updated_at = (select updated_at from public.testimonies
                         where id = '41000000-0000-4000-8000-000000000003')
    where id = '41000000-0000-4000-8000-000000000003'$$,
  'a leader removes with a private note');

-- --- removed is terminal until an admin says otherwise ---------------------------

select throws_ok(
  $$update public.testimonies
      set status = 'approved',
          updated_at = (select updated_at from public.testimonies
                         where id = '41000000-0000-4000-8000-000000000003')
    where id = '41000000-0000-4000-8000-000000000003'$$,
  null, 'only an admin may restore removed content',
  'a leader cannot undo their own removal: that is why the UI confirms it');

set local request.jwt.claims to
  '{"sub": "40000000-0000-4000-8000-0000000000c1", "role": "authenticated", "user_role": "admin", "branch_id": "00000000-0000-4000-8000-000000000001"}';

select lives_ok(
  $$update public.testimonies
      set status = 'approved',
          updated_at = (select updated_at from public.testimonies
                         where id = '41000000-0000-4000-8000-000000000003')
    where id = '41000000-0000-4000-8000-000000000003'$$,
  'an admin can restore removed content, from any branch');

reset role;
reset request.jwt.claims;

select * from finish();
rollback;
