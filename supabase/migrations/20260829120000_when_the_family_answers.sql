-- W3.6 slice 2: the notifications a member's own act earns, and the one the church sends
-- back (docs/spec/09 §Notifications, `15`'s tier table, `21` §5).
--
-- WHAT WAS MISSING, AND WHY IT WAS INVISIBLE. `09` promises exactly three things: "Your
-- testimony got Glory reactions. Someone prayed for your request. Your post was approved /
-- needs changes." Every part of all three was already built: the `type` values in
-- 20260816120000's CHECK, the channel and pref routing in `_shared/pushChannels.ts`, the
-- templates in four languages, the app's foreground rule, the notification centre's tint and
-- renderer, the i18n keys on both sides, and the two switches on NOTIF-PREFS. Everything
-- except a caller. Nothing in this repository ever wrote one of those rows.
--
-- So `prayer_activity` and `testimony_activity`, two of the five switches a member is shown,
-- gated nothing at all, and `09` line 82's "removed content disappears from public; author
-- notified with reason" never fired. `18`'s Phase 3 exit is "members get the right
-- notifications at the right scope", which cannot be true of a tier with no producer.
--
-- WHY NOBODY CAUGHT IT. This is the W3.4 shape again ("W3.3 built the push sender and never
-- built a caller"). W3.3 built the infrastructure, W3.4 owned SCHEDULED sends, W3.5 owned
-- BROADCAST and EVENT sends. A send triggered by ANOTHER MEMBER'S ACT is a fourth shape, and
-- no work item had claimed it.
--
-- WHY A JOB AND NOT A TRIGGER, which is the obvious alternative when the source is an INSERT
-- somebody just made. Three rules in this repo already answer it and they all point one way:
--   * ADR 0016's reason for making `event-notices` a job rather than firing it from the save:
--     "a trigger-fired call is silence when it fails", and this one's failure is a member who
--     believes nobody responded to what they shared;
--   * `21` §5's rule that a job "derives its work from live state rather than an outbox", and
--     a trigger that writes rows for a sweeper to push IS an outbox;
--   * ADR 0022's "the insert IS the claim on a send". A trigger can write the row but cannot
--     reach Expo, so a trigger-written row would claim a send that never happened.
-- All three sources are queryable from live state with no new columns, which is what makes
-- the job possible at all: `prayer_intercessions.prayed_at`, `glory_reactions.created_at`,
-- and each post's own `status` + `moderated_at`.
--
-- THE FOUR DECISIONS TAKEN WITH AYO (2026-08-29), each recorded on the arm it governs:
--   1. "Someone prayed for your request" fires on "I PRAYED", not on "I will pray": the
--      template is past tense and it should tell the truth. A commitment that is never
--      fulfilled notifies nobody, which is part of why the three nudges exist (W3.4).
--   2. Glory collapses per testimony per HOUR, not per day as `15` originally said. Per-day
--      both undercounts and silently drops: on a testimony that does well the author would
--      be told "3" while eight more people responded that she never hears about, which is
--      the opposite of what the notification exists to do. `15` is amended in this PR.
--   3. A removal notifies too, and it gets its OWN words rather than reusing "needs changes"
--      (see arm 3).
--   4. The settle window and the lookback are ARGUMENTS, so widening the hour costs a call
--      site rather than a migration.
--
-- THE PREF GATE LIVES HERE, IN THE BATCH SQL, on the column `15`'s tier table names, and
-- `allowedByPrefs` is deliberately not called by the job. That is W3.4's rule and its reason
-- holds: two gates on one fact are two owners, and they already disagree once in this
-- codebase (the `prayer` channel routes on `prayer_activity` while the reminder TIER gates on
-- `prayer_reminders`).
--
-- Rollback (roll forward, per the database standard): a compensating migration unschedules
-- the cron entry, drops this function and drops the four indexes. Nothing references it but
-- the edge function, and an unscheduled job is inert.

begin;

set local lock_timeout = '3s';

-- --- 1. the read paths this job needs ----------------------------------------------
--
-- Each arm scans a time window on a column that had no index, because until now nothing
-- ever asked these tables "what happened lately". Every one of them is the leading column
-- of its arm's WHERE clause (`~/.claude/standards/database.md`: index for the query
-- patterns you actually have).

create index if not exists glory_reactions_created_at_idx
  on public.glory_reactions (created_at desc);

create index if not exists prayer_intercessions_prayed_at_idx
  on public.prayer_intercessions (prayed_at desc)
  where prayed_at is not null;

create index if not exists testimonies_moderated_at_idx
  on public.testimonies (moderated_at desc)
  where moderated_at is not null;

create index if not exists prayers_moderated_at_idx
  on public.prayers (moderated_at desc)
  where moderated_at is not null;

-- --- 2. who is owed what ------------------------------------------------------------

/**
 * Everything a member's own post has earned since the last tick, in one shape.
 *
 * THE CLOCK IS AN ARGUMENT (W3.4's lesson, and the reason DST was testable from both sides
 * in August). So is the settle window and so is the lookback, per decision 4.
 *
 * TWO BOUNDS, DOING DIFFERENT JOBS. `p_lookback` bounds the SCAN, so a per-minute job never
 * walks the whole history of the church; the anti-join on `notifications.dedupe_key` is the
 * CURSOR, exactly as `event-notices` uses it, so a crashed run resumes by asking again. The
 * anti-join alone would be correct but unbounded, and the window alone would be bounded but
 * would re-offer the same rows every minute for a week. Note the anti-join is an
 * optimisation rather than the guarantee: `deliver_notifications` returns only the rows it
 * actually created (ADR 0022), so nothing can be pushed twice even if both bounds were wrong.
 *
 * The consequence of `p_lookback` worth naming: a job that has been dead for longer than the
 * window loses the notifications inside it. That is the right trade at one minute a tick, and
 * the dead-man check exists so it never gets near seven days.
 *
 * SECURITY DEFINER with a pinned search_path, granted to service_role alone, matching every
 * other batch function in this domain. It reads across every member's posts by definition,
 * so it must never be reachable from a member's token.
 */
create function public.activity_notice_batch(
  p_now timestamptz default now(),
  p_settle interval default interval '15 minutes',
  p_lookback interval default interval '7 days'
)
returns table (
  kind text,
  recipient_id uuid,
  subject_id uuid,
  subject_kind text,
  detail text,
  tally integer,
  dedupe_key text
)
language sql
stable
security definer
set search_path = ''
as $function$
  -- ARM 1: someone prayed for your request.
  --
  -- Decision 1: the trigger is `state = 'prayed'`, the FULFILMENT, not the commitment. One
  -- notification per intercession, so a member praying for the same request cannot ring the
  -- author twice (the state transition is one-way and trigger-enforced, 20260720220000).
  --
  -- The payload this feeds carries NO params at all: not the request, not a word of it, and
  -- not who prayed. `15`'s payload rule, and the same treatment the prayer nudge already
  -- gets.
  select
    'prayed'::text,
    pr.author_id,
    pr.id,
    null::text,
    null::text,
    null::integer,
    'prayed:' || pi.id::text
  from public.prayer_intercessions pi
  join public.prayers pr on pr.id = pi.prayer_id
  join public.profiles author
    on author.id = pr.author_id
    and author.deleted_at is null
  left join public.notification_prefs np on np.profile_id = pr.author_id
  where pi.state = 'prayed'
    and pi.prayed_at is not null
    and pi.prayed_at > p_now - p_lookback
    and pi.prayed_at <= p_now
    -- Never tell you about your own act. Praying for your own request is allowed and is
    -- not news.
    and pi.profile_id <> pr.author_id
    -- A request that is gone, or was never published, has nothing to report.
    and pr.deleted_at is null
    and pr.status = 'approved'
    and coalesce(np.prayer_activity, true)
    -- `15`: activity is suppressed across a block in EITHER direction. There is
    -- deliberately no is_blocked_with() helper in this schema (20260720220000 line 108),
    -- so the clause is written out here as it is everywhere else.
    and not exists (
      select 1 from public.blocked_users bu
      where (bu.blocker_id = pr.author_id and bu.blocked_id = pi.profile_id)
         or (bu.blocker_id = pi.profile_id and bu.blocked_id = pr.author_id)
    )
    and not exists (
      select 1 from public.notifications n
      where n.profile_id = pr.author_id
        and n.dedupe_key = 'prayed:' || pi.id::text
    )

  union all

  -- ARM 2: N people said Glory on your testimony.
  --
  -- Decision 2: the collapse is per testimony per HOUR. The bucket is a UTC hour rather than
  -- a branch-local one deliberately: this is a rate limit on how often one testimony may
  -- ring its author, not a time anybody reads, and the branch-local machinery exists for the
  -- reminders that ARE a wall clock.
  --
  -- WHEN A BUCKET IS DUE is the interesting part. `p_now >= least(end of the hour, newest
  -- reaction + settle)`: the burst is sent once it has been quiet for the settle window, and
  -- at the hour boundary at the latest. So the common case (a cluster right after approval,
  -- when the testimony is top of the feed) is ONE notification carrying the true size of the
  -- cluster, and the worst case is bounded at an hour. A reaction arriving after its bucket
  -- has been sent falls into the next bucket and gets its own notification, which is the
  -- whole reason per-hour was chosen over per-day: nothing is silently dropped.
  --
  -- The block and self checks live INSIDE the aggregation, so a blocked member's reaction
  -- cannot inflate a count the author is then told about.
  select
    'glory'::text,
    t.author_id,
    t.id,
    null::text,
    null::text,
    gb.tally,
    'glory:' || t.id::text || ':' || to_char(gb.bucket, 'YYYY-MM-DD"T"HH24')
  from (
    select
      g.testimony_id,
      date_trunc('hour', g.created_at at time zone 'UTC') as bucket,
      count(*)::integer as tally,
      max(g.created_at) as newest
    from public.glory_reactions g
    join public.testimonies gt on gt.id = g.testimony_id
    where g.created_at > p_now - p_lookback
      and g.created_at <= p_now
      and g.profile_id <> gt.author_id
      and not exists (
        select 1 from public.blocked_users bu
        where (bu.blocker_id = gt.author_id and bu.blocked_id = g.profile_id)
           or (bu.blocker_id = g.profile_id and bu.blocked_id = gt.author_id)
      )
    group by g.testimony_id, date_trunc('hour', g.created_at at time zone 'UTC')
  ) gb
  join public.testimonies t on t.id = gb.testimony_id
  join public.profiles author
    on author.id = t.author_id
    and author.deleted_at is null
  left join public.notification_prefs np on np.profile_id = t.author_id
  where p_now >= least(
      (gb.bucket + interval '1 hour') at time zone 'UTC',
      gb.newest + p_settle
    )
    and t.deleted_at is null
    and t.status = 'approved'
    and coalesce(np.testimony_activity, true)
    and not exists (
      select 1 from public.notifications n
      where n.profile_id = t.author_id
        and n.dedupe_key =
          'glory:' || t.id::text || ':' || to_char(gb.bucket, 'YYYY-MM-DD"T"HH24')
    )

  union all

  -- ARM 3: a leader decided about your post.
  --
  -- TRANSACTIONAL, so no pref gate and no block check: this is the church answering
  -- something the member themselves did, not activity between two members. `15` puts it on
  -- the `transactional` channel, which has no pref key at all.
  --
  -- The key carries `moderated_at`, which is what makes the edit loop work: `09`'s rule is
  -- that any edit to an approved post resets it to pending, so a re-approval is a NEW
  -- decision the author must hear about, and it mints a new key rather than being swallowed
  -- as a duplicate of the first approval.
  --
  -- `detail` carries the status and the edge function picks the words from it. Three
  -- outcomes, three templates, and the third one is new in this slice: a REMOVAL must not
  -- reuse "needs changes". `MyPostCard.tsx` states the product rule in a comment ("rejected
  -- is a conversation the author can answer, removed is not"), so telling a member whose
  -- post was taken down after review to go and edit it would send them to do the one thing
  -- that must not happen. What the removal says instead is what MY-POSTS already says on the
  -- screen it links to, in all four languages: it happened, and your branch leader can talk
  -- to you about it. The private `moderation_note` is never disclosed and never will be
  -- (20260803140000: it is a column privilege, not a policy, precisely because the author
  -- may read their own row).
  select
    'moderation'::text,
    m.author_id,
    m.id,
    m.subject_kind,
    m.status::text,
    null::integer,
    'moderation:' || m.subject_kind || ':' || m.id::text || ':'
      || to_char(m.moderated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')
  from (
    select id, author_id, status, moderated_at, deleted_at, 'testimony'::text as subject_kind
    from public.testimonies
    union all
    select id, author_id, status, moderated_at, deleted_at, 'prayer'::text
    from public.prayers
  ) m
  join public.profiles author
    on author.id = m.author_id
    and author.deleted_at is null
  where m.moderated_at is not null
    and m.moderated_at > p_now - p_lookback
    and m.moderated_at <= p_now
    -- `pending` is excluded, which is what makes the edit loop quiet: an edit resets the
    -- status without clearing `moderated_at`, and the author already knows they just edited.
    and m.status in ('approved', 'rejected', 'removed')
    and m.deleted_at is null
    and not exists (
      select 1 from public.notifications n
      where n.profile_id = m.author_id
        and n.dedupe_key =
          'moderation:' || m.subject_kind || ':' || m.id::text || ':'
            || to_char(m.moderated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')
    );
$function$;

revoke all on function public.activity_notice_batch(timestamptz, interval, interval)
  from public, anon, authenticated, service_role;
grant execute on function public.activity_notice_batch(timestamptz, interval, interval)
  to service_role;

comment on function public.activity_notice_batch is
  'The three notifications a member earns from their own posts (docs/spec/09 §Notifications, `15`): someone prayed for a request, Glory collapsed per testimony per hour, and a leader''s decision. Prefs gate the first two on the columns `15` names and blocks suppress them in either direction; the third is transactional and does neither. The scan is bounded by p_lookback and the claim is the anti-join on notifications.dedupe_key, so a crashed run resumes by asking again.';

-- --- 3. the schedule ---------------------------------------------------------------
--
-- Every minute, the same cadence as `event-notices` and `broadcast-fanout`, because two of
-- the three arms want promptness (a decision the member is waiting on, and a response to
-- something they shared) and the third paces itself with its own settle window. Most ticks
-- do nothing, which is the normal shape of every job in `21` §5.
--
-- cron.schedule() upserts by name (see 20260806130000), so re-running this migration
-- re-points the job rather than duplicating it. An environment whose vault is empty raises
-- a NOTICE and does nothing (ADR 0016), so `supabase db reset` and CI stay silent.
select cron.schedule(
  'activity-notices',
  '* * * * *',
  $cron$select jobs.invoke_edge_function('activity-notices')$cron$
);

commit;
