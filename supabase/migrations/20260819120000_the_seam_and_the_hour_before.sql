-- W3.4 slice 1: the delivery seam, and the hour before a service (docs/spec/15, `21` §5,
-- `02`, ADR 0016, ADR 0022).
--
-- W3.3 built everything a push needs except a caller. `expoPushSender` has no callers on
-- `main` today; `notifications` has its two unique indexes and nothing writes rows. So the
-- first thing here is not a reminder, it is the SEAM the three reminder jobs share.
--
-- 1. THE INSERT IS THE CLAIM, AND IT COMES BEFORE THE PUSH. `notifications`' partial unique
--    on `(profile_id, dedupe_key)` is the no-double-send guarantee (ADR 0022), so
--    `deliver_notifications` inserts with ON CONFLICT DO NOTHING and returns only the rows
--    it actually created. Whoever gets the row back owns the send. The other order was
--    considered and is worse in the direction that matters: push-then-insert double-pushes
--    on any crash between the two, while insert-then-push degrades a failed push to
--    notification-centre-only, which is exactly what `15` already promises a member whose
--    push permission is off. A run that could not deliver still pings FAILURE.
--
-- 2. THE PREF GATE IS IN THIS FILE, not in the edge function. ADR 0016: the database
--    decides who, the function delivers. So `service_reminder_batch` applies
--    `notification_prefs.service_reminders` itself, treating an ABSENT row as the column
--    defaults (`02`), and `_shared/pushChannels.allowedByPrefs` is deliberately not called
--    by these jobs. Two gates on one fact would be two owners, and they already disagree:
--    the `prayer` channel routes to `prayer_activity` because one control writes both
--    columns, while `15`'s tier table gates prayer reminders on `prayer_reminders`.
--
-- 3. A PREF-OFF MEMBER GETS NOTHING AT ALL, not a silent row. `15` distinguishes the two
--    cases and this migration follows it: OS permission denied still lands in the
--    notification centre ("nothing is silently lost; it just waits for the next app open"),
--    but a member who turned the CATEGORY off has said they do not want it, and
--    "prefs actually suppress the corresponding categories" is an acceptance criterion.
--
-- 4. THE WINDOW IS ANCHORED TO THE TICK GRID, NOT TO now(). A window computed from `now()`
--    moves with the run, so a tick that fires four minutes late scans four minutes past the
--    occurrence it was meant to catch and nothing ever sees it again: "reminders silently
--    stop" is the canonical failure `21` §5 names at the top of its own table. Flooring the
--    clock to the 15-minute grid means a late run scans exactly the window an on-time run
--    would have, and two runs inside one grid slot compute the same window and are settled
--    by the dedupe index. Every function here takes its clock as an argument so pgTAP can
--    drive DST from both sides without waiting for March.
--
-- 5. THE DEDUPE KEY CARRIES THE LOCAL START TIME, which corrects `02` (done in this PR).
--    `02` and `20260816120000` both give the example `service_reminder:<branch_id>:<service_date>`
--    with the reasoning that "a rescheduled event mints a new key and its reminder is NOT
--    swallowed by the old one". That key cannot keep that promise. Two services on one date
--    at one branch (a Sunday morning and a Sunday evening) share it, so the evening one is
--    never announced; and a service moved from 11:00 to 18:00 on the same date is swallowed
--    too, which is the exact case the sentence is about. The key is
--    `service_reminder:<branch_id>:<YYYY-MM-DD>T<HH24:MI>`, which is what `02`'s OWN rsvp
--    example already does (`rsvp_reminder:<event_id>:<starts_at_local>`). Decided with Ayo
--    2026-08-19.
--
-- Rollback (roll forward, per the database standard): a compensating migration unschedules
-- `service-reminders` and drops the two functions. No data moves; `notifications` rows
-- already written stay, and their dedupe keys keep working.

begin;

set local lock_timeout = '3s';

-- --- 1. the seam -------------------------------------------------------------------

