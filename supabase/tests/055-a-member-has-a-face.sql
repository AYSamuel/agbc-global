-- The avatars bucket (docs/spec/02 §Storage, `16` §DELETE; W4.5 slice 5).
--
-- WHY THIS FILE EXISTS. `02` described this bucket for months and no migration created it.
-- The gap was invisible because nothing writes `profiles.avatar_url` yet, and it would have
-- stayed invisible until the first profile picture went up and the first erasure after it
-- threw on a bucket that was not there. So the assertions below are mostly about SHAPE
-- rather than behaviour: they are the record that the thing `02` promises is the thing that
-- exists, and they go red if either side moves.
--
-- The one behavioural pair is the folder rule, in both directions, because creating the
-- bucket is what made `avatar_url` dangerous: a member who could point their profile at a
-- stranger's object would have their own erasure delete somebody else's picture.
--
-- TRAP (see 009): `reset role` leaves request.jwt.claims behind; every privileged block
-- pairs it with `set local request.jwt.claims to '{}'`.

begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

\set alice '96000000-0000-4000-8000-00000000000a'
\set bob   '96000000-0000-4000-8000-00000000000b'
\set glasgow '00000000-0000-4000-8000-000000000001'

insert into auth.users (id, email) values
  (:'alice', 'alice-face@test.local'),
  (:'bob', 'bob-face@test.local');
insert into public.profiles (id, email, display_name, branch_id, role, onboarded_at, age_confirmed_at)
values
  (:'alice', 'alice-face@test.local', 'Alice', :'glasgow', 'member', now(), now()),
  (:'bob', 'bob-face@test.local', 'Bob', :'glasgow', 'member', now(), now());

-- ===========================================================================
-- 1. The bucket is what `02` says it is.
-- ===========================================================================

select is(
  (select count(*)::int from storage.buckets where id = 'avatars'),
  1,
  'the avatars bucket EXISTS, which it did not from W1.2 until W4.5 slice 5 found it missing while walking the deletion reach');

select is(
  (select public from storage.buckets where id = 'avatars'),
  true,
  'public-read, per `02`: a profile picture is the face somebody chose to show the family, so there is nothing in it to fence and a signed URL would only cost caching');

select is(
  (select file_size_limit from storage.buckets where id = 'avatars'),
  5242880::bigint,
  '5 MiB, the same cap as every other image bucket here');

select is(
  (select allowed_mime_types from storage.buckets where id = 'avatars'),
  array['image/jpeg', 'image/png', 'image/webp'],
  'images only, and the same three everywhere: the mime list is a fence, not a preference');

-- ===========================================================================
-- 2. Who may do what to an object.
-- ===========================================================================
-- Asserted from the catalogue rather than by driving the Storage API, which pgTAP cannot
-- reach. What is checked is that each policy exists for the right command and role, and
-- crucially that the UPDATE one does NOT: objects here are write-once, and on a public
-- bucket that is the difference between a changed picture and a stale one on every device
-- whose cache still holds the old bytes at the same URL.

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'members put up their own face' and cmd = 'INSERT'),
  1,
  'a member may put up their own face');

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'members take their own face down' and cmd = 'DELETE'),
  1,
  'and take it down again');

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'members read their own folder' and cmd = 'SELECT'),
  1,
  'and list their own folder, which is how a replacement finds the object it replaces');

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and qual || coalesce(with_check, '') like '%avatars%' and cmd = 'UPDATE'),
  0,
  'and NOTHING may update an object in place: the bytes behind a public URL are cached by the CDN and by every member''s device, so a swap would leave the old face out there');

select ok(
  (select qual from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'members take their own face down') like '%profiles%',
  'the delete policy refuses an object a profile still points at, so the removal order is take the new one, point at it, then drop the old');

-- ===========================================================================
-- 3. The folder rule, which is what makes an erasure safe to run per member.
-- ===========================================================================

select has_function('public', 'assert_avatar_path_owned', array['text'],
  'the path check exists');

select ok(
  has_function_privilege('authenticated', 'public.assert_avatar_path_owned(text)', 'execute'),
  'and `authenticated` may execute it: a trigger function runs as the INVOKING role, so an ungranted helper turns a member''s own profile update into a bare 42501');

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"96000000-0000-4000-8000-00000000000a","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001","aal":"aal1"}';

select lives_ok(
  $$update public.profiles
       set avatar_url = '96000000-0000-4000-8000-00000000000a/11111111-1111-4111-8111-111111111111.jpg'
     where id = '96000000-0000-4000-8000-00000000000a'$$,
  'a member may point their profile at an object in their own folder');

select throws_ok(
  $$update public.profiles
       set avatar_url = '96000000-0000-4000-8000-00000000000b/22222222-2222-4222-8222-222222222222.jpg'
     where id = '96000000-0000-4000-8000-00000000000a'$$,
  '23514',
  null,
  'and NOT at one in somebody else''s: without this, their own erasure would collect a stranger''s path and the sweep would delete a stranger''s picture');

select throws_ok(
  $$update public.profiles
       set avatar_url = 'https://example.com/someone.jpg'
     where id = '96000000-0000-4000-8000-00000000000a'$$,
  '23514',
  null,
  'and NOT at a URL: the sweep skips URL-shaped values rather than guessing a bucket out of a hostname, so one stored here would mean an erasure that reports success while the face stays in storage for ever');

reset role;
set local request.jwt.claims to '{}';

-- The erasure records whatever the column holds, so the two halves have to agree about what
-- a path looks like. This is the seam between them, asserted once.
-- Its own statement, not a FROM-clause call beside the assertion: every subquery in one
-- statement shares one snapshot, so an assertion reading the row the same statement's
-- function just inserted reads NULL and reports a failure that is really a misuse.
select public.erase_profile(:'alice', false);

select is(
  (select storage_paths -> 'avatars' from public.account_erasures
    where profile_id = :'alice'),
  '["96000000-0000-4000-8000-00000000000a/11111111-1111-4111-8111-111111111111.jpg"]'::jsonb,
  'and the erasure hands the sweep exactly the path the guard allowed, in the bucket that now exists to receive the delete');

select * from finish();
rollback;
