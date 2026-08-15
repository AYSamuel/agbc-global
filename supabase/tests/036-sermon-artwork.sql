-- W3.1 slice 5: the sermon-artwork shelf, attempted as real clients (docs/spec/21 §4).
--
-- Four claims under test, each worthless if it lives only in the dashboard code:
--
--   1. The picture has its OWN column beside `thumbnail_url` rather than inside it, and a
--      guest can read that column: the sync owns `thumbnail_url` and overwrites it nightly
--      (20260720190000), so artwork put there would die on the next run.
--   2. Only a live-table admin whose session cleared the second factor can hang or remove
--      artwork, and object names are machine-minted `<uuid>.<ext>`, one spelling per
--      format. These URLs are PUBLIC and permanent, so a human-written filename would be a
--      permanent public string somebody chose.
--   3. `public` widens the PICTURE, not the object row. The bytes are served by a route
--      that never consults RLS; the row stays admin-only, so nobody can enumerate the
--      bucket, and members lose nothing because the app derives the URL from the path.
--   4. A dangling reference cannot be created from either side: `sermons.artwork_path` must
--      point at an existing object (trigger), and an object a sermon still points at is not
--      deletable (the policy filters it to 0 rows).
--
-- TRAP (see 009): `reset role` leaves request.jwt.claims behind; every privileged block
-- pairs it with `set local request.jwt.claims to '{}'`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

-- Cast: an admin, a leader, a member. Roles are written by the trusted setup path
-- (actor null), the same way the bootstrap migration does it.
insert into auth.users (id, email) values
  ('96000000-0000-4000-8000-00000000000a', 'art-admin@test.local'),
  ('96000000-0000-4000-8000-00000000000b', 'art-leader@test.local'),
  ('96000000-0000-4000-8000-00000000000c', 'art-member@test.local');
insert into public.profiles
  (id, email, display_name, branch_id, role, onboarded_at, age_confirmed_at)
values
  ('96000000-0000-4000-8000-00000000000a', 'art-admin@test.local', 'Art Admin',
   '00000000-0000-4000-8000-000000000001', 'admin', now(), now()),
  ('96000000-0000-4000-8000-00000000000b', 'art-leader@test.local', 'Art Leader',
   '00000000-0000-4000-8000-000000000001', 'leader', now(), now()),
  ('96000000-0000-4000-8000-00000000000c', 'art-member@test.local', 'Art Member',
   '00000000-0000-4000-8000-000000000001', 'member', now(), now());

insert into public.sermons (id, title, speaker, youtube_id)
values ('86000000-0000-4000-8000-00000000000a', 'Artwork Sermon', 'Pastor Test',
        'art-yt-0001');

-- ===========================================================================
-- 1. The shelf: public-read, capped, images only, and a column of its own.
-- ===========================================================================

select is(
  (select public from storage.buckets where id = 'sermon-artwork'),
  true,
  'sermon-artwork is PUBLIC-read: the picture on every card has nothing to fence, and a rotating signed URL would defeat the image cache it depends on');
select is(
  (select file_size_limit from storage.buckets where id = 'sermon-artwork'),
  5242880::bigint,
  'sermon-artwork caps uploads at 5 MiB, like testimony-photos');
select is(
  (select allowed_mime_types from storage.buckets where id = 'sermon-artwork'),
  array['image/jpeg', 'image/png', 'image/webp'],
  'sermon-artwork accepts only image mime types');

select has_column('public', 'sermons', 'artwork_path',
  'sermons carries artwork_path (a bucket object path)');
select has_column('public', 'sermons', 'thumbnail_url',
  'thumbnail_url is still there and still the syncs: artwork is a SECOND column precisely because the nightly upsert overwrites the first');
select ok(
  has_column_privilege('anon', 'public.sermons', 'artwork_path', 'select'),
  'a guest can read artwork_path: browsing never requires auth, and the path is how the app builds the public URL');

-- ===========================================================================
-- 2. Who hangs: live-table admins at aal2, machine-minted names only.
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"96000000-0000-4000-8000-00000000000a","role":"authenticated","user_role":"admin","branch_id":"00000000-0000-4000-8000-000000000001","aal":"aal2"}';

select lives_ok(
  $$insert into storage.objects (bucket_id, name, version)
    values ('sermon-artwork', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg',
            'v-art-1')$$,
  'an admin whose session cleared the second factor can hang artwork');