/**
 * Write a batch of notifications, skipping any the recipient already has, and hand back
 * everything a push needs for the ones that were actually created.
 *
 * ONE round trip, and one place where "we have already told them" is decided. Each entry is
 * `{profile_id, type, template_key, params, deep_link, dedupe_key}`; the words are NOT here,
 * because `15`'s localization rule stores a template key and renders per recipient language
 * at send time (`_shared/pushTemplates.ts`) and again in the centre.
 *
 * The device join is a LEFT JOIN on purpose: a member with no registered device still comes
 * back, with a null token. The caller counts notifications created from the distinct ids and
 * pushes only the rows carrying a token, so "written but not pushable" stays visible instead
 * of looking like nothing happened.
 *
 * DISTINCT ON in `wanted` guards the one case ON CONFLICT cannot see for us: two identical
 * entries inside a SINGLE call. Speculative insertion handles it, but relying on that is a
 * detail of the executor rather than a decision, and a caller that sends a member the same
 * key twice has a bug worth not amplifying.
 *
 * SECURITY DEFINER with a pinned search_path, matching W3.3's job functions: the target
 * table has FORCE ROW LEVEL SECURITY and deliberately NO insert policy of any kind, so this
 * function is the only door, and it is granted to service_role alone.
 */
create function public.deliver_notifications(entries jsonb)
returns table (
  notification_id uuid,
  profile_id uuid,
  language text,
  type text,
  template_key text,
  params jsonb,
  deep_link text,
  device_id uuid,
  expo_push_token text
)
language sql
volatile
security definer
set search_path = ''
as $function$
  with wanted as (
    select distinct on (profile_id, dedupe_key)
      (e ->> 'profile_id')::uuid as profile_id,
      e ->> 'type' as type,
      e ->> 'template_key' as template_key,
      coalesce(e -> 'params', '{}'::jsonb) as params,
      e ->> 'deep_link' as deep_link,
      e ->> 'dedupe_key' as dedupe_key
    from jsonb_array_elements(coalesce(entries, '[]'::jsonb)) e
  ),
  claimed as (
    insert into public.notifications
      (profile_id, type, template_key, params, deep_link, dedupe_key)
    select w.profile_id, w.type, w.template_key, w.params, w.deep_link, w.dedupe_key
    from wanted w
    on conflict (profile_id, dedupe_key) where dedupe_key is not null do nothing
    returning id, profile_id, type, template_key, params, deep_link
  )
  select
    c.id,
    c.profile_id,
    p.language,
    c.type,
    c.template_key,
    c.params,
    c.deep_link,
    d.id,
    d.expo_push_token
  from claimed c
  join public.profiles p on p.id = c.profile_id
  left join public.devices d on d.profile_id = c.profile_id;
$function$;

