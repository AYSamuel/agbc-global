-- The W2.3 slice 3 gate: a testimony cannot point at a photo the server has not opened.
--
-- 013 proves the ownership and read rules on a photo that is otherwise in good standing.
-- This suite is about the standing itself. Three claims, none of which survive living in
-- the app:
--
--   1. An unchecked object is unreferenceable. The `photo-guard` edge function records
--      every object whose bytes it has read; without that record the insert fails. A
--      client that never calls the guard does not get an unchecked photo, it gets an
--      error (decided with Ayo 2026-07-27, replacing the plan's clean-up-afterwards).
--   2. The record cannot be forged, and it does not survive the bytes changing. It is
--      written only by the service role, and it pins storage's own id for the object, so
--      deleting and re-uploading at the same path un-validates it.
--   3. Consent describes what was actually done. A post carrying a photo may only record
--      wording that asks about the people in it (docs/spec/20 §Photos).
--
-- TRAP (see 009): `reset role` leaves request.jwt.claims behind, so every privileged
-- block below pairs it with `set local request.jwt.claims to '{}'`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

insert into auth.users (id, email) values
  ('94000000-0000-4000-8000-00000000000a', 'gate-author@test.local'),
  ('94000000-0000-4000-8000-00000000000b', 'gate-outsider@test.local');
insert into public.profiles
  (id, email, display_name, branch_id, role, onboarded_at, age_confirmed_at)
values
  ('94000000-0000-4000-8000-00000000000a', 'gate-author@test.local', 'Gate Author',
   '00000000-0000-4000-8000-000000000001', 'member', now(), now()),
  ('94000000-0000-4000-8000-00000000000b', 'gate-outsider@test.local', 'Gate Outsider',
   '00000000-0000-4000-8000-000000000002', 'member', now(), now());

-- ===========================================================================
-- 1. The consent wordings this gate pairs with
-- ===========================================================================
select is(
  (select covers_photos from public.consent_versions where version = 'content-share-photo-v1'),
  true, 'content-share-photo-v1 is the wording that covers photos');
select is(
  (select active from public.consent_versions where version = 'content-share-v1'),
  true, 'content-share-v1 stays on offer for posts with no photo');
select is(
  (select covers_photos from public.consent_versions where version = 'content-share-v1'),
  false, 'content-share-v1 does not claim to cover photos');

-- ===========================================================================
-- 2. The validation record is the service role's alone
-- ===========================================================================
select is(
  (select relrowsecurity from pg_class where oid = 'public.testimony_photo_validations'::regclass),
  true, 'testimony_photo_validations: RLS enabled');
select is(
  (select relforcerowsecurity from pg_class where oid = 'public.testimony_photo_validations'::regclass),
  true, 'testimony_photo_validations: RLS forced');

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"94000000-0000-4000-8000-00000000000a","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001"}';

select throws_ok(
  $$select count(*) from public.testimony_photo_validations$$,
  '42501', null,
  'a member cannot read which photos have been checked');

select throws_ok(
  $$insert into public.testimony_photo_validations
      (object_name, object_id, object_version, byte_size, content_type)
    values ('94000000-0000-4000-8000-00000000000a/forged.jpg',
            gen_random_uuid(), 'v1', 1, 'image/jpeg')$$,
  '42501', null,
  'a member cannot forge a validation record');

-- The edge function reaches this through the service role; a member reaching it directly
-- would be able to validate an object without anything ever reading its bytes.
--
-- Asserted as a GRANT rather than by calling it, and that is not squeamishness: on this
-- Postgres build, a role calling ANY function it lacks EXECUTE on segfaults the backend
-- (signal 11). Reproduced 2026-07-27 with this function AND with the built-in
-- pg_read_file, so it is a property of the image, not of anything in this repo; the
-- narrower form of the same bug is already noted in the W1.5 migration. A test that
-- crashed the database would prove nothing anyway, whereas the ACL is the actual claim.
select is(
  has_function_privilege(
    'authenticated', 'public.record_photo_validation(text,text)', 'execute'),
  false,
  'a member is not granted the recording function');
select is(
  has_function_privilege(
    'anon', 'public.record_photo_validation(text,text)', 'execute'),
  false,
  'a guest is not granted the recording function');
select is(
  has_function_privilege(
    'service_role', 'public.record_photo_validation(text,text)', 'execute'),
  true,
  'the service role, which is what photo-guard runs as, is');

-- ===========================================================================
-- 3. An unchecked photo cannot be referenced
-- ===========================================================================
-- The member uploads (allowed: their own folder), and stops there. This is exactly the
-- shape of a client that skips the guard.
select lives_ok(
  $$insert into storage.objects (bucket_id, name, version)
    values ('testimony-photos',
            '94000000-0000-4000-8000-00000000000a/unchecked.jpg', 'v-gate-1')$$,
  'the upload itself is allowed: the bytes are checked afterwards');

