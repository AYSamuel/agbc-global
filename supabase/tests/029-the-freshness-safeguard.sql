-- The freshness safeguard (W2.7 slice 5, migrations 20260806120000 + 20260806130000).
--
-- Three properties carry this slice, and every assertion below is one of them:
--
--  1. The right people are told. A branch's own moderators hear about its queue, another
--     branch's leader never does, and admins hear about anything past 48h or about a branch
--     with nobody to answer for it.
--  2. Re-running is safe. `21` §5 asks every job to be idempotent and says so as a property
--     to assert rather than to assume, so the batch is asked twice around a recording, and
--     the crash-after-sending case is recorded twice on purpose.
--  3. Nobody but the job can reach any of it. These functions read staff email addresses out
--     of `profiles`, and the ledger is bookkeeping no client has business seeing.
--
-- Privileges are asserted with has_function_privilege and never by attempting a call: calling
-- a function you lack EXECUTE on takes the whole backend down on this local stack (recorded
-- 2026-07-27), which fails the run in a way that looks nothing like a failed test.
--
-- The seed data is left alone rather than worked around: it has one pending prayer in
-- Ogbomosho and one leader in Glasgow, so every count below is scoped to this file's own
-- subjects and recipients, or captured from the batch itself.

begin;
create extension if not exists pgtap with schema extensions;
select plan(37);

\set glasgow '00000000-0000-4000-8000-000000000001'
\set berlin '00000000-0000-4000-8000-000000000002'
\set emmen '00000000-0000-4000-8000-000000000003'

\set admin '90000000-0000-4000-8000-0000000000a1'
\set berlin_lead '90000000-0000-4000-8000-0000000000b1'
\set glasgow_lead '90000000-0000-4000-8000-0000000000b2'
\set gone_lead '90000000-0000-4000-8000-0000000000b3'
\set member1 '90000000-0000-4000-8000-0000000000c1'
\set member2 '90000000-0000-4000-8000-0000000000c2'

\set fresh_berlin '91000000-0000-4000-8000-000000000001'
\set fresh_emmen '91000000-0000-4000-8000-000000000002'
\set old_berlin '91000000-0000-4000-8000-000000000003'
\set reported '91000000-0000-4000-8000-000000000004'
\set gone '91000000-0000-4000-8000-000000000006'

\set fresh_report '92000000-0000-4000-8000-000000000001'
\set old_report '92000000-0000-4000-8000-000000000002'
\set orphan_report '92000000-0000-4000-8000-000000000003'

insert into auth.users (id, email) values
  (:'admin', 't029-admin@test.local'),
  (:'berlin_lead', 't029-berlin-lead@test.local'),
  (:'glasgow_lead', 't029-glasgow-lead@test.local'),
  (:'gone_lead', 't029-gone-lead@test.local'),
  (:'member1', 't029-member1@test.local'),
  (:'member2', 't029-member2@test.local');

insert into public.profiles (id, email, display_name, branch_id, role, onboarded_at, deleted_at)
values
  (:'admin', 't029-admin@test.local', 'T029 Admin', :'glasgow', 'admin', now(), null),
  (:'berlin_lead', 't029-berlin-lead@test.local', 'T029 Berlin Lead', :'berlin', 'leader',
   now(), null),
  (:'glasgow_lead', 't029-glasgow-lead@test.local', 'T029 Glasgow Lead', :'glasgow', 'leader',
   now(), null),
  -- A leader whose account is gone. Still role=leader, still branch Berlin, and must never
  -- be mailed again.
  (:'gone_lead', 't029-gone-lead@test.local', 'T029 Departed Lead', :'berlin', 'leader',
   now(), now()),
  (:'member1', 't029-member1@test.local', 'T029 Member One', :'berlin', 'member', now(), null),
  (:'member2', 't029-member2@test.local', 'T029 Member Two', :'berlin', 'member', now(), null);

-- Berlin has a leader; Emmen deliberately does not.
insert into public.testimonies
  (id, author_id, branch_id, body, language, status, consent_version, created_at)
values
  (:'fresh_berlin', :'member1', :'berlin', 'Waiting in Berlin', 'en', 'pending',
   'content-share-v1', now()),
  (:'fresh_emmen', :'member1', :'emmen', 'Waiting in Emmen, where nobody is leader', 'en',
   'pending', 'content-share-v1', now()),
  (:'old_berlin', :'member1', :'berlin', 'Waiting since Sunday', 'en', 'pending',
   'content-share-v1', now() - interval '3 days'),
  (:'reported', :'member1', :'berlin', 'Approved, then flagged', 'en', 'pending',
   'content-share-v1', now() - interval '5 days'),
  (:'gone', :'member1', :'berlin', 'Flagged, then taken down by its author', 'en', 'pending',
   'content-share-v1', now() - interval '5 days');

