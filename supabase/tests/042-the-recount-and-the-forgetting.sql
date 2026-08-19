-- W3.4 slice 3: the nightly recount and the monthly forgetting (20260819160000).
--
-- Neither job sends anything, which is what makes them worth testing hard: nobody notices a
-- counter that is quietly wrong, and nobody notices data quietly kept past its window until
-- it matters a great deal.
--
-- The recount's assertions all take the same shape: break a counter the way the real world
-- breaks it, prove the job fixes it, prove a second run changes nothing. The purge's take
-- the opposite shape: prove it deletes what `20` promised, and prove it does NOT delete the
-- one thing this project decided to keep.
--
-- TRAP (see 019): never CALL a function the current role lacks EXECUTE on; the backend
-- segfaults. The ACL assertions read the catalogue and never probe by invoking.
--
-- TRAP (see 041's header): these functions act on LIVE STATE, so every count below is
-- scoped to this file's own fixtures rather than to the table.
begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

insert into auth.users (id, email) values
  ('95000000-0000-4000-8000-00000000000a', 'count-a@test.local'),
  ('95000000-0000-4000-8000-00000000000b', 'count-b@test.local');
insert into public.profiles
  (id, email, display_name, branch_id, role, onboarded_at, age_confirmed_at)
values
  ('95000000-0000-4000-8000-00000000000a', 'count-a@test.local', 'Count A',
   '00000000-0000-4000-8000-000000000001', 'member', now(), now()),
  ('95000000-0000-4000-8000-00000000000b', 'count-b@test.local', 'Count B',
   '00000000-0000-4000-8000-000000000001', 'member', now(), now());

insert into public.testimonies
  (id, author_id, branch_id, body, status, consent_version)
values
  ('95000000-0000-4000-8000-00000000a0a1', '95000000-0000-4000-8000-00000000000a',
   '00000000-0000-4000-8000-000000000001', 'recount fixture testimony', 'approved',
   'content-share-v1');
insert into public.prayers
  (id, author_id, branch_id, body, status, consent_version)
values
  ('95000000-0000-4000-8000-00000000a0b1', '95000000-0000-4000-8000-00000000000a',
   '00000000-0000-4000-8000-000000000001', 'recount fixture request', 'approved',
   'content-share-v1');

insert into public.glory_reactions (testimony_id, profile_id) values
  ('95000000-0000-4000-8000-00000000a0a1', '95000000-0000-4000-8000-00000000000a'),
  ('95000000-0000-4000-8000-00000000a0a1', '95000000-0000-4000-8000-00000000000b');
insert into public.prayer_intercessions (prayer_id, profile_id, state, prayed_at) values
  ('95000000-0000-4000-8000-00000000a0b1', '95000000-0000-4000-8000-00000000000a',
   'committed', null),
  ('95000000-0000-4000-8000-00000000a0b1', '95000000-0000-4000-8000-00000000000b',
   'prayed', now());

-- ===========================================================================
-- 1. The triggers were already right, which is the baseline the job defends.
-- ===========================================================================

select is(
  (select glory_count from public.testimonies
   where id = '95000000-0000-4000-8000-00000000a0a1'),
  2,
  'the counter triggers counted the two Glory taps');
select is(
  (select praying_count || '/' || prayed_count from public.prayers
   where id = '95000000-0000-4000-8000-00000000a0b1'),
  '1/1',
  'and the one committed, one fulfilled commitment');

-- ===========================================================================
-- 2. Drift, and the recount that answers it.
-- ===========================================================================

-- Exactly the shape `02` names: the reaction rows are the truth and the cached number is
-- not. A deletion cascade, a restored backup and a future bug all land here.
update public.testimonies set glory_count = 99
  where id = '95000000-0000-4000-8000-00000000a0a1';
update public.prayers set praying_count = 0, prayed_count = 7
  where id = '95000000-0000-4000-8000-00000000a0b1';

select is(
  (select sum(corrected)::int from public.reconcile_content_counters()
   where metric in ('testimony_glory', 'prayer_counts')) >= 2,
  true,
  'the recount corrects both drifted rows');

select is(
  (select glory_count from public.testimonies
   where id = '95000000-0000-4000-8000-00000000a0a1'),
  2,
  'glory_count is recomputed from the reactions, not adjusted towards them');
select is(
  (select praying_count || '/' || prayed_count from public.prayers
   where id = '95000000-0000-4000-8000-00000000a0b1'),
  '1/1',
  'and both prayer counters land on the truth in one pass');

-- Idempotence, which is the property that makes a nightly job safe to re-run by hand.
select is(
  (select sum(corrected)::int from public.reconcile_content_counters()),
  0,
  'a second run corrects nothing: it recomputes rather than adjusts');

-- A row with no reactions at all must go to zero rather than being skipped by the join.
insert into public.testimonies
  (id, author_id, branch_id, body, status, consent_version, glory_count)
values
  ('95000000-0000-4000-8000-00000000a0a2', '95000000-0000-4000-8000-00000000000a',
   '00000000-0000-4000-8000-000000000001', 'no reactions at all', 'approved',
   'content-share-v1', 4);
select is(
  (select sum(corrected)::int from public.reconcile_content_counters()),
  1,
  'a row whose reactions are all gone is corrected too, not left out by the join');
select is(
  (select glory_count from public.testimonies
   where id = '95000000-0000-4000-8000-00000000a0a2'),
  0,
  'down to zero, which is what a cascade actually leaves behind');

-- ===========================================================================
-- 3. What the recount must NOT disturb.
-- ===========================================================================

-- Drift the counter AND stamp updated_at somewhere unmistakable. It has to be done under
-- the counter_write flag, because the content guard rewrites updated_at to now() for any
-- other null-actor update, which is the very behaviour under test here. A plain `now()`
-- comparison would prove nothing: inside one transaction now() does not advance, so a
-- bumped updated_at and an untouched one are the same value.
select set_config('agbc.counter_write', 'on', true);
update public.testimonies
  set glory_count = 42, updated_at = '2020-01-01 00:00:00+00'
  where id = '95000000-0000-4000-8000-00000000a0a1';
select set_config('agbc.counter_write', 'off', true);

select lives_ok(
  $$select public.reconcile_content_counters()$$,
  'the recount runs against the content guards rather than being refused by them');

select is(
  (select glory_count from public.testimonies
   where id = '95000000-0000-4000-8000-00000000a0a1'),
  2,
  'the counter is corrected');

select is(
  (select updated_at from public.testimonies
   where id = '95000000-0000-4000-8000-00000000a0a1'),
  '2020-01-01 00:00:00+00'::timestamptz,
  'and updated_at is left exactly where it was: bumping it would expire every leader''s in-flight review token, nightly, for a number nobody edited');

select is(
  (select status from public.testimonies
   where id = '95000000-0000-4000-8000-00000000a0a1'),
  'approved'::public.content_status,
  'nothing but the counters is touched');

-- ===========================================================================
-- 4. The purge deletes what `20` promised.
-- ===========================================================================

insert into public.devices (id, profile_id, expo_push_token, platform, last_seen_at) values
  ('95000000-0000-4000-8000-0000000000d1', '95000000-0000-4000-8000-00000000000a',
   'ExponentPushToken[fresh]', 'android', now() - interval '30 days'),
  ('95000000-0000-4000-8000-0000000000d2', '95000000-0000-4000-8000-00000000000b',
   'ExponentPushToken[stale]', 'android', now() - interval '200 days');

insert into public.push_tickets (ticket_id, device_id, sent_at) values
  ('purge-recent', '95000000-0000-4000-8000-0000000000d1', now() - interval '2 days'),
  ('purge-old', '95000000-0000-4000-8000-0000000000d1', now() - interval '30 days');

insert into public.notifications
  (profile_id, type, template_key, params, deep_link, dedupe_key, created_at)
values
  ('95000000-0000-4000-8000-00000000000a', 'service_reminder', 'service.starts_soon',
   '{}'::jsonb, '/home', 'purge:recent', now() - interval '30 days'),
  ('95000000-0000-4000-8000-00000000000a', 'service_reminder', 'service.starts_soon',
   '{}'::jsonb, '/home', 'purge:ancient', now() - interval '400 days');

insert into public.reports (id, testimony_id, reporter_id, reason, status, created_at) values
  ('95000000-0000-4000-8000-00000000a0c1', '95000000-0000-4000-8000-00000000a0a1',
   '95000000-0000-4000-8000-00000000000b', 'settled and old', 'actioned',
   now() - interval '30 months'),
  ('95000000-0000-4000-8000-00000000a0c2', '95000000-0000-4000-8000-00000000a0a1',
   '95000000-0000-4000-8000-00000000000a', 'still open and old', 'open',
   now() - interval '30 months');

select lives_ok(
  $$select public.run_retention_purges()$$,
  'the purge runs');

select is(
  (select count(*)::int from public.notifications
   where dedupe_key = 'purge:ancient'),
  0,
  'a notification past 12 months is gone (docs/spec/20)');
select is(
  (select count(*)::int from public.notifications
   where dedupe_key = 'purge:recent'),
  1,
  'and one inside the window is untouched');

select is(
  (select count(*)::int from public.push_tickets where ticket_id = 'purge-old'),
  0,
  'a ticket past 7 days is gone: Expo cleared its receipt long ago');
select is(
  (select count(*)::int from public.push_tickets where ticket_id = 'purge-recent'),
  1,
  'and a recent one still waits for the sweep');

select is(
  (select count(*)::int from public.devices
   where id = '95000000-0000-4000-8000-0000000000d2'),
  0,
  'a device silent for 200 days is pruned; the token re-registers on next app open');
select is(
  (select count(*)::int from public.devices
   where id = '95000000-0000-4000-8000-0000000000d1'),
  1,
  'a device seen last month is not');

select is(
  (select count(*)::int from public.reports
   where id = '95000000-0000-4000-8000-00000000a0c1'),
  0,
  'a SETTLED report past 24 months is gone (docs/spec/20 retention)');

-- ===========================================================================
-- 5. The one thing it refuses to delete.
-- ===========================================================================

select is(
  (select count(*)::int from public.reports
   where id = '95000000-0000-4000-8000-00000000a0c2'),
  1,
  'an OPEN report past its window is KEPT: a process failure, not stale data');

select is(
  (select kept from public.run_retention_purges() where item = 'reports') >= 1,
  true,
  'and it is counted, so the job can say out loud that somebody must action it');

-- ===========================================================================
-- 6. The schedules, and who may run any of this.
-- ===========================================================================

select is(
  (select count(*)::int from cron.job
   where jobname in ('counter-reconcile', 'retention-purge')),
  2,
  'both jobs are scheduled exactly once each');
select is(
  (select schedule from cron.job where jobname = 'retention-purge'),
  '30 4 1 * *',
  'the purge is monthly, on the 1st (`21` §5)');
select is(
  (select command from cron.job where jobname = 'counter-reconcile'),
  'select jobs.invoke_edge_function(''counter-reconcile'')',
  'and both go through the vault-reading invoker (ADR 0016)');

select is(has_function_privilege('authenticated',
  'public.reconcile_content_counters()', 'execute'), false,
  'a member cannot rewrite the ministry''s counters');
select is(has_function_privilege('authenticated',
  'public.run_retention_purges()', 'execute'), false,
  'nor delete anybody''s history');

select * from finish();
rollback;
