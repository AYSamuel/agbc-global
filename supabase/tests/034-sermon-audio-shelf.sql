-- W3.1 slice 1: the sermon-audio shelf, attempted as real clients (docs/spec/21 §4).
--
-- Three claims under test, each worthless if it lives only in the dashboard code:
--
--   1. Only a live-table admin whose session cleared the second factor can shelve or
--      remove audio, and object names are machine-minted (`<uuid>.<ext>`): nothing
--      traversable, nothing human-written in a URL.
--   2. Everyone can MINT (the SELECT that createSignedUrl needs), guests included:
--      sermons are guest-first content and the 24h TTL is the whole fence (decision
--      2026-08-14, docs/spec/08).
--   3. A dangling reference cannot be created from either side: sermons.audio_path must
--      point at an existing object (trigger), and an object a sermon still points at is
--      not deletable (the policy filters it to 0 rows).
--
-- TRAP (see 009): `reset role` leaves request.jwt.claims behind; every privileged block
-- pairs it with `set local request.jwt.claims to '{}'`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

-- Cast: an admin, a leader, a member. Roles are written by the trusted setup path
-- (actor null), the same way the bootstrap migration does it.
insert into auth.users (id, email) values
  ('95000000-0000-4000-8000-00000000000a', 'shelf-admin@test.local'),
  ('95000000-0000-4000-8000-00000000000b', 'shelf-leader@test.local'),
  ('95000000-0000-4000-8000-00000000000c', 'shelf-member@test.local');
insert into public.profiles
  (id, email, display_name, branch_id, role, onboarded_at, age_confirmed_at)
values
  ('95000000-0000-4000-8000-00000000000a', 'shelf-admin@test.local', 'Shelf Admin',
   '00000000-0000-4000-8000-000000000001', 'admin', now(), now()),
  ('95000000-0000-4000-8000-00000000000b', 'shelf-leader@test.local', 'Shelf Leader',
   '00000000-0000-4000-8000-000000000001', 'leader', now(), now()),
  ('95000000-0000-4000-8000-00000000000c', 'shelf-member@test.local', 'Shelf Member',
   '00000000-0000-4000-8000-000000000001', 'member', now(), now());

-- A synced-looking sermon with no audio yet, written by the trusted path.
insert into public.sermons (id, title, speaker, youtube_id)
values ('85000000-0000-4000-8000-00000000000a', 'Shelf Sermon', 'Pastor Test',
        'shelf-yt-0001');

-- ===========================================================================
-- 1. The shelf itself: private, capped, audio-only, and the column is a PATH.
-- ===========================================================================

select is(
  (select public from storage.buckets where id = 'sermon-audio'),
  false,
  'sermon-audio is a private bucket: playback URLs are signed, 24h TTL');
select is(
  (select file_size_limit from storage.buckets where id = 'sermon-audio'),
  157286400::bigint,
  'sermon-audio caps uploads at 150 MiB');
select is(
  (select allowed_mime_types from storage.buckets where id = 'sermon-audio'),
  array['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/x-m4a'],
  'sermon-audio accepts only audio mime types');

select has_column('public', 'sermons', 'audio_path',
  'sermons carries audio_path (a bucket object path)');
select hasnt_column('public', 'sermons', 'audio_url',
  'audio_url is gone: a signed URL expires, so a URL must never sit on the row');

-- ===========================================================================
-- 2. Who shelves: live-table admins at aal2, machine-minted names only.
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"95000000-0000-4000-8000-00000000000a","role":"authenticated","user_role":"admin","branch_id":"00000000-0000-4000-8000-000000000001","aal":"aal2"}';

select lives_ok(
  $$insert into storage.objects (bucket_id, name, version)
    values ('sermon-audio', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.mp3',
            'v-shelf-1')$$,
  'an admin whose session cleared the second factor can shelve audio');

-- Write-once: no UPDATE policy exists, so the bytes behind a path cannot change under
-- it. Replacement is a new object plus a delete. The update runs as a statement (a
-- data-modifying CTE cannot sit in a subexpression) and RLS filters it to 0 rows, so
-- the assertion is on what it failed to change.
update storage.objects set metadata = '{"planted": true}'::jsonb
  where bucket_id = 'sermon-audio'
    and name = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.mp3';