-- auth.uid() is null here, so the update guard passes these straight through (it refuses a
-- moderation change by a real caller who cannot moderate the branch; that is 017's subject).
update public.testimonies set status = 'approved' where id in (:'reported', :'gone');
update public.testimonies set deleted_at = now() where id = :'gone';

insert into public.reports
  (id, testimony_id, reporter_id, reason, status, is_safeguarding, created_at)
values
  (:'fresh_report', :'reported', :'member1', 'at_risk', 'open', true, now()),
  (:'old_report', :'reported', :'member2', 'hurtful', 'open', false, now() - interval '4 days'),
  (:'orphan_report', :'gone', :'member1', 'hurtful', 'open', false, now());

-- --- 1. nobody but the job can reach any of this -------------------------------------------

select ok(
  (select relforcerowsecurity from pg_class where oid = 'public.job_alerts'::regclass),
  'job_alerts forces row level security');

select is(
  (select count(*)::int from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'job_alerts'
      and grantee in ('anon', 'authenticated')),
  0, 'neither anon nor authenticated holds any privilege on the ledger');

select is(
  (select count(*)::int
     from unnest(array[
       'public.moderation_alert_batch(interval)',
       'public.verse_alert_batch(integer)',
       'public.record_job_alerts(jsonb)',
       'public.prune_job_alerts()'
     ]) as f(signature)
     cross join unnest(array['anon', 'authenticated']) as r(who)
    where has_function_privilege(r.who, f.signature, 'EXECUTE')),
  0, 'no client role may execute any of the job functions');

select is(
  (select count(*)::int
     from unnest(array[
       'public.moderation_alert_batch(interval)',
       'public.verse_alert_batch(integer)',
       'public.record_job_alerts(jsonb)',
       'public.prune_job_alerts()'
     ]) as f(signature)
    where has_function_privilege('service_role', f.signature, 'EXECUTE')),
  4, 'the job itself may execute all four');

-- The invoker is the one function that can read the vault, so it is granted to nobody:
-- pg_cron runs it as the role that scheduled it.
select is(
  (select count(*)::int from unnest(array['anon', 'authenticated', 'service_role']) as r(who)
    where has_function_privilege(r.who, 'jobs.invoke_edge_function(text)', 'EXECUTE')
       or has_schema_privilege(r.who, 'jobs', 'USAGE')),
  0, 'no client role reaches the jobs schema or its edge-function invoker');

select ok(
  (select relforcerowsecurity from pg_class where oid = 'public.job_leases'::regclass)
  and not exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'job_leases'
      and grantee in ('anon', 'authenticated')),
  'job_leases forces RLS and is out of every client role''s reach');

select is(
  (select count(*)::int from unnest(array['anon', 'authenticated']) as r(who)
    where has_function_privilege(r.who, 'public.claim_job_lease(text, interval)', 'EXECUTE')
       or has_function_privilege(r.who, 'public.release_job_lease(text)', 'EXECUTE')),
  0, 'and no client role may take or drop a lease');

-- --- 2. two runs cannot overlap -------------------------------------------------------------
--
-- The failure this prevents is a slow run meeting the next tick and mailing every leader
-- twice. Once W3.4 puts push behind the same pattern, the same overlap reaches phones.

select ok(
  public.claim_job_lease('t029-job', '15 minutes'),
  'the first run of a job takes the lease');

select ok(
  not public.claim_job_lease('t029-job', '15 minutes'),
  'and a second run, arriving while it works, is told to leave it alone');

-- A finished run gives the lease back, so "run it again now" works during an incident and on
-- a laptop, instead of being refused until the window happens to expire.
do $$ begin perform public.release_job_lease('t029-job'); end $$;
select ok(
  public.claim_job_lease('t029-job', '15 minutes'),
  'and once the first run releases it, the next one may start immediately');

-- The expiry is the net under a run that DIED holding it: nothing releases that one.
update public.job_leases set leased_until = now() - interval '1 minute'
  where job = 't029-job';
select ok(
  public.claim_job_lease('t029-job', '15 minutes'),
  'an expired lease is free again, so a crashed run does not wedge the job shut');