select lives_ok(
  $$insert into storage.objects (bucket_id, name, version)
    values ('sermon-artwork', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc.webp',
            'v-art-2')$$,
  'the name rule admits webp, which halves the bytes on every rail card');

-- Write-once matters MORE here than on the audio shelf: a public URL is cached by the CDN
-- and by every member's expo-image disk cache, so bytes swapped under a path would leave
-- the old picture on devices for as long as those caches live. RLS filters the update to
-- 0 rows, so the assertion is on what it failed to change.
update storage.objects set metadata = '{"planted": true}'::jsonb
  where bucket_id = 'sermon-artwork'
    and name = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg';
select is(
  (select metadata from storage.objects
    where bucket_id = 'sermon-artwork'
      and name = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg'),
  null::jsonb,
  'objects are write-once: even the admin cannot change one in place');

select throws_ok(
  $$insert into storage.objects (bucket_id, name, version)
    values ('sermon-artwork', 'berlin-youth-camp.jpg', 'v-art-x')$$,
  '42501', null,
  'a human-written filename is refused: these URLs are public and permanent, so nothing human-written may end up in one');

select throws_ok(
  $$insert into storage.objects (bucket_id, name, version)
    values ('sermon-artwork', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1.jpeg',
            'v-art-x')$$,
  '42501', null,
  'one spelling per format: jpeg is refused where jpg is admitted, because the extension comes from our own mint');

-- The same admin, in a session that never cleared the second factor.
set local request.jwt.claims to
  '{"sub":"96000000-0000-4000-8000-00000000000a","role":"authenticated","user_role":"admin","branch_id":"00000000-0000-4000-8000-000000000001"}';
select throws_ok(
  $$insert into storage.objects (bucket_id, name, version)
    values ('sermon-artwork', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2.jpg',
            'v-art-x')$$,
  '42501', null,
  'an admin session that has not cleared the second factor cannot hang artwork');

set local request.jwt.claims to
  '{"sub":"96000000-0000-4000-8000-00000000000b","role":"authenticated","user_role":"leader","branch_id":"00000000-0000-4000-8000-000000000001","aal":"aal2"}';
select throws_ok(
  $$insert into storage.objects (bucket_id, name, version)
    values ('sermon-artwork', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3.jpg',
            'v-art-x')$$,
  '42501', null,
  'a leader cannot hang artwork: content ops are admin work (17 §4)');

set local request.jwt.claims to
  '{"sub":"96000000-0000-4000-8000-00000000000c","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001","aal":"aal2"}';
select throws_ok(
  $$insert into storage.objects (bucket_id, name, version)
    values ('sermon-artwork', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4.jpg',
            'v-art-x')$$,
  '42501', null,
  'a member cannot hang artwork');

-- ===========================================================================
-- 3. `public` widens the picture, not the row.
-- ===========================================================================
-- Still the member from the block above. A member reading zero object rows costs them
-- nothing: the app holds the path from the sermon row and builds the public URL locally,
-- so the picture arrives without this table ever being consulted. What it buys is that
-- nobody can list the bucket.
--
-- Counted over THIS FILE'S OWN objects rather than the whole bucket. A bucket-wide count
-- passes on an empty database and fails the moment `pnpm db:reset` seeds a dev picture
-- into it, which is the same "counting against seeded content" trap `test/callers.ts`
-- records from W2.7. Caught here by a fresh reset, 2026-08-15.
select is(
  (select count(*)::int from storage.objects
    where bucket_id = 'sermon-artwork'
      and name in ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg',
                   'cccccccc-cccc-4ccc-8ccc-cccccccccccc.webp')),
  0,
  'a member cannot enumerate the bucket: the bytes are public, the index of them is not');

reset role;
set local request.jwt.claims to '{}';
set local role anon;
select throws_ok(
  $$insert into storage.objects (bucket_id, name, version)
    values ('sermon-artwork', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb5.jpg',
            'v-art-x')$$,
  '42501', null,
  'a guest cannot hang artwork');
select is(
  (select count(*)::int from storage.objects
    where bucket_id = 'sermon-artwork'
      and name in ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg',
                   'cccccccc-cccc-4ccc-8ccc-cccccccccccc.webp')),
  0,
  'a guest cannot enumerate the bucket either');