select is(
  (select metadata from storage.objects
    where bucket_id = 'sermon-audio'
      and name = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.mp3'),
  null::jsonb,
  'objects are write-once: even the admin cannot change one in place');

select throws_ok(
  $$insert into storage.objects (bucket_id, name, version)
    values ('sermon-audio', 'sunday-service-glasgow.mp3', 'v-shelf-x')$$,
  '42501', null,
  'a human-written filename is refused: names are machine-minted uuids');

-- The same admin, in a session that never cleared the second factor.
set local request.jwt.claims to
  '{"sub":"95000000-0000-4000-8000-00000000000a","role":"authenticated","user_role":"admin","branch_id":"00000000-0000-4000-8000-000000000001"}';
select throws_ok(
  $$insert into storage.objects (bucket_id, name, version)
    values ('sermon-audio', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1.mp3',
            'v-shelf-x')$$,
  '42501', null,
  'an admin session that has not cleared the second factor cannot shelve');

set local request.jwt.claims to
  '{"sub":"95000000-0000-4000-8000-00000000000b","role":"authenticated","user_role":"leader","branch_id":"00000000-0000-4000-8000-000000000001","aal":"aal2"}';
select throws_ok(
  $$insert into storage.objects (bucket_id, name, version)
    values ('sermon-audio', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2.mp3',
            'v-shelf-x')$$,
  '42501', null,
  'a leader cannot shelve sermon audio: content ops are admin work (17 §4)');

set local request.jwt.claims to
  '{"sub":"95000000-0000-4000-8000-00000000000c","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001","aal":"aal2"}';
select throws_ok(
  $$insert into storage.objects (bucket_id, name, version)
    values ('sermon-audio', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3.mp3',
            'v-shelf-x')$$,
  '42501', null,
  'a member cannot shelve sermon audio');

reset role;
set local request.jwt.claims to '{}';
set local role anon;
select throws_ok(
  $$insert into storage.objects (bucket_id, name, version)
    values ('sermon-audio', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4.mp3',
            'v-shelf-x')$$,
  '42501', null,
  'a guest cannot shelve sermon audio');

-- ===========================================================================
-- 3. The mint permission: everyone reads, because everyone listens.
-- ===========================================================================
-- Still anon from the block above.
select is(
  (select count(*)::int from storage.objects
    where bucket_id = 'sermon-audio'
      and name = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.mp3'),
  1,
  'a guest can read the object row, which is what minting a signed URL requires');

reset role;
set local request.jwt.claims to '{}';
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"95000000-0000-4000-8000-00000000000c","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001","aal":"aal2"}';
select is(
  (select count(*)::int from storage.objects
    where bucket_id = 'sermon-audio'
      and name = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.mp3'),
  1,
  'a member can read the object row too');

-- ===========================================================================
-- 4. The reference guard: a sermon cannot point at audio that is not there.
-- ===========================================================================
set local request.jwt.claims to
  '{"sub":"95000000-0000-4000-8000-00000000000a","role":"authenticated","user_role":"admin","branch_id":"00000000-0000-4000-8000-000000000001","aal":"aal2"}';

-- A second object, and the m4a extension the name rule also admits.
select lives_ok(
  $$insert into storage.objects (bucket_id, name, version)
    values ('sermon-audio', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc.m4a',
            'v-shelf-2')$$,
  'the name rule admits m4a as well as mp3');

select lives_ok(
  $$update public.sermons
      set audio_path = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.mp3'
    where id = '85000000-0000-4000-8000-00000000000a'$$,
  'attaching an uploaded object to a sermon works');

select throws_ok(
  $$update public.sermons
      set audio_path = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd.mp3'
    where id = '85000000-0000-4000-8000-00000000000a'$$,
  '23514', 'sermons.audio_path must reference an uploaded sermon-audio object',
  'a sermon cannot point at audio that was never uploaded');

-- The manual audio-only row: a sermon that was never on YouTube at all (docs/spec/02:
-- youtube_id null, kept collision-free by the partial unique index).
select lives_ok(
  $$insert into public.sermons (id, title, speaker, audio_path)
    values ('85000000-0000-4000-8000-00000000000b', 'Shelf Audio Only',
            'Pastor Test', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc.m4a')$$,
  'an admin can create an audio-only sermon with no YouTube half');

select lives_ok(
  $$update public.sermons set audio_path = null
    where id = '85000000-0000-4000-8000-00000000000b'$$,
  'clearing audio_path is always allowed: that is the removal order');

-- ===========================================================================
-- 5. Delete discipline: a referenced object is not deletable.
-- ===========================================================================
-- Storage refuses direct SQL deletes outright (storage.protect_delete(), a
-- statement-level trigger) unless this GUC is set, which is exactly what the
-- Storage API sets on its own delete path. Setting it here emulates that path,
-- so the thing left deciding is precisely our RLS policy: row-level security
-- still filters the statement the trigger waves through.
set local storage.allow_delete_query to 'true';

delete from storage.objects
  where bucket_id = 'sermon-audio'
    and name = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.mp3';
select is(
  (select count(*)::int from storage.objects
    where bucket_id = 'sermon-audio'
      and name = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.mp3'),
  1,
  'an object a sermon still points at is not deletable, even by the admin');

update public.sermons set audio_path = null
  where id = '85000000-0000-4000-8000-00000000000a';

delete from storage.objects
  where bucket_id = 'sermon-audio'
    and name = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.mp3';
select is(
  (select count(*)::int from storage.objects
    where bucket_id = 'sermon-audio'
      and name = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.mp3'),
  0,
  'clear the reference first and the same delete goes through');

-- ===========================================================================
-- 6. The trusted path stays trusted: seeds and jobs are exempt from the guard.
-- ===========================================================================
reset role;
set local request.jwt.claims to '{}';

select lives_ok(
  $$update public.sermons
      set audio_path = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.mp3'
    where id = '85000000-0000-4000-8000-00000000000a'$$,
  'the service path (actor null) bypasses the guard, like every guard here');

select * from finish();
rollback;
