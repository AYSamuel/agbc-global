-- #164 slice 1b: the member is told that somebody attached their registration.
--
-- `registration.confirmed` is the FOURTH orphaned template the W3.6 exit audit found: it has
-- existed in four languages, with channel routing and an app-side string, and has never once
-- been produced. W3.6 gave the first three their producer and wrote down why the shape was
-- always a job arm rather than a write at the call site; this adds the fourth to the same
-- function for the same reasons, which are restated beside the arm itself.
--
-- Nothing else here needed changing, which is worth recording: `notifications_type_known`
-- already admits 'registration', `_shared/pushChannels.ts` already routes it to the
-- transactional channel with no pref key, and `/course` is already a dynamic prefix on the
-- app's deep-link allowlist. The template was the only thing that was ever missing a caller.
--
-- The whole function is restated because `create or replace` cannot patch one arm. It is
-- reproduced from `20260829120000` unchanged except for the new arm and this comment, so a
-- diff of the two files shows exactly what moved.

begin;

set local lock_timeout = '3s';

-- Every arm scans a bounded time window, and `051` §6 asserts each one has an index behind
-- the column it scans. This arm scans `linked_at` every minute; partial on the one
-- link_method it cares about, because the other three never produce a row here.
create index course_registrations_linked_at_idx
  on public.course_registrations (linked_at)
  where link_method = 'leader';

create or replace function public.activity_notice_batch(
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
    )

  union all

  -- ARM 4: the registration an admin attached to you by hand (#164).
  --
  -- TRANSACTIONAL, like arm 3 and for the same reason: this answers something the member
  -- themselves did (they paid on the website, and then asked us why it had not appeared), so
  -- `15` puts it on the `transactional` channel, which has no pref key. No block check
  -- either: there is no second member in this, only the church answering.
  --
  -- WHY AN ARM AND NOT A WRITE INSIDE `link_registration`. Every reason W3.6 slice 2 wrote
  -- down applies unchanged. ADR 0016: a notification written by the routine is a
  -- trigger-fired send, and when it fails it fails silently inside somebody's link. `21` §5:
  -- derive the work from live state, never from an outbox. ADR 0022: the insert IS the claim
  -- on a send, and it belongs to `deliver_notifications`, which is the only door. So the
  -- routine changes the row, and this arm notices that it changed.
  --
  -- ONLY `link_method = 'leader'`, which is the narrow case this is for. The other three ways
  -- a registration gains an owner already tell the member by happening in front of them:
  -- `handoff` and `self` are acts they just performed with the app in their hand, and
  -- `email_auto` matches at the moment they sign in. This arm exists for the one path where
  -- somebody ELSE acted, minutes or days later, and the member has no way to know.
  --
  -- `subject_id` is the REGISTRATION and `detail` carries the course, because the course is
  -- where the tap lands and it can legitimately be null: `course_id` is resolved from the
  -- website's slug at insert time, so a registration for something not in our catalogue has
  -- none. The edge function sends those to the Academy index rather than to `/course/null`.
  --
  -- The key carries `linked_at`, so a relink after an unlink correctly tells the member
  -- again instead of being swallowed as a duplicate of the first link.
  select
    'registration'::text,
    r.profile_id,
    r.id,
    null::text,
    r.course_id::text,
    null::integer,
    'registration:' || r.id::text || ':'
      || to_char(r.linked_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')
  from public.course_registrations r
  join public.profiles member
    on member.id = r.profile_id
    and member.deleted_at is null
  where r.profile_id is not null
    and r.link_method = 'leader'
    and r.linked_at is not null
    and r.linked_at > p_now - p_lookback
    and r.linked_at <= p_now
    and not exists (
      select 1 from public.notifications n
      where n.profile_id = r.profile_id
        and n.dedupe_key =
          'registration:' || r.id::text || ':'
            || to_char(r.linked_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')
    );
$function$;

comment on function public.activity_notice_batch is
  'The four notifications a member earns from their own posts and payments (docs/spec/09 §Notifications, `15`): someone prayed for a request, Glory collapsed per testimony per hour, a leader''s decision, and a registration an admin linked by hand (#164). Prefs gate the first two on the columns `15` names and blocks suppress them in either direction; the last two are transactional and do neither.';

commit;
