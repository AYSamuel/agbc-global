-- W3.4 slice 2: the promise you made to an event, and the one you made to a person
-- (docs/spec/15 tiers, `09` §Prayer commitment, `11`, `21` §5, ADR 0016).
--
-- Both jobs ride the seam from slice 1, so this migration is only ever answering "who is
-- due". Two things in it are new decisions rather than new plumbing.
--
-- 1. THE PRAYER CADENCE FINALLY HAS NUMBERS. `09` has said "gentle cadence with a hard cap"
--    since the spec was written and never said how gentle: `prayer_intercessions` shipped
--    with `next_reminder_at` and `reminder_count` in July and a comment saying NULL means
--    "not enrolled, which is where every row starts until that job lands". This is that job.
--    Decided with Ayo 2026-08-19: DAY 1, DAY 3, DAY 7, then stop. Three nudges over a week
--    is long enough to read as sustained intercession and short enough that nobody is being
--    asked about a request from last month.
--
--    THE CLOCK IS ANCHORED TO `committed_at`, NEVER TO THE LAST SEND. A cadence measured
--    from the previous nudge drifts every time one is held back, and the quiet-hours rule
--    below holds nudges back by design, so the two together would walk the third reminder
--    into the following week. Anchored, a delayed nudge costs its own delay and nothing
--    after it.
--
-- 2. QUIET HOURS, 08:00-21:00 IN THE MEMBER'S BRANCH TIMEZONE, for prayer nudges only.
--    `15` asks for quiet hours ("avoid over-notifying") and nothing has ever implemented
--    them. This is the one reminder with no clock of its own: a service reminder is an hour
--    before a service and an RSVP reminder is the day before an event, so both are
--    self-timing, while a nudge is due whenever the cadence says and would happily arrive at
--    03:00. A nudge outside the window is not skipped, it waits for the next qualifying
--    hour; since the cadence is anchored, waiting costs nothing downstream.
--
-- WHAT STOPS A NUDGE (`09` §36-41, all of it, and all in the batch query below): the member
-- taps "I prayed" (the update guard already nulls the schedule), the request is answered,
-- the request is removed or unpublished, the request is deleted (the row cascades), the cap
-- is reached, the member turns `prayer_reminders` off, or a block appears in either
-- direction between the two people. That last one is not in `09` and is in `15`
-- ("fan-out suppresses activity notifications when a block exists in either direction"):
-- a nudge to pray for someone you have blocked would deep-link to a request the feed no
-- longer shows you.
--
-- WHY THE PREF COLUMN HERE IS `prayer_reminders` AND NOT `prayer_activity`. `15`'s tier
-- table names `prayer_reminders` for this tier, and W3.3's single control writes both
-- columns, so today they agree. `_shared/pushChannels.ts` gates the `prayer` TYPE on
-- `prayer_activity` because that is the right answer for "someone prayed with you", and the
-- jobs do not call it (slice 1's header). Gating here, on the column the spec names, is what
-- makes a later split of that control correct without a migration.
--
-- WHY NO BACKFILL. Commitments made before today keep `next_reminder_at IS NULL` and are
-- never nudged. Enrolling them would mean a member who tapped "I will pray" in July hearing
-- about it tomorrow, which is not a reminder, it is a surprise. The dev seed enrols its own
-- rows so a local reset has something to watch.
--
-- Rollback (roll forward): a compensating migration unschedules both jobs, restores the
-- insert guard's `next_reminder_at := null`, and drops the four functions. Rows already
-- enrolled would keep their schedule, so the compensating migration nulls them too.

begin;

set local lock_timeout = '3s';

-- --- 1. RSVP reminders --------------------------------------------------------------

/**
 * Members who said they are going to an event starting inside the next tick's window.
 *
 * Twenty-four hours ahead, which is the lead the copy already assumes: "{event} is coming
 * up / You said you're going" is a message about tomorrow, not about an hour from now.
 *
 * Grid-anchored like the service window and for the same reason (20260819120000): a window
 * measured from `now()` walks past an occurrence when a tick runs late, and nothing ever
 * sees it again.
 *
 * `starts_at_local` + `timezone` rather than an instant, because that is how `02` stores a
 * future user-facing time; `event_start_instant` is the existing resolver and is reused
 * rather than re-derived, so there is one definition of when an event starts.
 *
 * NO PREF GATE, deliberately: `15` classes this as transactional (it answers something the
 * member did, on the `transactional` Android channel, with no pref key). A member who RSVPs
 * and is then not reminded has been let down by the feature they used.
 */
create function public.rsvp_reminder_batch(
  at_time timestamptz default now(),
  lead_hours integer default 24,
  tick_minutes integer default 60
)
returns table (
  profile_id uuid,
  event_id uuid,
  event_title text,
  starts_at_local timestamp,
  dedupe_key text
)
language sql
stable
security definer
set search_path = ''
as $function$
  with bounds as (
    select
      to_timestamp(
        floor(extract(epoch from at_time) / (tick_minutes * 60)) * tick_minutes * 60
      ) + make_interval(hours => lead_hours) as lower_bound,
      to_timestamp(
        floor(extract(epoch from at_time) / (tick_minutes * 60)) * tick_minutes * 60
      ) + make_interval(hours => lead_hours, mins => tick_minutes) as upper_bound
  )
  select
    r.profile_id,
    e.id,
    e.title,
    e.starts_at_local,
    -- `02`'s own rule, unchanged: the key embeds the occurrence, so moving an event mints a
    -- new key and the new time is announced instead of being swallowed by the old one.
    'rsvp_reminder:' || e.id::text || ':'
      || to_char(e.starts_at_local, 'YYYY-MM-DD"T"HH24:MI')
  from public.rsvps r
  join public.events e on e.id = r.event_id
  join public.profiles p on p.id = r.profile_id and p.deleted_at is null
  cross join bounds
  -- `going` only. "Interested" is a maybe, and `15`'s copy for this notification says "You
  -- said you're going"; reminding a maybe would make the app put words in their mouth.
  where r.status = 'going'
    -- A cancelled event is announced by its own cancellation notification (W3.5), never by
    -- a reminder to attend it.
    and e.status = 'scheduled'
    and public.event_start_instant(e.starts_at_local, e.timezone) >= bounds.lower_bound
    and public.event_start_instant(e.starts_at_local, e.timezone) < bounds.upper_bound;
$function$;

revoke all on function public.rsvp_reminder_batch(timestamptz, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.rsvp_reminder_batch(timestamptz, integer, integer)
  to service_role;

comment on function public.rsvp_reminder_batch is
  'Members going to an event starting inside the next tick''s window, 24 hours ahead (docs/spec/11, `21` §5). Transactional: no pref gate. The key embeds starts_at_local, so a rescheduled event mints a new one.';

-- --- 2. The prayer cadence ----------------------------------------------------------

/**
 * When the next nudge for a commitment is due, or NULL once the cap is reached.
 *
 * `sent_count` is how many nudges have ALREADY gone out, so enrolment asks for 0 and gets
 * day 1. IMMUTABLE and pure arithmetic on the commitment's own timestamp: the cadence is a
 * product decision, so it lives in one function with pgTAP over it rather than as three
 * intervals sprinkled through a job (ADR 0016's "the database decides").
 *
 * Returning NULL past the cap IS the hard cap. There is deliberately no second guard on
 * `reminder_count` in the batch query below: two expressions of one rule is two rules.
 */
create function public.prayer_reminder_next(
  committed_at timestamptz,
  sent_count integer
)
returns timestamptz
language sql
immutable
as $function$
  select case sent_count
    when 0 then committed_at + interval '1 day'
    when 1 then committed_at + interval '3 days'
    when 2 then committed_at + interval '7 days'
    else null
  end;
$function$;

revoke all on function public.prayer_reminder_next(timestamptz, integer)
  from public, anon;
-- `authenticated` needs EXECUTE, unlike every other function in this migration, and the
-- reason is worth writing down: the INSERT guard on prayer_intercessions calls this, and a
-- trigger function runs as the invoking role. Revoking it here made "I will pray" fail with
-- 42501 (caught by 041 before it could reach anyone). It is pure arithmetic over arguments
-- the caller already supplies and reads no table, so granting it discloses nothing; the
-- COLUMN it computes stays server-only, which is what actually matters.
grant execute on function public.prayer_reminder_next(timestamptz, integer)
  to authenticated, service_role;

comment on function public.prayer_reminder_next is
  'Day 1, day 3, day 7, then NULL (docs/spec/09 §Prayer commitment; decided 2026-08-19). Anchored to committed_at rather than to the last send, so a nudge held back by quiet hours does not push the rest of the cadence out. NULL past the third is the hard cap.';

-- Every commitment is now enrolled at the moment it is made. This is the ONLY change to the
-- guard: the line it replaces set `next_reminder_at := null` with the comment "Scheduled by
-- the reminder job (W3.4)", which is this migration.
create or replace function public.prayer_intercessions_insert_guard()
returns trigger
language plpgsql
as $function$
begin
  if (select auth.uid()) is null then
    return new;
  end if;
  new.profile_id := (select auth.uid());
  -- Every commitment starts at committed; the schedule is the server's to set.
  new.state := 'committed';
  new.committed_at := now();
  new.prayed_at := null;
  new.reminder_count := 0;
  -- Enrolled here rather than by the job, so "I will pray" and "you are on the list" are
  -- one atomic act: a job that had to find un-enrolled rows and adopt them would be a
  -- second definition of who is being reminded (docs/spec/09: the tap "enrols them in
  -- gentle prayer reminders for that request").
  new.next_reminder_at := public.prayer_reminder_next(new.committed_at, 0);
  if not public.prayer_is_published(new.prayer_id) then
    raise exception 'you can only commit to pray for a published request'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$function$;

/**
 * Commitments owed a nudge right now.
 *
 * Every stop condition from `09` is a line in this WHERE clause rather than a check spread
 * between the job and the app, because the failure mode of a missed stop condition is a
 * notification about something that is over, and those are the ones members remember.
 *
 * The block filter is inlined rather than being a helper, following the note above the
 * counter helpers in 20260720220000: a SECURITY DEFINER "did X block me" function is
 * grantable to PUBLIC by default and would answer the exact question `blocked_users`' RLS
 * refuses to answer.
 */
create function public.prayer_reminder_batch(at_time timestamptz default now())
returns table (
  intercession_id uuid,
  profile_id uuid,
  prayer_id uuid,
  dedupe_key text
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    pi.id,
    pi.profile_id,
    pi.prayer_id,
    -- The occurrence is "the Nth nudge for THIS commitment". The intercession id rather
    -- than the prayer id, so a member who withdraws and commits again gets a fresh cadence
    -- instead of keys their old commitment has already spent.
    'prayer_reminder:' || pi.id::text || ':' || (pi.reminder_count + 1)::text
  from public.prayer_intercessions pi
  join public.prayers pr on pr.id = pi.prayer_id
  join public.profiles p on p.id = pi.profile_id and p.deleted_at is null
  left join public.branches b on b.id = p.branch_id
  left join public.notification_prefs np on np.profile_id = pi.profile_id
  where pi.state = 'committed'
    and pi.next_reminder_at is not null
    and pi.next_reminder_at <= at_time
    -- Answered closes the loop, and the request stops being something to pray about
    -- (docs/spec/09: reminders stop "when the request is answered or deleted").
    and pr.answered_at is null
    and pr.status = 'approved'
    and pr.deleted_at is null
    and coalesce(np.prayer_reminders, true)
    -- Quiet hours, in the member's own branch clock. `between 8 and 20` is 08:00 up to
    -- 20:59, i.e. the 08:00-21:00 window. A member with no branch falls back to UTC rather
    -- than dropping out of the batch: never being reminded is the worse failure.
    and extract(hour from (at_time at time zone coalesce(b.timezone, 'UTC'))) between 8 and 20
    and not exists (
      select 1 from public.blocked_users bu
      where (bu.blocker_id = pi.profile_id and bu.blocked_id = pr.author_id)
         or (bu.blocked_id = pi.profile_id and bu.blocker_id = pr.author_id)
    );
$function$;

revoke all on function public.prayer_reminder_batch(timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.prayer_reminder_batch(timestamptz) to service_role;

comment on function public.prayer_reminder_batch is
  'Commitments owed a gentle nudge (docs/spec/09 §Prayer commitment, `15`). Carries every stop condition: fulfilled, answered, unpublished, deleted, capped, pref off, or blocked in either direction. Quiet hours are 08:00-21:00 in the member''s branch timezone.';

/**
 * Move a batch of commitments on to their next nudge.
 *
 * CALLED FOR EVERY ROW THE BATCH RETURNED, not only for the ones that produced a new
 * notification, and that is the important part. If a run dies between writing the rows and
 * advancing the schedule, the next run recomputes the SAME dedupe key, the seam refuses it
 * as already claimed, and this still advances: the cadence converges instead of sticking on
 * one rung forever. The dedupe key is what makes that safe (ADR 0022).
 *
 * The update guard lets this through because the service role has no `auth.uid()`; that is
 * the same door the seeds and the deletion job use. A client reaching this column is
 * refused by the guard, which is the point of `next_reminder_at` being server-only.
 */
create function public.advance_prayer_reminders(ids uuid[])
returns integer
language sql
volatile
security definer
set search_path = ''
as $function$
  with moved as (
    update public.prayer_intercessions pi
      set reminder_count = pi.reminder_count + 1,
          next_reminder_at =
            public.prayer_reminder_next(pi.committed_at, pi.reminder_count + 1)
      where pi.id = any (coalesce(ids, '{}'::uuid[]))
        -- A commitment fulfilled between the batch and this call keeps its NULL schedule.
        and pi.state = 'committed'
      returning 1
  )
  select count(*)::integer from moved;
$function$;

revoke all on function public.advance_prayer_reminders(uuid[])
  from public, anon, authenticated, service_role;
grant execute on function public.advance_prayer_reminders(uuid[]) to service_role;

comment on function public.advance_prayer_reminders is
  'Advances a batch of commitments to their next nudge, or off the cadence at the cap (docs/spec/09). Called for every batched row rather than every sent one, so a run that dies after sending still moves on; the dedupe key stops the repeat becoming a re-send.';

-- --- 3. The schedules ---------------------------------------------------------------

-- Hourly, both of them, and both off the top of the hour so nothing contends with the
-- moderation digest at :07 or the receipts sweep at :03/:18/:33/:48.
--
-- The RSVP job's tick and its window are both an hour, on the same grid, exactly as the
-- service job's are both 15 minutes; they have to agree or the window drifts away from the
-- ticks that scan it.
select cron.schedule(
  'rsvp-reminders',
  '11 * * * *',
  $cron$select jobs.invoke_edge_function('rsvp-reminders')$cron$
);

-- The prayer job has no window at all: it asks "is anything due", so an hourly tick simply
-- bounds how late a nudge can be. Twenty-six past, so a busy hour is spread out.
select cron.schedule(
  'prayer-reminders',
  '26 * * * *',
  $cron$select jobs.invoke_edge_function('prayer-reminders')$cron$
);

comment on column public.prayer_intercessions.next_reminder_at is
  'When the next gentle nudge is due, or NULL for "off the cadence" (docs/spec/09). Set at commit by the insert guard and moved on by advance_prayer_reminders(); nulled by fulfilment and by the cap. Never client-writable: a member who could write it could silence or spam their own reminders.';

commit;
