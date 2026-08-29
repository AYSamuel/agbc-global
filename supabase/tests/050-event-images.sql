-- W3.5 slice 4b: the `event-images` bucket, attempted as real clients (docs/spec/21 §4).
--
-- Most of this shelf is `sermon-artwork` again and 036 already proves that shape against a
-- real database. What is NOT the same, and what this file exists for, is WHO WRITES.
--
--   1. A LEADER may hang an event picture. On the artwork shelf a leader is refused
--      outright (content ops are admin work, `17` §4); here the leaders of a branch run
--      their own events, so `caller_is_admin_live()` would lock out exactly the people the
--      slice is for. The bucket rule is `caller_is_moderator_live()`.
--   2. Widening WHO writes the bucket does not widen WHICH event they may put a picture on.
--      A `storage.objects` row has no branch, so the bucket cannot scope by one; the row
--      policy still does, and a leader attaching to another branch's event is FILTERED to
--      zero rows rather than refused. That silence is the reason this is a test and not a
--      comment: nothing raises, so nothing would notice.
--   3. `public` widens the PICTURE, not the object row: the bytes are served by a route
--      that never consults RLS, and the index of them stays moderator-only.
--   4. A dangling reference cannot be created from either side: `events.image_path` must
--      point at an existing object (trigger), and an object an event still points at is not
--      deletable (the policy filters it to 0 rows).
--
-- TRAP (see 009): `reset role` leaves request.jwt.claims behind; every privileged block
-- pairs it with `set local request.jwt.claims to '{}'`.
--
-- TRAP (see 036): counts are scoped to THIS FILE'S OWN objects. A bucket-wide count passes
-- on an empty database and fails the moment a seed puts a picture in it.
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

-- ===========================================================================
-- 0. Fixtures: a Glasgow leader, a Berlin leader, an admin, a member.
-- ===========================================================================
-- Two leaders on purpose. One branch's leader is the caller this slice adds; the other is
-- how we prove the row policy still scopes what the bucket policy cannot.

\set glasgow '00000000-0000-4000-8000-000000000001'
\set berlin  '00000000-0000-4000-8000-000000000002'

\set admin       '95000000-0000-4000-8000-00000000000a'
\set glasgow_led '95000000-0000-4000-8000-00000000000b'
\set berlin_led  '95000000-0000-4000-8000-00000000000c'
\set member      '95000000-0000-4000-8000-00000000000d'

\set glasgow_event '95000000-0000-4000-8000-0000000000e1'
\set berlin_event  '95000000-0000-4000-8000-0000000000e2'

insert into auth.users (id, email) values
  (:'admin',       'img-admin@test.local'),
  (:'glasgow_led', 'img-glasgow-leader@test.local'),
  (:'berlin_led',  'img-berlin-leader@test.local'),
  (:'member',      'img-member@test.local');

insert into public.profiles
  (id, email, display_name, branch_id, role, onboarded_at, age_confirmed_at)
values
  (:'admin', 'img-admin@test.local', 'Image Admin', :'glasgow', 'admin', now(), now()),
  (:'glasgow_led', 'img-glasgow-leader@test.local', 'Glasgow Leader', :'glasgow',
   'leader', now(), now()),
  (:'berlin_led', 'img-berlin-leader@test.local', 'Berlin Leader', :'berlin',
   'leader', now(), now()),
  (:'member', 'img-member@test.local', 'Image Member', :'glasgow', 'member', now(), now());

insert into public.events
  (id, branch_id, title, starts_at_local, timezone, location, status, rsvp_enabled)
values
  (:'glasgow_event', :'glasgow', 'Youth Conference',
   (current_date + 30) + time '10:00', 'Europe/London', 'Summerlee', 'scheduled', true),
  (:'berlin_event', :'berlin', 'Night of Worship',
   (current_date + 31) + time '19:00', 'Europe/Berlin', 'Oudenarder Str.', 'scheduled',
   true);

-- ===========================================================================
-- 1. The shelf and the column.
-- ===========================================================================

select is(
  (select public from storage.buckets where id = 'event-images'),
  true,
  'event-images is PUBLIC-read: the picture an event advertises itself with, on a page a guest can open without an account');
select is(
  (select file_size_limit from storage.buckets where id = 'event-images'),
  5242880::bigint,
  'event-images caps uploads at 5 MiB, like every other picture bucket here');
select is(
  (select allowed_mime_types from storage.buckets where id = 'event-images'),
  array['image/jpeg', 'image/png', 'image/webp'],
  'event-images accepts only image mime types');

select has_column('public', 'events', 'image_path',
  'events carries image_path (a bucket object path)');
