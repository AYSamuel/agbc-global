-- The W2.3 compose write path, attempted as a real client (docs/spec/21 §4). Three
-- claims are under test here, and each one is the kind that is worthless if it lives
-- only in the app:
--
--   1. The Art. 9 consent record is real. A client cannot invent a consent version, and
--      cannot record consent against wording that has been superseded (docs/spec/20).
--   2. A body has a ceiling, enforced by the database and not by a TextInput.
--   3. A pending photo is unreachable. Not "the app does not show it": a guest holding
--      the object path cannot read it until a leader approves the testimony, and no
--      member can attach someone else's object to their own row (docs/spec/02 §Storage).
--
-- TRAP (see 009): `reset role` leaves request.jwt.claims behind, so privileged setup
-- silently runs as the last member. Every privileged block below pairs it with
-- `set local request.jwt.claims to '{}'`.
--
-- Second trap, specific to this suite: the content quota is 5 posts per author per
-- rolling 24h and it is REAL here. Successful inserts are counted, so the suite deletes
-- its own rows between sections rather than quietly running out of budget.
begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

-- Cast: an author and a leader in Glasgow, one member in Berlin (the outsider for both
-- the photo-ownership and the pending-photo-read cases).
insert into auth.users (id, email) values
  ('93000000-0000-4000-8000-00000000000a', 'cmp-author@test.local'),
  ('93000000-0000-4000-8000-00000000000b', 'cmp-outsider@test.local'),
  ('93000000-0000-4000-8000-00000000000c', 'cmp-leader@test.local');
insert into public.profiles
  (id, email, display_name, branch_id, role, onboarded_at, age_confirmed_at)
values
  ('93000000-0000-4000-8000-00000000000a', 'cmp-author@test.local', 'Compose Author',
   '00000000-0000-4000-8000-000000000001', 'member', now(), now()),
  ('93000000-0000-4000-8000-00000000000b', 'cmp-outsider@test.local', 'Compose Outsider',
   '00000000-0000-4000-8000-000000000002', 'member', now(), now()),
  ('93000000-0000-4000-8000-00000000000c', 'cmp-leader@test.local', 'Compose Leader',
   '00000000-0000-4000-8000-000000000001', 'leader', now(), now());

-- Superseded wording, kept for the rows that already reference it (docs/spec/20).
insert into public.consent_versions (version, active, notes)
values ('cmp-retired-v0', false, 'pgTAP fixture: wording that has been replaced');

-- ===========================================================================
-- 1. Consent versions are reference data: readable by all, writable by none.
-- ===========================================================================
-- Same bar as every other table: RLS enabled AND forced in the migration that created
-- it, never "policies later" (docs/spec/25 §3).
select is(
  (select relrowsecurity from pg_class where oid = 'public.consent_versions'::regclass),
  true, 'consent_versions: RLS enabled');
select is(
  (select relforcerowsecurity from pg_class where oid = 'public.consent_versions'::regclass),
  true, 'consent_versions: RLS forced');

set local role anon;
set local request.jwt.claims to '{}';

select ok(
  (select count(*) from public.consent_versions where version = 'content-share-v1') = 1,
  'a guest can read the consent wording versions');

reset role;
set local request.jwt.claims to '{}';
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"93000000-0000-4000-8000-00000000000a","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001"}';

select throws_ok(
  $$insert into public.consent_versions (version) values ('member-minted-v1')$$,
  '42501', null,
  'a member cannot mint a consent version');
select throws_ok(
  $$update public.consent_versions set active = true where version = 'cmp-retired-v0'$$,
  '42501', null,
  'a member cannot un-retire a consent version');

-- ===========================================================================
-- 2. Consent must be real, and current.
-- ===========================================================================

select lives_ok(
  $$insert into public.testimonies (id, body, consent_version)
    values ('84000000-0000-4000-8000-00000000000a',
            'cmp consent is current', 'content-share-v1')$$,
  'a member may post against the active consent wording');

select throws_ok(
  $$insert into public.testimonies (body, consent_version)
    values ('cmp retired consent', 'cmp-retired-v0')$$,
  '23514', 'consent wording cmp-retired-v0 is not the current version',
  'a member cannot record consent against superseded wording');

select throws_ok(
  $$insert into public.prayers (body, consent_version)
    values ('cmp invented consent', 'never-published-v9')$$,
  '23514', 'consent wording never-published-v9 is not the current version',
  'a member cannot invent a consent version');

reset role;
set local request.jwt.claims to '{}';

-- The trigger above refuses a member. The FK is the layer underneath it: even a trusted
-- writer (service role, a job, a seed) cannot leave unattributable Art. 9 evidence.
select throws_ok(
  $$insert into public.prayers (author_id, branch_id, body, consent_version)
    values ('93000000-0000-4000-8000-00000000000a',
            '00000000-0000-4000-8000-000000000001',
            'cmp privileged invented consent', 'never-published-v9')$$,
  '23503', null,
  'not even a privileged writer can reference a consent version that does not exist');

-- ===========================================================================
-- 3. Body ceilings (docs/spec/09: 2000 testimony, 1000 prayer).
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"93000000-0000-4000-8000-00000000000a","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001"}';