-- --- 3. the schedules exist ----------------------------------------------------------------

select is(
  (select count(*)::int from cron.job
    where jobname in ('moderation-alerts', 'verse-monitor') and active),
  2, 'both jobs are registered with pg_cron and active');

select is(
  (select count(*)::int from cron.job
    where jobname = 'moderation-alerts' and schedule = '7 * * * *'
      and command like '%invoke_edge_function(''moderation-alerts'')%'),
  1, 'the moderation digest runs hourly and calls its own function');

-- --- 4. the right people are told ----------------------------------------------------------

select is(
  (select count(*) from public.moderation_alert_batch()
    where recipient_email = 't029-berlin-lead@test.local'
      and kind = 'queue_new' and subject = 'testimony:' || :'fresh_berlin'),
  1::bigint, 'the branch''s own leader is offered its waiting post');

select is(
  (select count(*) from public.moderation_alert_batch()
    where recipient_email = 't029-glasgow-lead@test.local'
      and subject = 'testimony:' || :'fresh_berlin'),
  0::bigint, 'another branch''s leader hears nothing about it');

select is(
  (select count(*) from public.moderation_alert_batch()
    where recipient_email = 't029-admin@test.local'
      and subject = 'testimony:' || :'fresh_berlin'),
  0::bigint, 'and neither does an admin, while the branch has someone to answer for it');

select is(
  (select count(*) from public.moderation_alert_batch()
    where recipient_email = 't029-gone-lead@test.local'),
  0::bigint, 'a leader whose account is deleted is never mailed again');

select is(
  (select count(*) from public.moderation_alert_batch()
    where recipient_email = 't029-admin@test.local'
      and kind = 'queue_new' and subject = 'testimony:' || :'fresh_emmen'),
  1::bigint, 'a branch with no leader falls back to the admins straight away');

select is(
  (select count(*) from public.moderation_alert_batch()
    where recipient_email = 't029-admin@test.local'
      and kind = 'queue_overdue' and subject = 'testimony:' || :'old_berlin'),
  1::bigint, 'anything waiting longer than 48h escalates to an admin');

select is(
  (select count(*) from public.moderation_alert_batch()
    where kind = 'queue_overdue' and subject = 'testimony:' || :'fresh_berlin'),
  0::bigint, 'while this morning''s post escalates to nobody');

select is(
  (select count(*) from public.moderation_alert_batch()
    where recipient_email = 't029-berlin-lead@test.local'
      and kind = 'queue_new' and subject = 'testimony:' || :'old_berlin'),
  1::bigint, 'escalating does not take the item away from its own leader');

select is(
  (select count(*) from public.moderation_alert_batch()
    where recipient_email = 't029-berlin-lead@test.local'
      and kind = 'report_new' and subject = 'report:' || :'fresh_report'
      and is_safeguarding),
  1::bigint, 'an open report reaches the branch''s leader, flagged as safeguarding');

select is(
  (select count(*) from public.moderation_alert_batch()
    where recipient_email = 't029-admin@test.local'
      and kind = 'report_overdue' and subject = 'report:' || :'old_report'),
  1::bigint, 'a report nobody has answered for four days escalates too');

select is(
  (select count(*) from public.moderation_alert_batch()
    where subject = 'report:' || :'orphan_report'),
  0::bigint, 'a report whose content the author has deleted is nobody''s work');

-- A pending post that its author deletes leaves the queue, and the alert with it.
update public.testimonies set deleted_at = now() where id = :'fresh_emmen';
select is(
  (select count(*) from public.moderation_alert_batch()
    where subject = 'testimony:' || :'fresh_emmen'),
  0::bigint, 'a deleted pending post is not announced to anyone');
update public.testimonies set deleted_at = null where id = :'fresh_emmen';

-- --- 5. running it twice says nothing twice ------------------------------------------------
--
-- Captured first, because recording it empties it: comparing the return value against a
-- second call of the batch would be comparing it against zero.

create temporary table t029_batch on commit drop as
  select * from public.moderation_alert_batch();

select is(
  public.record_job_alerts(
    (select coalesce(jsonb_agg(jsonb_build_object(
       'recipient_id', b.recipient_id, 'kind', b.kind, 'subject', b.subject)), '[]'::jsonb)
     from t029_batch b)),
  (select count(*)::int from t029_batch),
  'recording the batch writes exactly one ledger row per alert');

select is(
  (select count(*) from public.moderation_alert_batch()),
  0::bigint, 'and the next run has nothing left to say');

