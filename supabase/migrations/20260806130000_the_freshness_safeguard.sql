-- The freshness safeguard (W2.7 slice 5, docs/spec/09 §Freshness safeguard, `17` §1, `21` §5).
--
-- "Leaders are notified when items enter their queue; anything pending longer than 48h
-- escalates to admins. A quiet leader must never make a branch's feed look dead." Until now
-- that sentence had no mechanism: the queue tells a leader what is waiting only once they
-- open it, which is a notice you have to already be reading.
--
-- WHAT THIS ADDS, and what it deliberately does not.
--
-- It adds a LEDGER of what has already been said to whom, and two functions that answer
-- "what is there to say". It does NOT add a second definition of "a pending item": the batch
-- reads `moderation_queue`, whose own comment named this job as a caller when it was written,
-- and `daily_verse_depth()`, which the verses screen already draws from. One visible fact,
-- one owner: if the queue and the alert ever disagreed, a leader would be told about work
-- that is not there, or worse, not told about work that is.
--
-- WHY A LEDGER AND NOT `notifications` (decided with Ayo, 2026-08-06). `02` specs
-- `notifications` as the member's in-app centre, and W3.3 builds it with push. This audience
-- is STAFF and their surfaces are email and the dashboard: the app has no moderation screen
-- and is not getting one, so a notification row here would deep-link nowhere. There is also a
-- design question in `02` that W3.3 must answer deliberately rather than inherit half-solved:
-- that table is specced monthly-partitioned AND with a partial unique on `dedupe_key`, and
-- Postgres requires every unique constraint on a partitioned table to include the partition
-- key, so as written the two cannot both exist. Flagged there rather than fixed here.
--
-- WHY THE JOB SCANS RATHER THAN DRAINS AN OUTBOX. An outbox row written by a trigger is the
-- project's usual instinct (privileged_actions works exactly that way) and it is the wrong
-- shape here: a trigger that fails to fire is silence, and silence is the failure this whole
-- safeguard exists to prevent. A scan derives the work from the queue itself every hour, so a
-- missed tick, a restored backup or a re-pended post all come out right on the next run, and
-- recipients are resolved when the mail is sent rather than when the post arrived (a leader
-- appointed this morning hears about last night's queue; one demoted yesterday does not).
--
-- REPORTS ARE IN, alongside pending posts (decided with Ayo, 2026-08-06). `17` §1 names only
-- the queue, but both age the same way, W2.6 shipped reporting to members so the volume is
-- real, and an unread `is_safeguarding` report is the highest-stakes thing on the dashboard.

create table public.job_alerts (
  id uuid primary key default gen_random_uuid(),
  -- What was said. Stable internal state, so a CHECK rather than a lookup table (nothing
  -- here is product-facing or translatable).
  kind text not null constraint job_alerts_kind_known check (
    kind in ('queue_new', 'queue_overdue', 'report_new', 'report_overdue', 'verse_depth')
  ),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  -- What it was about: `testimony:<uuid>`, `prayer:<uuid>`, `report:<uuid>`, or the date for
  -- a verse-depth alert. Text rather than a nullable column per target, because this table
  -- exists to answer one question ("said already?") and never to join back.
  subject text not null,
  sent_at timestamptz not null default now()
);

-- The idempotency mechanism itself: the jobs write through ON CONFLICT DO NOTHING against
-- this index, so a tick that runs twice, or a run that crashes after sending and re-sends,
-- converges instead of duplicating. It also indexes the FK (leading column).
create unique index job_alerts_once
  on public.job_alerts (recipient_id, kind, subject);
create index job_alerts_sent_at_idx on public.job_alerts (sent_at);

alter table public.job_alerts enable row level security;
alter table public.job_alerts force row level security;

-- No policies, on purpose: no client reads or writes this, the jobs do, and they arrive as
-- service_role. Revoked BY NAME because Supabase's bootstrap grants ALL on new tables to
-- anon and authenticated directly, so `revoke from public` would look like a fence and be
-- none (the lesson from W2.7 slice 1, issue #96).
revoke all on public.job_alerts from anon, authenticated;

comment on table public.job_alerts is
  'What the scheduled jobs have already told whom (docs/spec/21 §5, W2.7 slice 5). Bookkeeping, not an inbox: no policies, no client access. Retention: rows are pruned by prune_job_alerts() once the thing they announced is settled, and cascade with the recipient profile so a GDPR erasure reaches them (docs/spec/16 reach table).';

/**
 * What is waiting, and who has not been told yet.
 *
 * One row per (recipient, alert kind, item). The caller groups them into one email per
 * recipient, which is why nothing here decides wording or cadence.
 *
 * SECURITY INVOKER, like every other read path in this project: called by the job as
 * service_role, which bypasses RLS, and revoked from every other role below. It joins
 * `profiles` for staff email addresses, so an authenticated caller must not be able to reach
 * it (their own RLS would return nothing, but that is a happy accident, not a fence).
 */
create function public.moderation_alert_batch(overdue_after interval default '48 hours')
returns table (
  recipient_id uuid,
  recipient_email text,
  recipient_name text,
  recipient_role public.profile_role,
  kind text,
  subject text,
  item_kind text,
  branch_id uuid,
  branch_name text,
  waiting_since timestamptz,
  is_safeguarding boolean
)
language sql
stable
as $function$
  with staff as (
    select p.id, p.email, p.display_name, p.role, p.branch_id
    from public.profiles p
    where p.deleted_at is null
      and p.role in ('leader', 'admin')
  ),
  admins as (
    select s.id, s.email, s.display_name, s.role from staff s where s.role = 'admin'
  ),
  -- Pending posts, from the one definition of the queue.
  items as (
    select q.id, q.kind as item_kind, q.branch_id, q.created_at, false as is_safeguarding
    from public.moderation_queue q
  ),
  -- Open reports, carrying the branch of the content they point at (reports have no branch
  -- of their own). A report whose content is gone drops out with the join.
  open_reports as (
    select
      r.id,
      'report' as item_kind,
      coalesce(t.branch_id, p.branch_id) as branch_id,
      r.created_at,
      r.is_safeguarding
    from public.reports r
    left join public.testimonies t on t.id = r.testimony_id and t.deleted_at is null
    left join public.prayers p on p.id = r.prayer_id and p.deleted_at is null
    where r.status = 'open'
      and coalesce(t.branch_id, p.branch_id) is not null
  ),
  work as (
    select id, item_kind, branch_id, created_at, is_safeguarding from items
    union all
    select id, item_kind, branch_id, created_at, is_safeguarding from open_reports
  ),
  -- Who answers for a branch: its own leaders, or every admin when it has none. The fallback
  -- is not a convenience, it is `02`'s archived-branch rule ("residual pending moderation
  -- escalates to admins immediately") and the same shape module 5 already uses for a
  -- branch-change request whose destination has no leader.
  branch_staff as (
    select b.id as branch_id, s.id as staff_id
    from public.branches b
    join staff s on s.role = 'leader' and s.branch_id = b.id
    union all
    select b.id, a.id
    from public.branches b
    cross join admins a
    where not exists (
      select 1 from staff l where l.role = 'leader' and l.branch_id = b.id
    )
  ),
  candidates as (
    select
      bs.staff_id as recipient,
      case when w.item_kind = 'report' then 'report_new' else 'queue_new' end as alert_kind,
      w.item_kind, w.id, w.branch_id, w.created_at, w.is_safeguarding
    from work w
    join branch_staff bs on bs.branch_id = w.branch_id

    union all

    -- The escalation. Admins moderate every branch already; what they lack is any signal
    -- that a branch has gone quiet, and this is it.
    select
      a.id,
      case when w.item_kind = 'report' then 'report_overdue' else 'queue_overdue' end,
      w.item_kind, w.id, w.branch_id, w.created_at, w.is_safeguarding
    from work w
    cross join admins a
    where w.created_at < now() - overdue_after
  )
  select
    c.recipient,
    s.email,
    s.display_name,
    s.role,
    c.alert_kind,
    c.item_kind || ':' || c.id::text,
    c.item_kind,
    c.branch_id,
    b.name,
    c.created_at,
    c.is_safeguarding
  from candidates c
  join staff s on s.id = c.recipient
  join public.branches b on b.id = c.branch_id
  where not exists (
    select 1
    from public.job_alerts j
    where j.recipient_id = c.recipient
      and j.kind = c.alert_kind
      and j.subject = c.item_kind || ':' || c.id::text
  )
  -- Oldest first, so a digest that is ever truncated keeps the item most at risk.
  order by c.created_at;
$function$;

comment on function public.moderation_alert_batch is
  'Pending posts and open reports nobody has been told about yet, one row per (recipient, kind, item): the branch''s moderators for everything waiting, every admin for anything past the 48h escalation (docs/spec/17 §1). Reads moderation_queue rather than redefining it.';

/**
 * Which admins to warn that the verse queue is running out, and about what.
 *
 * Depth comes from `daily_verse_depth()`, the same function the verses screen draws, so the
 * alert and the screen can never disagree about how deep a language is. The floor default
 * matches `21` §5 and `DEPTH_FLOOR` in the dashboard.
 *
 * One subject per DAY rather than per language: the job is daily, the email lists every
 * language below the floor, and a second language dropping later the same day does not earn
 * a second email.
 */
create function public.verse_alert_batch(floor_days integer default 14)
returns table (
  recipient_id uuid,
  recipient_email text,
  recipient_name text,
  subject text,
  language text,
  days_queued integer,
  runs_out_on date,
  stale_from date
)
language sql
stable
as $function$
  with low as (
    select d.language, d.days_queued, d.runs_out_on, d.stale_from
    from public.daily_verse_depth() d
    where d.days_queued <= floor_days
  ),
  admins as (
    select p.id, p.email, p.display_name
    from public.profiles p
    where p.deleted_at is null and p.role = 'admin'
  )
  select
    a.id,
    a.email,
    a.display_name,
    current_date::text,
    l.language,
    l.days_queued,
    l.runs_out_on,
    l.stale_from
  from low l
  cross join admins a
  where not exists (
    select 1
    from public.job_alerts j
    where j.recipient_id = a.id
      and j.kind = 'verse_depth'
      and j.subject = current_date::text
  )
  order by l.days_queued, l.language;
$function$;

comment on function public.verse_alert_batch is
  'Admins to warn that a language is at or below the daily-verse floor, with the depth numbers for the email (docs/spec/21 §5, 22 §1). Reads daily_verse_depth(), so it cannot disagree with the verses screen.';

/**
 * Record what was actually sent.
 *
 * Called AFTER delivery, never before: at-least-once is the right failure mode for a nudge
 * (a duplicate email is a nuisance, a swallowed safeguarding report is not). ON CONFLICT DO
 * NOTHING makes the retry harmless.
 */
create function public.record_job_alerts(alerts jsonb)
returns integer
language sql
volatile
as $function$
  with entries as (
    select
      (a ->> 'recipient_id')::uuid as recipient_id,
      a ->> 'kind' as kind,
      a ->> 'subject' as subject
    from jsonb_array_elements(coalesce(alerts, '[]'::jsonb)) a
  ),
  inserted as (
    insert into public.job_alerts (recipient_id, kind, subject)
    select recipient_id, kind, subject from entries
    on conflict (recipient_id, kind, subject) do nothing
    returning 1
  )
  select count(*)::integer from inserted;
$function$;

comment on function public.record_job_alerts is
  'Marks alerts as sent, idempotently (docs/spec/21 §5: every job is safe to re-run). Called after delivery, so a crash re-sends rather than swallows.';

/**
 * Forget what no longer needs saying.
 *
 * Run at the top of each moderation run, and it is what makes a RE-PENDED post announce
 * itself again: an author's edit to an approved post puts it back in the queue (`02`
 * invariant), and a ledger row from the first time round would silence the second. Deleting
 * once the item settles also keeps this table bounded by the size of the queue rather than by
 * the ministry's history, which is why it needs no retention job of its own.
 */
create function public.prune_job_alerts()
returns integer
language sql
volatile
as $function$
  with gone as (
    delete from public.job_alerts j
    where (
      j.kind in ('queue_new', 'queue_overdue')
      and not exists (
        select 1 from public.moderation_queue q
        where j.subject = q.kind || ':' || q.id::text
      )
    )
    or (
      j.kind in ('report_new', 'report_overdue')
      and not exists (
        select 1 from public.reports r
        where r.status = 'open' and j.subject = 'report:' || r.id::text
      )
    )
    -- Verse alerts announce a DAY rather than a row, so they have nothing to settle. A month
    -- is long enough to answer "did we warn anyone about this?" during an incident.
    or (j.kind = 'verse_depth' and j.sent_at < now() - interval '30 days')
    returning 1
  )
  select count(*)::integer from gone;
$function$;

comment on function public.prune_job_alerts is
  'Drops ledger rows whose item is no longer pending or whose report is closed, so a re-pended post is announced again and the table stays queue-sized (W2.7 slice 5).';

-- Service-role only, every one of them. Revoked BY NAME for the reason recorded in
-- 20260802140000: Supabase grants EXECUTE on new functions to anon, authenticated and
-- service_role directly, so revoking from PUBLIC alone leaves anon holding it.
revoke all on function public.moderation_alert_batch(interval)
  from public, anon, authenticated, service_role;
revoke all on function public.verse_alert_batch(integer)
  from public, anon, authenticated, service_role;
revoke all on function public.record_job_alerts(jsonb)
  from public, anon, authenticated, service_role;
revoke all on function public.prune_job_alerts()
  from public, anon, authenticated, service_role;

grant execute on function public.moderation_alert_batch(interval) to service_role;
grant execute on function public.verse_alert_batch(integer) to service_role;
grant execute on function public.record_job_alerts(jsonb) to service_role;
grant execute on function public.prune_job_alerts() to service_role;

-- --- the schedules -------------------------------------------------------------------------
--
-- Hourly for the moderation digest (decided with Ayo, 2026-08-06): near-real-time enough that
-- a Sunday morning post is seen within the hour, and gentle enough that a busy branch does not
-- turn a leader's inbox into something they filter away. It also shares Resend's free tier
-- with the OTP sign-in emails, which must never lose a slot to a nudge (`21` §9).
--
-- Off the top of the hour deliberately: nothing else in this project ticks at :00 yet, and
-- the habit is worth starting before W3.4 adds five more jobs.
--
-- cron.schedule() upserts by name, so re-running this migration on a database that already
-- has the job re-points it rather than duplicating it.
select cron.schedule(
  'moderation-alerts',
  '7 * * * *',
  $cron$select jobs.invoke_edge_function('moderation-alerts')$cron$
);

-- Daily, early enough that whoever owns the verse queue (`22` §1) can act on the same day.
select cron.schedule(
  'verse-monitor',
  '20 7 * * *',
  $cron$select jobs.invoke_edge_function('verse-monitor')$cron$
);