select lives_ok(
  $$insert into public.testimonies (body, consent_version)
    values ('cmp ' || repeat('t', 1996), 'content-share-v1')$$,
  'a testimony of exactly 2000 characters is allowed');
select throws_ok(
  $$insert into public.testimonies (body, consent_version)
    values ('cmp ' || repeat('t', 1997), 'content-share-v1')$$,
  '23514', null,
  'a testimony over 2000 characters is refused');

select lives_ok(
  $$insert into public.prayers (body, consent_version)
    values ('cmp ' || repeat('p', 996), 'content-share-v1')$$,
  'a prayer request of exactly 1000 characters is allowed');
select throws_ok(
  $$insert into public.prayers (body, consent_version)
    values ('cmp ' || repeat('p', 997), 'content-share-v1')$$,
  '23514', null,
  'a prayer request over 1000 characters is refused');

select throws_ok(
  $$insert into public.testimonies (body, consent_version)
    values ('   ', 'content-share-v1')$$,
  '23514', null,
  'a blank body is still refused');

-- Reclaim the author's quota before the photo section (see the header note).
reset role;
set local request.jwt.claims to '{}';
delete from public.testimonies
  where author_id = '93000000-0000-4000-8000-00000000000a'
    and id <> '84000000-0000-4000-8000-00000000000a';
delete from public.prayers
  where author_id = '93000000-0000-4000-8000-00000000000a';

-- ===========================================================================
-- 4. The photo path, in the order it really happens: upload, then the server's
--    magic-byte check, then the reference.
-- ===========================================================================
-- The upload comes first because a member picks a photo in the composer, long before
-- the testimony row exists. Since W2.3 slice 3 the reference is refused until the
-- photo-guard edge function has opened the object (that gate has its own suite, 014);
-- here the record is written the way the service role writes it, so the ownership rules
-- can be tested on a photo that is otherwise in good standing.
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"93000000-0000-4000-8000-00000000000a","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001"}';

-- `version` is set by Storage on every real upload and is part of what the validation
-- record pins, so the fixtures carry one too.
select lives_ok(
  $$insert into storage.objects (bucket_id, name, version)
    values ('testimony-photos',
            '93000000-0000-4000-8000-00000000000a/cmp-photo.jpg', 'v-cmp-1')$$,
  'a member may upload into their own folder');

select throws_ok(
  $$insert into storage.objects (bucket_id, name, version)
    values ('testimony-photos',
            '93000000-0000-4000-8000-00000000000b/planted.jpg', 'v-cmp-2')$$,
  '42501', null,
  'a member cannot upload into another member''s folder');

reset role;
set local request.jwt.claims to '{}';
insert into public.testimony_photo_validations
  (object_name, object_id, object_version, byte_size, content_type)
select o.name, o.id, o.version, 204800, 'image/jpeg'
from storage.objects o
where o.bucket_id = 'testimony-photos'
  and o.name = '93000000-0000-4000-8000-00000000000a/cmp-photo.jpg';

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"93000000-0000-4000-8000-00000000000a","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001"}';

-- Note the consent version: a post carrying a photo records the wording that asks about
-- the people in it (docs/spec/20 §Photos), and the guard checks the pairing.
select lives_ok(
  $$insert into public.testimonies (id, body, consent_version, image_path)
    values ('84000000-0000-4000-8000-00000000000b', 'cmp with my own photo',
            'content-share-photo-v1',
            '93000000-0000-4000-8000-00000000000a/cmp-photo.jpg')$$,
  'a member may attach a checked photo from their own folder');

select throws_ok(
  $$insert into public.testimonies (body, consent_version, image_path)
    values ('cmp claiming a stranger''s photo', 'content-share-photo-v1',
            '93000000-0000-4000-8000-00000000000b/private.jpg')$$,
  '23514', 'a testimony photo must live in the author''s own folder',
  'a member cannot attach another member''s photo object');

select throws_ok(
  $$update public.testimonies
      set image_path = '93000000-0000-4000-8000-00000000000b/private.jpg'
    where id = '84000000-0000-4000-8000-00000000000b'$$,
  '23514', 'a testimony photo must live in the author''s own folder',
  'a member cannot edit their photo reference onto a stranger''s object');

-- ===========================================================================
-- 5. The bucket's own posture.
-- ===========================================================================
reset role;
set local request.jwt.claims to '{}';

select is(
  (select public from storage.buckets where id = 'testimony-photos'),
  false,
  'testimony-photos is a private bucket');
select is(
  (select file_size_limit from storage.buckets where id = 'testimony-photos'),
  5242880::bigint,
  'testimony-photos caps uploads at 5 MiB');
select is(
  (select allowed_mime_types from storage.buckets where id = 'testimony-photos'),
  array['image/jpeg', 'image/png'],
  'testimony-photos accepts only jpeg and png');

-- ===========================================================================
-- 6. The read boundary: a pending photo is unreachable, an approved one is not.
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"93000000-0000-4000-8000-00000000000a","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001"}';