reset role;
set local request.jwt.claims to '{}';
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"96000000-0000-4000-8000-00000000000a","role":"authenticated","user_role":"admin","branch_id":"00000000-0000-4000-8000-000000000001","aal":"aal2"}';
select is(
  (select count(*)::int from storage.objects
    where bucket_id = 'sermon-artwork'
      and name in ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg',
                   'cccccccc-cccc-4ccc-8ccc-cccccccccccc.webp')),
  2,
  'the admin reads the rows, which is what the dashboard needs to state a picture''s size and date');

-- ===========================================================================
-- 4. The guard: a message cannot point at a picture that is not there.
-- ===========================================================================

select lives_ok(
  $$update public.sermons
      set artwork_path = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg'
    where id = '86000000-0000-4000-8000-00000000000a'$$,
  'attaching an uploaded picture to a message works');

select throws_ok(
  $$update public.sermons
      set artwork_path = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd.jpg'
    where id = '86000000-0000-4000-8000-00000000000a'$$,
  '23514', 'sermons.artwork_path must reference an uploaded sermon-artwork object',
  'a message cannot point at a picture that was never uploaded');

-- A broken image on every rail card would be worse than the branded gradient it replaced,
-- because the fallback is designed and a broken image is not.
select lives_ok(
  $$insert into public.sermons (id, title, speaker, artwork_path)
    values ('86000000-0000-4000-8000-00000000000b', 'Artwork Audio Only',
            'Pastor Test', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc.webp')$$,
  'a message created with artwork works: this is the flow the slice exists for');

select lives_ok(
  $$update public.sermons set artwork_path = null
    where id = '86000000-0000-4000-8000-00000000000b'$$,
  'clearing artwork_path is always allowed: that is the removal order');

-- Changing something else on a message that already carries artwork must not re-litigate
-- the picture (the guard is scoped to a CHANGED path, like the photo guards in W2.3).
select lives_ok(
  $$update public.sermons set speaker = 'Pastor Renamed'
    where id = '86000000-0000-4000-8000-00000000000a'$$,
  'editing a message''s metadata does not re-check its artwork');

-- ===========================================================================
-- 5. Delete discipline: a referenced object is not deletable.
-- ===========================================================================
-- Storage refuses direct SQL deletes outright (storage.protect_delete(), a statement-level
-- trigger) unless this GUC is set, which is exactly what the Storage API sets on its own
-- delete path. Setting it here emulates that path, so the thing left deciding is precisely
-- our RLS policy.
set local storage.allow_delete_query to 'true';

delete from storage.objects
  where bucket_id = 'sermon-artwork'
    and name = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg';
select is(
  (select count(*)::int from storage.objects
    where bucket_id = 'sermon-artwork'
      and name = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg'),
  1,
  'a picture a message still points at is not deletable, even by the admin');

update public.sermons set artwork_path = null
  where id = '86000000-0000-4000-8000-00000000000a';

delete from storage.objects
  where bucket_id = 'sermon-artwork'
    and name = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg';
select is(
  (select count(*)::int from storage.objects
    where bucket_id = 'sermon-artwork'
      and name = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg'),
  0,
  'clear the reference first and the same delete goes through');

-- ===========================================================================
-- 6. The audio shelf is untouched, and the trusted path stays trusted.
-- ===========================================================================
-- Two buckets, two postures, side by side: the audio's OBJECT row is readable by everyone
-- (that read IS the permission to mint a signed URL) and the artwork's is not. A single
-- careless policy widening either one is the thing this pair would catch.
set local storage.allow_delete_query to 'false';

reset role;
set local request.jwt.claims to '{}';

-- Back on the trusted role deliberately, and section 1 only passed for the same reason:
-- storage.buckets carries RLS with no policy for clients, so this subquery answers NULL to
-- an admin. Worth knowing before reaching for a bucket's own row anywhere in app code.
select is(
  (select public from storage.buckets where id = 'sermon-audio'),
  false,
  'sermon-audio is still private: the asset is fenced, the advertisement for it is not');

select lives_ok(
  $$update public.sermons
      set artwork_path = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.jpg'
    where id = '86000000-0000-4000-8000-00000000000a'$$,
  'the service path (actor null) bypasses the guard, like every guard here');

select * from finish();
rollback;