select throws_ok(
  $$insert into public.testimonies (body, consent_version, image_path)
    values ('gate: photo nobody looked at', 'content-share-photo-v1',
            '94000000-0000-4000-8000-00000000000a/unchecked.jpg')$$,
  '23514', 'this photo has not been checked yet',
  'a testimony cannot reference a photo the server has not opened');

-- Now the guard runs, the way it runs in production: service role, through the function.
reset role;
set local request.jwt.claims to '{}';
select public.record_photo_validation(
  '94000000-0000-4000-8000-00000000000a/unchecked.jpg', 'image/jpeg');

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"94000000-0000-4000-8000-00000000000a","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001"}';

select lives_ok(
  $$insert into public.testimonies (id, body, consent_version, image_path)
    values ('85000000-0000-4000-8000-00000000000a', 'gate: checked photo',
            'content-share-photo-v1',
            '94000000-0000-4000-8000-00000000000a/unchecked.jpg')$$,
  'once the guard has recorded it, the same photo may be referenced');

-- ===========================================================================
-- 4. Consent has to describe the photo
-- ===========================================================================
select throws_ok(
  $$insert into public.testimonies (body, consent_version, image_path)
    values ('gate: photo under wordless consent', 'content-share-v1',
            '94000000-0000-4000-8000-00000000000a/unchecked.jpg')$$,
  '23514', 'consent wording content-share-v1 does not cover sharing a photo',
  'a post carrying a photo cannot record the words-only consent wording');

-- An author editing a photo ONTO an existing post is doing something their recorded
-- consent never described, and consent evidence is immutable. W2.6 builds
-- edit-and-resubmit; this is the assert that stops it forgetting to re-ask.
select lives_ok(
  $$insert into public.testimonies (id, body, consent_version)
    values ('85000000-0000-4000-8000-00000000000b', 'gate: words only',
            'content-share-v1')$$,
  'a words-only testimony records the words-only wording');

select throws_ok(
  $$update public.testimonies
      set image_path = '94000000-0000-4000-8000-00000000000a/unchecked.jpg'
    where id = '85000000-0000-4000-8000-00000000000b'$$,
  '23514', 'consent wording content-share-v1 does not cover sharing a photo',
  'a photo cannot be edited onto a post whose consent never mentioned one');

-- Editing the words of a post that already carries a photo is a different thing, and
-- must not re-litigate the photo.
select lives_ok(
  $$update public.testimonies set body = 'gate: checked photo, reworded'
    where id = '85000000-0000-4000-8000-00000000000a'$$,
  'rewording a post that already has a photo leaves the photo alone');

-- ===========================================================================
-- 5. The record does not survive the bytes changing
-- ===========================================================================
-- In-place overwrite is gone (the storage UPDATE policy was dropped in the same
-- migration), so the only way to put different bytes at a validated path is to delete the
-- object and upload again, which mints a fresh id and version. That is simulated here as
-- a privileged rewrite of exactly those two columns, because this Postgres image refuses
-- a direct DELETE from storage.objects ("Use the Storage API instead") and pgTAP has no
-- Storage API to call. What is under test is the assert's join, and the join sees the
-- same thing either way: a row whose identity no longer matches the record.
reset role;
set local request.jwt.claims to '{}';
delete from public.testimonies
  where author_id = '94000000-0000-4000-8000-00000000000a';
update storage.objects
  set id = gen_random_uuid(), version = 'v-gate-2'
  where bucket_id = 'testimony-photos'
    and name = '94000000-0000-4000-8000-00000000000a/unchecked.jpg';

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"94000000-0000-4000-8000-00000000000a","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001"}';

select throws_ok(
  $$insert into public.testimonies (body, consent_version, image_path)
    values ('gate: swapped bytes', 'content-share-photo-v1',
            '94000000-0000-4000-8000-00000000000a/unchecked.jpg')$$,
  '23514', 'this photo has not been checked yet',
  'replacing the object at a validated path un-validates it');

-- A stranger's validated object stays a stranger's: the ownership assert fires first, and
-- the validation lookup is scoped to the caller's own folder besides.
select throws_ok(
  $$insert into public.testimonies (body, consent_version, image_path)
    values ('gate: someone else''s checked photo', 'content-share-photo-v1',
            '94000000-0000-4000-8000-00000000000b/theirs.jpg')$$,
  '23514', 'a testimony photo must live in the author''s own folder',
  'a validated photo in another member''s folder is still not attachable');

reset role;
set local request.jwt.claims to '{}';
select throws_ok(
  $$select public.record_photo_validation(
      '94000000-0000-4000-8000-00000000000a/never-uploaded.jpg', 'image/jpeg')$$,
  'P0002', 'no such photo object',
  'the guard cannot record a pass for an object that does not exist');

select * from finish();
rollback;