-- The crash case: the job sent the mail, then died before recording. It re-sends on the next
-- tick, and the ledger absorbs the repeat rather than growing a duplicate.
select is(
  public.record_job_alerts(jsonb_build_array(jsonb_build_object(
    'recipient_id', :'berlin_lead', 'kind', 'queue_new',
    'subject', 'testimony:' || :'fresh_berlin'))),
  0, 'recording the same alert again writes nothing');

-- --- 6. a post that comes back is announced again -------------------------------------------

update public.testimonies set status = 'approved' where id = :'fresh_berlin';
do $$ begin perform public.prune_job_alerts(); end $$;

select is(
  (select count(*)::int from public.job_alerts
    where subject = 'testimony:' || :'fresh_berlin'),
  0, 'settling an item drops the ledger rows that announced it');

-- Scoped to THIS file's recipients, not to every row carrying that subject. The dashboard's
-- own tests mint staff accounts on the local stack that cannot always be deleted afterwards
-- (callers.ts records why: a caller who was ever granted a role is held by the append-only
-- audit trigger), so `pnpm test` before `supabase test db` leaves a database with a dozen
-- admins in it. Counting every escalation row was green in CI and red on this laptop.
select is(
  (select count(*)::int
     from public.job_alerts j
     join public.profiles p on p.id = j.recipient_id
    where j.subject = 'testimony:' || :'old_berlin'
      and p.email like 't029-%'),
  2, 'and leaves the ones for items still waiting (its leader''s and the escalation)');

-- An author's edit re-pends an approved post (`02` invariant). Without the prune above, the
-- leader would never be told, because the ledger would still say they had been.
update public.testimonies set status = 'pending' where id = :'fresh_berlin';
select is(
  (select count(*) from public.moderation_alert_batch()
    where recipient_email = 't029-berlin-lead@test.local'
      and kind = 'queue_new' and subject = 'testimony:' || :'fresh_berlin'),
  1::bigint, 'a re-pended post is announced again');

-- --- 7. the verse queue ---------------------------------------------------------------------
--
-- The dev seeds stock English about eighty days deep and leave German, Dutch and French at
-- zero (measured 2026-08-02, and 026 relies on the same asymmetry), which is exactly the
-- shape this alert exists for: one language starving behind a healthy one.

select is(
  (select count(*) from public.verse_alert_batch(14) where language = 'de'),
  -- Every admin who has not been told today, which on a fresh database is every admin. Said
  -- that way for the same reason as the scoped count above: a local stack where the job has
  -- already run today is a database with some of them ledgered, and the claim is about who is
  -- warned, not about how many admins happen to exist.
  (select count(*) from public.profiles p
    where p.role = 'admin' and p.deleted_at is null
      and not exists (
        select 1 from public.job_alerts j
        where j.recipient_id = p.id and j.kind = 'verse_depth'
          and j.subject = current_date::text)),
  'every admin who has not already been told today is warned about the starved language');

select is(
  (select count(*) from public.verse_alert_batch(14) where language = 'en'),
  0::bigint, 'and none of them is bothered about the healthy one');

create temporary table t029_verses on commit drop as
  select distinct recipient_id, subject from public.verse_alert_batch(14);

select is(
  public.record_job_alerts(
    (select coalesce(jsonb_agg(jsonb_build_object(
       'recipient_id', v.recipient_id, 'kind', 'verse_depth', 'subject', v.subject)), '[]'::jsonb)
     from t029_verses v)),
  (select count(*)::int from t029_verses),
  'one ledger row per admin per day, however many languages are low');

select is(
  (select count(*) from public.verse_alert_batch(14)),
  0::bigint, 'a second run the same day says nothing');

-- Verse alerts announce a DAY rather than a row, so there is nothing to settle: they age out.
insert into public.job_alerts (recipient_id, kind, subject, sent_at)
values (:'admin', 'verse_depth', '2020-01-01', now() - interval '40 days');
do $$ begin perform public.prune_job_alerts(); end $$;

select is(
  (select count(*)::int from public.job_alerts
    where kind = 'verse_depth' and subject = '2020-01-01'),
  0, 'a verse alert older than thirty days is pruned');

select is(
  (select count(*) from public.job_alerts
    where kind = 'verse_depth' and subject = current_date::text),
  (select count(*) from public.profiles where role = 'admin' and deleted_at is null),
  'while today''s are kept');

select * from finish();
rollback;