select hasnt_column('public', 'events', 'image_url',
  'and no image_url: the row holds the PATH, and a column called url invites somebody to store one');
select ok(
  has_column_privilege('anon', 'public.events', 'image_path', 'select'),
  'a guest can read image_path: browsing never requires auth, and the path is how the app builds the public URL');

-- ===========================================================================
-- 2. Who hangs: moderators at aal2, and a LEADER is one.
-- ===========================================================================
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"95000000-0000-4000-8000-00000000000b","role":"authenticated","user_role":"leader","branch_id":"00000000-0000-4000-8000-000000000001","aal":"aal2"}';

-- THE CLAIM THIS SLICE ADDS. On the artwork shelf this same insert is refused.
select lives_ok(
  $$insert into storage.objects (bucket_id, name, version)
    values ('event-images', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg', 'v-img-1')$$,
  'a LEADER whose session cleared the second factor can hang an event picture: their branch runs its own events');

select lives_ok(
  $$insert into storage.objects (bucket_id, name, version)
    values ('event-images', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc.webp', 'v-img-2')$$,
  'the name rule admits webp, which halves the bytes members fetch on mobile data');

-- Write-once, and it matters more on a public bucket: the URL is cached by the CDN and by
-- every device's image cache, so bytes swapped under a path would leave the old picture on
-- devices for as long as those caches live. RLS filters the update to 0 rows, so the
-- assertion is on what it failed to change.
update storage.objects set metadata = '{"planted": true}'::jsonb
  where bucket_id = 'event-images'
    and name = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg';
select is(
  (select metadata from storage.objects
    where bucket_id = 'event-images'
      and name = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg'),
  null::jsonb,
  'objects are write-once: even the leader who uploaded one cannot change it in place');

select throws_ok(
  $$insert into storage.objects (bucket_id, name, version)
    values ('event-images', 'berlin-youth-camp-sarah.jpg', 'v-img-x')$$,
  '42501', null,
  'a human-written filename is refused: these URLs are public and permanent, so a member''s name must never end up in one');

select throws_ok(
  $$insert into storage.objects (bucket_id, name, version)
    values ('event-images', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1.jpeg', 'v-img-x')$$,
  '42501', null,
  'one spelling per format: jpeg is refused where jpg is admitted, because the extension comes from our own mint');

-- The same leader, in a session that never cleared the second factor.
set local request.jwt.claims to
  '{"sub":"95000000-0000-4000-8000-00000000000b","role":"authenticated","user_role":"leader","branch_id":"00000000-0000-4000-8000-000000000001"}';
select throws_ok(
  $$insert into storage.objects (bucket_id, name, version)
    values ('event-images', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2.jpg', 'v-img-x')$$,
  '42501', null,
  'a leader session that has not cleared the second factor cannot hang one');

set local request.jwt.claims to
  '{"sub":"95000000-0000-4000-8000-00000000000d","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001","aal":"aal2"}';
select throws_ok(
  $$insert into storage.objects (bucket_id, name, version)
    values ('event-images', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3.jpg', 'v-img-x')$$,
  '42501', null,
  'a member cannot hang an event picture: widening the bucket to leaders did not widen it to everyone');

-- ===========================================================================
-- 3. `public` widens the picture, not the row.
-- ===========================================================================
-- Still the member. Reading zero object rows costs them nothing: the app holds the path
-- from the event row and builds the public URL locally, so the picture arrives without this
-- table being consulted. What it buys is that nobody can list the bucket.
select is(
  (select count(*)::int from storage.objects
    where bucket_id = 'event-images'
      and name in ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg',
                   'cccccccc-cccc-4ccc-8ccc-cccccccccccc.webp')),
  0,
  'a member cannot enumerate the bucket: the bytes are public, the index of them is not');

reset role;
set local request.jwt.claims to '{}';
set local role anon;
select throws_ok(
  $$insert into storage.objects (bucket_id, name, version)
    values ('event-images', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4.jpg', 'v-img-x')$$,
  '42501', null,
  'a guest cannot hang an event picture');
select is(
  (select count(*)::int from storage.objects
    where bucket_id = 'event-images'
      and name in ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg',
                   'cccccccc-cccc-4ccc-8ccc-cccccccccccc.webp')),
  0,
  'a guest cannot enumerate the bucket either');

reset role;
set local request.jwt.claims to '{}';
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"95000000-0000-4000-8000-00000000000b","role":"authenticated","user_role":"leader","branch_id":"00000000-0000-4000-8000-000000000001","aal":"aal2"}';
select is(
  (select count(*)::int from storage.objects
    where bucket_id = 'event-images'
      and name in ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg',
                   'cccccccc-cccc-4ccc-8ccc-cccccccccccc.webp')),
  2,
  'the leader reads the rows, which is what the dashboard needs to state a picture''s size and date');

-- ===========================================================================
-- 4. The bucket does not decide WHICH event: the row still does.
-- ===========================================================================
-- The silent one, and the reason it is asserted rather than trusted: an UPDATE a caller is
-- not entitled to make is FILTERED by RLS. Zero rows, no error, no sign anything was
-- denied. A dashboard that reported this as saved would be lying, which is why
-- `saveEvent`/`setEventImage` read their rows back.

select lives_ok(
  $$update public.events
      set image_path = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg'
    where id = '95000000-0000-4000-8000-0000000000e1'$$,
  'the Glasgow leader puts a picture on the Glasgow event: this is the flow the slice exists for');

update public.events
   set image_path = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc.webp'
 where id = :'berlin_event';
select is(
  (select image_path from public.events where id = :'berlin_event'),
  null,
  'and cannot put one on BERLIN''S event: widening who may upload did not widen whose event they may touch, and the refusal is silent');

-- ===========================================================================
-- 5. The guard: an event cannot point at a picture that is not there.
-- ===========================================================================

select throws_ok(
  $$update public.events
      set image_path = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd.jpg'
    where id = '95000000-0000-4000-8000-0000000000e1'$$,
  '23514', 'events.image_path must reference an uploaded event-images object',
  'an event cannot point at a picture that was never uploaded');

select lives_ok(
  $$update public.events set image_path = null
    where id = '95000000-0000-4000-8000-0000000000e1'$$,
  'clearing image_path is always allowed: that is the removal order');

-- Changing something else must not re-litigate the picture (the guard is scoped to a
-- CHANGED path, like the photo guards in W2.3).
update public.events set image_path = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg'
  where id = :'glasgow_event';
select lives_ok(
  $$update public.events set location = 'Summerlee Museum'
    where id = '95000000-0000-4000-8000-0000000000e1'$$,
  'editing an event''s details does not re-check its picture');

-- ===========================================================================
-- 6. Delete discipline: a referenced object is not deletable.
-- ===========================================================================
-- Storage refuses direct SQL deletes outright (storage.protect_delete(), a statement-level
-- trigger) unless this GUC is set, which is what the Storage API sets on its own delete
-- path. Setting it here emulates that path, so the thing left deciding is our RLS policy.
set local storage.allow_delete_query to 'true';

delete from storage.objects
  where bucket_id = 'event-images'
    and name = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg';
select is(
  (select count(*)::int from storage.objects
    where bucket_id = 'event-images'
      and name = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg'),
  1,
  'a picture an event still points at is not deletable: the removal order is a mechanism, not a convention');

update public.events set image_path = null where id = :'glasgow_event';

delete from storage.objects
  where bucket_id = 'event-images'
    and name = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg';
select is(
  (select count(*)::int from storage.objects
    where bucket_id = 'event-images'
      and name = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg'),
  0,
  'and once nothing points at it, it goes');

-- ===========================================================================
-- 7. The helper itself.
-- ===========================================================================
-- Read from the catalogue and by behaviour, never by probing a function this role may not
-- execute (019's segfault note).

select ok(
  has_function_privilege('authenticated', 'public.caller_is_moderator_live()', 'execute'),
  'authenticated may call caller_is_moderator_live(): it is a policy predicate, so every role a policy names must be able to run it');

select ok(
  public.caller_is_moderator_live(),
  'it says yes for a leader');

set local request.jwt.claims to
  '{"sub":"95000000-0000-4000-8000-00000000000d","role":"authenticated","user_role":"member","branch_id":"00000000-0000-4000-8000-000000000001","aal":"aal2"}';
select ok(
  not public.caller_is_moderator_live(),
  'and no for a member');

-- The live-table read, which is the whole point of the name (ADR 0015): the claim below
-- still says leader, and the answer follows the TABLE.
--
-- Demoted by the TRUSTED path, and that is not a detail. Run as the member above it, this
-- update is FILTERED to zero rows by the profiles policy, and the assertion under it then
-- passes for the wrong reason: the leader is still a leader. Same silence as section 4.
reset role;
set local request.jwt.claims to '{}';
update public.profiles set role = 'member' where id = :'glasgow_led';
set local role authenticated;
set local request.jwt.claims to
  '{"sub":"95000000-0000-4000-8000-00000000000b","role":"authenticated","user_role":"leader","branch_id":"00000000-0000-4000-8000-000000000001","aal":"aal2"}';
select ok(
  not public.caller_is_moderator_live(),
  'a demoted leader is refused even while their token still claims the role: the answer comes from the live table, never the claim');

select * from finish();
rollback;
