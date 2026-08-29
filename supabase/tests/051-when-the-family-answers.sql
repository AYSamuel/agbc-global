-- W3.6 slice 2: the notifications a member's own post earns (20260829120000).
--
-- `09` §Notifications promises three things and, until this slice, produced none of them:
-- "Your testimony got Glory reactions. Someone prayed for your request. Your post was
-- approved / needs changes." Every other part existed (the type CHECK, the channels, the
-- pref columns, the templates in four languages, the app's renderer) and no code anywhere
-- wrote the rows, so `prayer_activity` and `testimony_activity` were two switches on
-- NOTIF-PREFS that gated nothing.
--
-- So the assertions that matter most here are the SUPPRESSIONS, and specifically the ones
-- that only bite when somebody is deliberately excluded: a member's own act, a block in
-- either direction, a pref that is off, and a post that was never published. A happy-path
-- suite would pass with every one of those broken.
--
-- TRAP (see 009's header): `reset role` drops the ROLE but leaves `request.jwt.claims`.
-- This file never leaves a member's claims set, because the family guards read auth.uid()
-- and a leftover claim would rewrite the fixtures underneath the assertions.
--
-- TRAP (see 019): never CALL a function the current role lacks EXECUTE on; the backend
-- segfaults. The ACL assertions read the catalogue and never probe by invoking.
--
-- FIXTURE SCOPING (#184, and W3.5's lesson): every count below is filtered to this file's
-- own rows. The seed ships approved testimonies with Glory on them and real intercessions,
-- so a bare `count(*) from activity_notice_batch()` would be a race with the seed and with
-- whatever the other 50 files leave behind.
begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

-- The clock every assertion is measured against. Fixed rather than `now()`, so the settle
-- window and the hour buckets are arithmetic instead of a race with the wall clock.
\set anchor '2026-08-29 11:40:00+00'

-- Cast: an author, two members who respond to her, and one she has blocked.
insert into auth.users (id, email) values
  ('a1000000-0000-4000-8000-00000000000a', 'an-author@test.local'),
  ('a1000000-0000-4000-8000-00000000000b', 'an-intercessor@test.local'),
  ('a1000000-0000-4000-8000-00000000000c', 'a-rejoicer@test.local'),
  ('a1000000-0000-4000-8000-00000000000d', 'a-blocked-one@test.local'),
  ('a1000000-0000-4000-8000-00000000000e', 'a-latecomer@test.local'),
  ('a1000000-0000-4000-8000-00000000000f', 'a-straggler@test.local');
insert into public.profiles
  (id, email, display_name, branch_id, role, onboarded_at, age_confirmed_at)
values
  ('a1000000-0000-4000-8000-00000000000a', 'an-author@test.local', 'An Author',
   '00000000-0000-4000-8000-000000000001', 'member', now(), now()),
  ('a1000000-0000-4000-8000-00000000000b', 'an-intercessor@test.local', 'An Intercessor',
   '00000000-0000-4000-8000-000000000001', 'member', now(), now()),
  ('a1000000-0000-4000-8000-00000000000c', 'a-rejoicer@test.local', 'A Rejoicer',
   '00000000-0000-4000-8000-000000000001', 'member', now(), now()),
  ('a1000000-0000-4000-8000-00000000000d', 'a-blocked-one@test.local', 'A Blocked One',
   '00000000-0000-4000-8000-000000000001', 'member', now(), now()),
  -- One Glory per member per testimony (the unique on glory_reactions), so the reactions
  -- that land in LATER hours need people who have not reacted yet.
  ('a1000000-0000-4000-8000-00000000000e', 'a-latecomer@test.local', 'A Latecomer',
   '00000000-0000-4000-8000-000000000001', 'member', now(), now()),
  ('a1000000-0000-4000-8000-00000000000f', 'a-straggler@test.local', 'A Straggler',
   '00000000-0000-4000-8000-000000000001', 'member', now(), now());

insert into public.prayers
  (id, author_id, branch_id, body, status, consent_version, moderated_at)
values
  ('a1000000-0000-4000-8000-0000000000f1'::uuid, 'a1000000-0000-4000-8000-00000000000a',
   '00000000-0000-4000-8000-000000000001', 'Pray for my mother', 'approved', 'content-share-v1',
   :'anchor'::timestamptz - interval '2 days');

insert into public.testimonies
  (id, author_id, branch_id, body, status, consent_version, moderated_at)
values
  ('a1000000-0000-4000-8000-0000000000e1'::uuid, 'a1000000-0000-4000-8000-00000000000a',
   '00000000-0000-4000-8000-000000000001', 'God came through', 'approved', 'content-share-v1',
   :'anchor'::timestamptz - interval '2 days');

-- ===========================================================================
-- 1. Who may run it at all.
-- ===========================================================================

select is(has_function_privilege('anon',
  'public.activity_notice_batch(timestamptz, interval, interval)', 'execute'), false,
  'a guest cannot ask who is owed a notification');
select is(has_function_privilege('authenticated',
  'public.activity_notice_batch(timestamptz, interval, interval)', 'execute'), false,
  'and neither can a member: it reads across every author in the church');

select is(
  (select count(*)::int from cron.job where jobname = 'activity-notices'),
  1,
  'the job is scheduled exactly once (cron.schedule upserts by name)');
select is(
  (select schedule from cron.job where jobname = 'activity-notices'),
  '* * * * *',
  'every minute: two of its three arms are answers somebody is waiting on');

-- ===========================================================================
-- 2. Someone prayed for your request.
-- ===========================================================================

insert into public.prayer_intercessions
  (id, prayer_id, profile_id, state, committed_at, prayed_at)
values
  ('a1000000-0000-4000-8000-0000000000d1'::uuid,
   'a1000000-0000-4000-8000-0000000000f1'::uuid,
   'a1000000-0000-4000-8000-00000000000b', 'prayed',
   :'anchor'::timestamptz - interval '2 hours', :'anchor'::timestamptz - interval '1 hour');

select is(
  (select count(*)::int from public.activity_notice_batch(:'anchor'::timestamptz)
   where kind = 'prayed'
     and recipient_id = 'a1000000-0000-4000-8000-00000000000a'),
  1,
  'a fulfilled commitment owes the author exactly one notification');

select is(
  (select dedupe_key from public.activity_notice_batch(:'anchor'::timestamptz)
   where kind = 'prayed'
     and recipient_id = 'a1000000-0000-4000-8000-00000000000a'),
  'prayed:a1000000-0000-4000-8000-0000000000d1',
  'and the key is the intercession, so one person cannot ring the author twice');

-- Decision 1 (2026-08-29): the trigger is "I prayed", not "I will pray". The template is
-- past tense and it should tell the truth; a commitment that is never fulfilled is what
-- W3.4's three nudges are for.
update public.prayer_intercessions
set state = 'committed', prayed_at = null
where id = 'a1000000-0000-4000-8000-0000000000d1'::uuid;
select is(
  (select count(*)::int from public.activity_notice_batch(:'anchor'::timestamptz)
   where kind = 'prayed'
     and recipient_id = 'a1000000-0000-4000-8000-00000000000a'),
  0,
  'a commitment alone tells the author nothing: the promise is not the prayer');
update public.prayer_intercessions
set state = 'prayed', prayed_at = :'anchor'::timestamptz - interval '1 hour'
where id = 'a1000000-0000-4000-8000-0000000000d1'::uuid;

-- Praying for your own request is allowed (`09`) and is not news.
insert into public.prayer_intercessions
  (id, prayer_id, profile_id, state, committed_at, prayed_at)
values
  ('a1000000-0000-4000-8000-0000000000d2'::uuid,
   'a1000000-0000-4000-8000-0000000000f1'::uuid,
   'a1000000-0000-4000-8000-00000000000a', 'prayed',
   :'anchor'::timestamptz - interval '2 hours', :'anchor'::timestamptz - interval '1 hour');
select is(
  (select count(*)::int from public.activity_notice_batch(:'anchor'::timestamptz)
   where kind = 'prayed'
     and dedupe_key = 'prayed:a1000000-0000-4000-8000-0000000000d2'),
  0,
  'praying for your own request does not notify you about yourself');

update public.notification_prefs set prayer_activity = false
  where profile_id = 'a1000000-0000-4000-8000-00000000000a';
select is(
  (select count(*)::int from public.activity_notice_batch(:'anchor'::timestamptz)
   where kind = 'prayed'
     and recipient_id = 'a1000000-0000-4000-8000-00000000000a'),
  0,
  'prayer_activity off suppresses it, on the column 15''s tier table names');
update public.notification_prefs set prayer_activity = true
  where profile_id = 'a1000000-0000-4000-8000-00000000000a';

-- `15`: activity is suppressed across a block in EITHER direction, which is two separate
-- rows and therefore two separate assertions. A one-sided clause passes the first.
insert into public.blocked_users (blocker_id, blocked_id) values
  ('a1000000-0000-4000-8000-00000000000a', 'a1000000-0000-4000-8000-00000000000b');
select is(
  (select count(*)::int from public.activity_notice_batch(:'anchor'::timestamptz)
   where kind = 'prayed'
     and dedupe_key = 'prayed:a1000000-0000-4000-8000-0000000000d1'),
  0,
  'the author blocked them, so their prayer is not announced');
delete from public.blocked_users
  where blocker_id = 'a1000000-0000-4000-8000-00000000000a';

insert into public.blocked_users (blocker_id, blocked_id) values
  ('a1000000-0000-4000-8000-00000000000b', 'a1000000-0000-4000-8000-00000000000a');
select is(
  (select count(*)::int from public.activity_notice_batch(:'anchor'::timestamptz)
   where kind = 'prayed'
     and dedupe_key = 'prayed:a1000000-0000-4000-8000-0000000000d1'),
  0,
  'and the other direction too: a block hides both ways (docs/spec/02)');
delete from public.blocked_users
  where blocker_id = 'a1000000-0000-4000-8000-00000000000b';

update public.prayers set status = 'pending'
  where id = 'a1000000-0000-4000-8000-0000000000f1'::uuid;
select is(
  (select count(*)::int from public.activity_notice_batch(:'anchor'::timestamptz)
   where kind = 'prayed'
     and dedupe_key = 'prayed:a1000000-0000-4000-8000-0000000000d1'),
  0,
  'a request that is not published has nothing to report');
update public.prayers set status = 'approved'
  where id = 'a1000000-0000-4000-8000-0000000000f1'::uuid;

update public.prayers set deleted_at = :'anchor'::timestamptz
  where id = 'a1000000-0000-4000-8000-0000000000f1'::uuid;
select is(
  (select count(*)::int from public.activity_notice_batch(:'anchor'::timestamptz)
   where kind = 'prayed'
     and dedupe_key = 'prayed:a1000000-0000-4000-8000-0000000000d1'),
  0,
  'nor does one the author has taken down');
update public.prayers set deleted_at = null
  where id = 'a1000000-0000-4000-8000-0000000000f1'::uuid;

-- ===========================================================================
-- 3. N people said Glory. The collapse, and what it must never drop.
-- ===========================================================================

-- Three in the 10:00 hour, the newest of them 50 minutes before the anchor.
insert into public.glory_reactions (testimony_id, profile_id, created_at) values
  ('a1000000-0000-4000-8000-0000000000e1'::uuid,
   'a1000000-0000-4000-8000-00000000000b', :'anchor'::timestamptz - interval '90 minutes'),
  ('a1000000-0000-4000-8000-0000000000e1'::uuid,
   'a1000000-0000-4000-8000-00000000000c', :'anchor'::timestamptz - interval '60 minutes'),
  ('a1000000-0000-4000-8000-0000000000e1'::uuid,
   'a1000000-0000-4000-8000-00000000000d', :'anchor'::timestamptz - interval '50 minutes');

select is(
  (select count(*)::int from public.activity_notice_batch(:'anchor'::timestamptz)
   where kind = 'glory'
     and subject_id = 'a1000000-0000-4000-8000-0000000000e1'::uuid),
  1,
  'a burst of Glory is ONE notification, not one per person');
select is(
  (select tally from public.activity_notice_batch(:'anchor'::timestamptz)
   where kind = 'glory'
     and subject_id = 'a1000000-0000-4000-8000-0000000000e1'::uuid),
  3,
  'carrying the size of the burst, which is the number the author actually reads');

-- The settle window: a burst still arriving has not finished, so it is not yet due. The
-- clock here is 5 minutes after the newest reaction, inside the 15-minute default.
select is(
  (select count(*)::int from public.activity_notice_batch(
     :'anchor'::timestamptz - interval '45 minutes')
   where kind = 'glory'
     and subject_id = 'a1000000-0000-4000-8000-0000000000e1'::uuid),
  0,
  'while the reactions are still arriving, nothing is sent: the window has not settled');

-- Decision 2 (2026-08-29), and the entire reason per-hour was chosen over `15`'s original
-- per-day: a reaction that lands later must still reach the author. Under a per-day
-- collapse this row would be swallowed by the key above and she would never hear about it.
insert into public.glory_reactions (testimony_id, profile_id, created_at) values
  ('a1000000-0000-4000-8000-0000000000e1'::uuid,
   'a1000000-0000-4000-8000-00000000000e', :'anchor'::timestamptz + interval '80 minutes');
select is(
  (select count(*)::int from public.activity_notice_batch(
     :'anchor'::timestamptz + interval '2 hours')
   where kind = 'glory'
     and subject_id = 'a1000000-0000-4000-8000-0000000000e1'::uuid),
  2,
  'a later reaction gets its own hour and its own notification: nothing is dropped');
select isnt(
  (select min(dedupe_key) from public.activity_notice_batch(
     :'anchor'::timestamptz + interval '2 hours')
   where kind = 'glory'
     and subject_id = 'a1000000-0000-4000-8000-0000000000e1'::uuid),
  (select max(dedupe_key) from public.activity_notice_batch(
     :'anchor'::timestamptz + interval '2 hours')
   where kind = 'glory'
     and subject_id = 'a1000000-0000-4000-8000-0000000000e1'::uuid),
  'and the two carry different keys, so neither can swallow the other');
delete from public.glory_reactions
  where testimony_id = 'a1000000-0000-4000-8000-0000000000e1'::uuid
    and created_at > :'anchor'::timestamptz;

-- The hour boundary is the upper bound on how long a busy testimony can hold its author
-- waiting. This reaction is 2 minutes old at the clock below, far inside the settle
-- window, and the bucket goes anyway because its hour has ended.
insert into public.glory_reactions (testimony_id, profile_id, created_at) values
  ('a1000000-0000-4000-8000-0000000000e1'::uuid,
   'a1000000-0000-4000-8000-00000000000f', :'anchor'::timestamptz + interval '78 minutes');
select is(
  (select count(*)::int from public.activity_notice_batch(
     :'anchor'::timestamptz + interval '80 minutes')
   where kind = 'glory'
     and dedupe_key = 'glory:a1000000-0000-4000-8000-0000000000e1:2026-08-29T12'),
  1,
  'a bucket still receiving reactions is sent at the hour boundary regardless');
delete from public.glory_reactions
  where testimony_id = 'a1000000-0000-4000-8000-0000000000e1'::uuid
    and created_at > :'anchor'::timestamptz;

-- The author's own Glory must neither notify her nor inflate the number she is shown.
insert into public.glory_reactions (testimony_id, profile_id, created_at) values
  ('a1000000-0000-4000-8000-0000000000e1'::uuid,
   'a1000000-0000-4000-8000-00000000000a', :'anchor'::timestamptz - interval '55 minutes');
select is(
  (select tally from public.activity_notice_batch(:'anchor'::timestamptz)
   where kind = 'glory'
     and subject_id = 'a1000000-0000-4000-8000-0000000000e1'::uuid),
  3,
  'your own Glory on your own testimony is not counted back to you');

-- A blocked member's reaction is excluded from the COUNT, not merely from the recipient
-- list. The check lives inside the aggregation for exactly this reason.
insert into public.blocked_users (blocker_id, blocked_id) values
  ('a1000000-0000-4000-8000-00000000000a', 'a1000000-0000-4000-8000-00000000000d');
select is(
  (select tally from public.activity_notice_batch(:'anchor'::timestamptz)
   where kind = 'glory'
     and subject_id = 'a1000000-0000-4000-8000-0000000000e1'::uuid),
  2,
  'a blocked member''s Glory does not inflate the count the author is told');
delete from public.blocked_users
  where blocker_id = 'a1000000-0000-4000-8000-00000000000a';

update public.notification_prefs set testimony_activity = false
  where profile_id = 'a1000000-0000-4000-8000-00000000000a';
select is(
  (select count(*)::int from public.activity_notice_batch(:'anchor'::timestamptz)
   where kind = 'glory'
     and subject_id = 'a1000000-0000-4000-8000-0000000000e1'::uuid),
  0,
  'testimony_activity off suppresses it, on the column 15''s tier table names');
update public.notification_prefs set testimony_activity = true
  where profile_id = 'a1000000-0000-4000-8000-00000000000a';

-- ===========================================================================
-- 4. A leader decided about your post.
-- ===========================================================================

select is(
  (select detail from public.activity_notice_batch(:'anchor'::timestamptz)
   where kind = 'moderation'
     and subject_id = 'a1000000-0000-4000-8000-0000000000e1'::uuid),
  'approved',
  'an approval reaches the author, carrying the outcome that picks the words');
select is(
  (select subject_kind from public.activity_notice_batch(:'anchor'::timestamptz)
   where kind = 'moderation'
     and subject_id = 'a1000000-0000-4000-8000-0000000000f1'::uuid),
  'prayer',
  'and a prayer request is decided about too, not only a testimony');

update public.testimonies set status = 'rejected'
  where id = 'a1000000-0000-4000-8000-0000000000e1'::uuid;
select is(
  (select detail from public.activity_notice_batch(:'anchor'::timestamptz)
   where kind = 'moderation'
     and subject_id = 'a1000000-0000-4000-8000-0000000000e1'::uuid),
  'rejected',
  'so does a rejection, which is the half 09 calls "needs changes"');

update public.testimonies set status = 'removed'
  where id = 'a1000000-0000-4000-8000-0000000000e1'::uuid;
select is(
  (select detail from public.activity_notice_batch(:'anchor'::timestamptz)
   where kind = 'moderation'
     and subject_id = 'a1000000-0000-4000-8000-0000000000e1'::uuid),
  'removed',
  'and a REMOVAL, which 09 line 82 promised and nothing has ever sent');

-- `09`: any edit to an approved post resets it to pending. The author knows they just
-- edited, and there is no decision yet, so there is nothing to tell them.
update public.testimonies set status = 'pending'
  where id = 'a1000000-0000-4000-8000-0000000000e1'::uuid;
select is(
  (select count(*)::int from public.activity_notice_batch(:'anchor'::timestamptz)
   where kind = 'moderation'
     and subject_id = 'a1000000-0000-4000-8000-0000000000e1'::uuid),
  0,
  'a post back in the queue is not a decision, so it says nothing');

-- The re-approval after that edit is a NEW decision, and the key carries moderated_at so
-- it cannot be mistaken for the first one.
update public.testimonies
set status = 'approved', moderated_at = :'anchor'::timestamptz - interval '10 minutes'
where id = 'a1000000-0000-4000-8000-0000000000e1'::uuid;
select is(
  (select dedupe_key from public.activity_notice_batch(:'anchor'::timestamptz)
   where kind = 'moderation'
     and subject_id = 'a1000000-0000-4000-8000-0000000000e1'::uuid),
  'moderation:testimony:a1000000-0000-4000-8000-0000000000e1:2026-08-29T11:30:00.000000',
  'a re-approval mints its own key: the author hears that it is live again');

-- Transactional (`15`): the `transactional` channel has no pref key at all, so no switch
-- a member can reach may silence a decision about their own post.
update public.notification_prefs
set ministry_announcements = false, branch_updates = false, service_reminders = false,
    prayer_activity = false, prayer_reminders = false, testimony_activity = false
where profile_id = 'a1000000-0000-4000-8000-00000000000a';
select is(
  (select count(*)::int from public.activity_notice_batch(:'anchor'::timestamptz)
   where kind = 'moderation'
     and subject_id = 'a1000000-0000-4000-8000-0000000000e1'::uuid),
  1,
  'with every switch turned off, a decision about your own post still reaches you');
update public.notification_prefs
set ministry_announcements = true, branch_updates = true, service_reminders = true,
    prayer_activity = true, prayer_reminders = true, testimony_activity = true
where profile_id = 'a1000000-0000-4000-8000-00000000000a';

-- ===========================================================================
-- 5. The claim, and the resume.
-- ===========================================================================

-- The anti-join is the cursor, exactly as `event-notices` uses it: once the row exists,
-- the work is done and a re-run finds nothing.
select is(
  (select count(*)::int from public.deliver_notifications(
     jsonb_build_array(jsonb_build_object(
       'profile_id', 'a1000000-0000-4000-8000-00000000000a',
       'type', 'prayer',
       'template_key', 'prayer.someone_prayed',
       'params', '{}'::jsonb,
       'deep_link', '/prayer/a1000000-0000-4000-8000-0000000000f1',
       'dedupe_key', 'prayed:a1000000-0000-4000-8000-0000000000d1')))),
  1,
  'the seam writes the row and hands back exactly what it created');

select is(
  (select count(*)::int from public.activity_notice_batch(:'anchor'::timestamptz)
   where kind = 'prayed'
     and dedupe_key = 'prayed:a1000000-0000-4000-8000-0000000000d1'),
  0,
  'and the claimed intercession drops out of the batch: the row IS the cursor');

select is(
  (select count(*)::int from public.deliver_notifications(
     jsonb_build_array(jsonb_build_object(
       'profile_id', 'a1000000-0000-4000-8000-00000000000a',
       'type', 'prayer',
       'template_key', 'prayer.someone_prayed',
       'params', '{}'::jsonb,
       'deep_link', '/prayer/a1000000-0000-4000-8000-0000000000f1',
       'dedupe_key', 'prayed:a1000000-0000-4000-8000-0000000000d1')))),
  0,
  'a re-run writes nothing twice, even if the batch were wrong (ADR 0022)');

-- The scan bound. A job dead for longer than the lookback loses what fell out of the
-- window, which is the trade named in the migration header and the reason the dead-man
-- check exists.
select is(
  (select count(*)::int from public.activity_notice_batch(
     :'anchor'::timestamptz + interval '30 days')
   where recipient_id = 'a1000000-0000-4000-8000-00000000000a'),
  0,
  'nothing older than the lookback is offered: the scan is bounded, by design');

-- ===========================================================================
-- 6. The indexes each arm's window depends on.
-- ===========================================================================

select is(
  (select count(*)::int from pg_indexes
   where schemaname = 'public'
     and indexname in ('glory_reactions_created_at_idx',
                       'prayer_intercessions_prayed_at_idx',
                       'testimonies_moderated_at_idx',
                       'prayers_moderated_at_idx')),
  4,
  'every arm scans a time window on a column that now has an index behind it');

select * from finish();
rollback;