select is(
  (select count(*)::int from storage.objects
    where name = '93000000-0000-4000-8000-00000000000a/cmp-photo.jpg'),
  1,
  'the author can see their own pending photo');

-- The testimony referencing it is still pending at this point.
set local role anon;
set local request.jwt.claims to '{}';
select is(
  (select count(*)::int from storage.objects
    where name = '93000000-0000-4000-8000-00000000000a/cmp-photo.jpg'),
  0,
  'a guest holding the object path cannot read a photo awaiting review');

reset role;
set local request.jwt.claims to '{}';
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"93000000-0000-4000-8000-00000000000b","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000002"}';
select is(
  (select count(*)::int from storage.objects
    where name = '93000000-0000-4000-8000-00000000000a/cmp-photo.jpg'),
  0,
  'another branch''s member cannot read a photo awaiting review');

reset role;
set local request.jwt.claims to '{}';
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"93000000-0000-4000-8000-00000000000c","role":"authenticated","user_role":"leader","branch_id":"00000000-0000-4000-8000-000000000001"}';
select is(
  (select count(*)::int from storage.objects
    where name = '93000000-0000-4000-8000-00000000000a/cmp-photo.jpg'),
  1,
  'the branch leader can read the pending photo they have to review');

-- Approve it the way the dashboard will.
reset role;
set local request.jwt.claims to '{}';
update public.testimonies
  set status = 'approved'
  where id = '84000000-0000-4000-8000-00000000000b';

set local role anon;
set local request.jwt.claims to '{}';
select is(
  (select count(*)::int from storage.objects
    where name = '93000000-0000-4000-8000-00000000000a/cmp-photo.jpg'),
  1,
  'once the testimony is approved the photo is readable by anyone');

-- ===========================================================================
-- 7. reacted_by_me: a card's own reaction state, on the card's own row (W2.4)
-- ===========================================================================
-- The count and "did I react" used to be two client queries that refetched
-- independently, so a card could briefly hold one and not the other. They travel
-- together now, and the column must answer about the CALLER and nobody else.
reset role;
set local request.jwt.claims to '{}';
insert into public.glory_reactions (testimony_id, profile_id)
values ('84000000-0000-4000-8000-00000000000b',
        '93000000-0000-4000-8000-00000000000a');

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"93000000-0000-4000-8000-00000000000a","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001"}';
select is(
  (select reacted_by_me from public.testimony_feed
    where id = '84000000-0000-4000-8000-00000000000b'),
  true,
  'the member who reacted sees reacted_by_me true');

reset role;
set local request.jwt.claims to '{}';
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"93000000-0000-4000-8000-00000000000b","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000002"}';
select is(
  (select reacted_by_me from public.testimony_feed
    where id = '84000000-0000-4000-8000-00000000000b'),
  false,
  'another member sees false: the column never reports anyone else''s reaction');

set local role anon;
set local request.jwt.claims to '{}';
select is(
  (select reacted_by_me from public.testimony_feed
    where id = '84000000-0000-4000-8000-00000000000b'),
  false,
  'a guest, having no uid, always sees false');

-- ===========================================================================
-- 8. my_intercession_state: the prayer card's own commitment, on its own row
-- ===========================================================================
-- Same claim as reacted_by_me one section up, for the state W2.4 slice 3 will
-- read. It must answer about the CALLER and never about anyone else, and it must
-- follow the two-step forward: committed, then prayed.
reset role;
set local request.jwt.claims to '{}';
insert into public.prayers
  (id, author_id, branch_id, body, consent_version, status)
values ('86000000-0000-4000-8000-00000000000a',
        '93000000-0000-4000-8000-00000000000a',
        '00000000-0000-4000-8000-000000000001',
        'cmp please pray for my mother', 'content-share-v1', 'approved');

set local role authenticated;
set local request.jwt.claims to
  '{"sub":"93000000-0000-4000-8000-00000000000b","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000002"}';
select is(
  (select my_intercession_state from public.prayer_feed
    where id = '86000000-0000-4000-8000-00000000000a'),
  null,
  'a member who has not committed sees null');

insert into public.prayer_intercessions (prayer_id, profile_id)
values ('86000000-0000-4000-8000-00000000000a',
        '93000000-0000-4000-8000-00000000000b');
select is(
  (select my_intercession_state::text from public.prayer_feed
    where id = '86000000-0000-4000-8000-00000000000a'),
  'committed',
  'after "I will pray" the row reports committed');

update public.prayer_intercessions
  set state = 'prayed', prayed_at = now()
  where prayer_id = '86000000-0000-4000-8000-00000000000a'
    and profile_id = '93000000-0000-4000-8000-00000000000b';
select is(
  (select my_intercession_state::text from public.prayer_feed
    where id = '86000000-0000-4000-8000-00000000000a'),
  'prayed',
  'after "I prayed" it reports prayed');

set local role anon;
set local request.jwt.claims to '{}';
select is(
  (select my_intercession_state from public.prayer_feed
    where id = '86000000-0000-4000-8000-00000000000a'),
  null,
  'a guest sees null, and someone else''s commitment is never disclosed');

reset role;
set local request.jwt.claims to '{}';
select * from finish();
rollback;