revoke all on function public.deliver_notifications(jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.deliver_notifications(jsonb) to service_role;

comment on function public.deliver_notifications is
  'Writes notifications idempotently and returns only what was newly created, joined to each recipient''s language and devices (docs/spec/15, ADR 0022). The insert IS the claim on the send, so a re-run pushes nothing twice; a member with no device comes back with a null token rather than disappearing.';

-- --- 2. who is due -----------------------------------------------------------------

/**
 * Members owed a "service starts in 1 hour" for an occurrence inside the next tick's window.
 *
 * WHY A SET OF LOCAL DATES RATHER THAN ARITHMETIC ON THE INSTANT. `branch_services` stores a
 * weekday and a branch-local wall clock, which is the right storage (`02`: a future
 * user-facing time survives a change in the zone's law only if it is stored as wall clock +
 * zone). Turning that into an instant means resolving it in the branch's own zone, and the
 * resolution is not a fixed offset: Glasgow, Berlin, Emmen and Ogbomosho disagree by up to
 * two hours and only three of them observe DST at all. So the candidate LOCAL dates are
 * generated in the branch's zone, a day either side of the window to cover the offset, and
 * each candidate is converted with `at time zone` and then compared as an instant.
 *
 * DST falls out of that conversion rather than being special-cased, and both directions were
 * measured against this database rather than recalled (2026-08-19):
 *   * spring forward, a nonexistent local time: `2027-03-28 02:30 Europe/Berlin` resolves to
 *     01:30Z, i.e. 03:30 local. One instant, so the occurrence is announced once and is not
 *     lost.
 *   * autumn fall-back, an ambiguous local time: `2026-10-25 02:30 Europe/Berlin` resolves to
 *     01:30Z, the EARLIER of the two offsets, which is what `02` §branch_services specifies.
 *     One instant again, so the hour that happens twice does not send twice.
 * Both are asserted in `040`, with services deliberately placed in those hours.
 *
 * `at_time` is a parameter so the tests can stand anywhere in the year; the job passes
 * nothing and gets now().
 */
create function public.service_reminder_batch(
  at_time timestamptz default now(),
  lead_minutes integer default 60,
  tick_minutes integer default 15
)
returns table (
  profile_id uuid,
  branch_id uuid,
  branch_name text,
  service_date date,
  start_time time,
  dedupe_key text
)
language sql
stable
security definer
set search_path = ''
as $function$
  with bounds as (
    select
      -- Floor to the tick grid on the EPOCH, which has no zones and no DST, so the grid is
      -- the same instant everywhere and a run four minutes late scans the window an on-time
      -- run would have scanned.
      to_timestamp(
        floor(extract(epoch from at_time) / (tick_minutes * 60)) * tick_minutes * 60
      ) + make_interval(mins => lead_minutes) as lower_bound,
      to_timestamp(
        floor(extract(epoch from at_time) / (tick_minutes * 60)) * tick_minutes * 60
      ) + make_interval(mins => lead_minutes + tick_minutes) as upper_bound
  ),
  due as (
    select
      s.branch_id,
      b.name as branch_name,
      d::date as service_date,
      s.start_time
    from public.branch_services s
    join public.branches b
      on b.id = s.branch_id
      -- An archived branch keeps its rows (`02`: branches are archived, never deleted) and
      -- must stop announcing services nobody holds.
      and b.status = 'active'
    cross join bounds
    cross join lateral generate_series(
      ((bounds.lower_bound at time zone b.timezone)::date - 1)::timestamp,
      ((bounds.upper_bound at time zone b.timezone)::date + 1)::timestamp,
      interval '1 day'
    ) d
    where extract(dow from d) = s.weekday
      and ((d::date + s.start_time) at time zone b.timezone) >= bounds.lower_bound
      and ((d::date + s.start_time) at time zone b.timezone) < bounds.upper_bound
  )
  select
    p.id,
    due.branch_id,
    due.branch_name,
    due.service_date,
    due.start_time,
    -- The occurrence, as a member experiences it: this branch, this date, this local time.
    -- Branch rather than service id deliberately, so a service row deleted and recreated at
    -- the same hour does not re-announce itself (see the header).
    'service_reminder:' || due.branch_id::text || ':'
      || to_char(due.service_date, 'YYYY-MM-DD') || 'T'
      || to_char(due.start_time, 'HH24:MI')
  from due
  join public.profiles p
    on p.branch_id = due.branch_id
    and p.deleted_at is null
  left join public.notification_prefs np on np.profile_id = p.id
  -- An absent prefs row means the column defaults, which are all true (`02`), so absent is
  -- "yes". A member who has never opened settings should still hear that church is starting.
  where coalesce(np.service_reminders, true);
$function$;

revoke all on function public.service_reminder_batch(timestamptz, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.service_reminder_batch(timestamptz, integer, integer)
  to service_role;

comment on function public.service_reminder_batch is
  'Members owed a service reminder for an occurrence inside the next tick''s window, resolved in each branch''s own timezone (docs/spec/15, `21` §5). The window is anchored to the tick grid so a late run loses nothing; the dedupe key carries the local start time so two services on one date both send and a rescheduled one is not swallowed.';

-- --- 3. the schedule ---------------------------------------------------------------

-- Every 15 minutes, matching `21` §5, and on the grid the batch function floors to: the
-- two must agree or the window drifts away from the ticks that scan it. Offset by 1 minute
-- so pg_cron is not firing this at the same instant as the receipts sweep (:03/:18/:33/:48)
-- or the moderation digest (:07).
--
-- cron.schedule() upserts by name (see 20260806130000), so re-running this migration
-- re-points the job rather than duplicating it.
select cron.schedule(
  'service-reminders',
  '1,16,31,46 * * * *',
  $cron$select jobs.invoke_edge_function('service-reminders')$cron$
);

-- The dedupe-key rule, corrected on the column that carries it (see the header, point 5).
comment on column public.notifications.dedupe_key is
  'Deterministic per occurrence, so a re-run never double-sends (docs/spec/21 §5). Time-bound keys embed the occurrence INCLUDING its local start time: service_reminder:<branch_id>:<YYYY-MM-DD>T<HH24:MI>, rsvp_reminder:<event_id>:<starts_at_local>. Date alone is not enough: two services on one date would share a key and a same-day reschedule would be swallowed (W3.4 slice 1, correcting 20260816120000).';

commit;
