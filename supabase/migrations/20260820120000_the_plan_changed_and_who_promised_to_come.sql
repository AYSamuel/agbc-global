-- W3.5 slice 4: what an event owes the people who promised to come (docs/spec/11, `15`,
-- `17` §3, `02`, ADR 0016, ADR 0022).
--
-- `11` promises two different notifications and this repo had built neither. One goes out
-- when an event is POSTED (a branch hears about its own, the whole family hears about a
-- ministry-wide one, both pref-gated). The other goes to the people who already said they
-- were coming, when the plan they said yes to CHANGES: cancelled, moved, or back on. The
-- second is the one `17` §3 names; the first is why `notifications.type` has carried an
-- `event` value since 20260816120000 with nothing ever writing it.
--
-- FOUR DECISIONS TAKEN WITH AYO (2026-08-20), before any of this was written:
--
-- 1. BOTH notifications ship here, not just the RSVP half. They are the same job with one
--    extra case, and leaving "an event was posted" unbuilt would leave `11`'s acceptance
--    criterion ("global events notify the whole family; branch events notify that branch")
--    unmet and its notification type dead.
--
-- 2. ONLY TIME OR VENUE MOVES THE RSVP LIST. `11` says "changing time or venue" and that is
--    taken literally: a description fixed, a picture swapped, an end time corrected or a
--    title tidied reaches nobody. Quiet edits stay quiet, which is what keeps the loud ones
--    worth reading.
--
-- 3. THE PUSH CARRIES THE NEW TIME. "Now Sat, 5 Sept, 7:00 pm", rendered in each recipient's
--    own language at send time, rather than "tap to see". An event's title and start are
--    things the church published itself, so `15`'s payload rule (nothing special-category,
--    nothing that should not sit on a lock screen) holds, and the member learns the thing
--    the notification exists to tell them without opening anything.
--
-- 4. NO SECOND PAIR OF EYES ON A CANCELLATION, A SETTLE WINDOW INSTEAD. Broadcasts need an
--    approver because a broadcast is a message; a cancellation is a fact, and holding a room
--    full of people uninformed while an admin is found is the worse failure. What replaces
--    it is TIME: nothing is announced until the row has been still for two minutes, so a
--    mis-tap can be undone before anybody hears. (Ministry-wide events are already admin-only
--    to touch: `can_moderate_branch(null)` is true for admins alone, so this decision only
--    ever concerns a leader and their own branch.)
--
-- HOW THE WORK IS DERIVED, and why there is no outbox. ADR 0016 wants a job to read live
-- state. Live state answers "is this cancelled" on its own and cannot answer "did it MOVE"
-- without knowing what the RSVP list was last told, so THE EVENT REMEMBERS THE PLAN IT
-- ANNOUNCED: status, start and place, in three columns. Due is "what they were told is not
-- what is true"; which of the four notices it is falls out of comparing the two. No queue to
-- drain, and a job that dies mid-run finds exactly the same work waiting.
--
-- That comparison is also what makes decision 4's undo real, and it is the reason a simple
-- "revision changed" counter was rejected while this was being written: a leader who cancels
-- and reinstates inside the window has moved the counter twice and changed nothing, and a
-- counter would have announced a phantom move. Comparing the plan itself announces silence,
-- which is what actually happened.
--
-- WHY THERE IS A REVISION AS WELL. It never decides whether to send; it only makes the key
-- unique. `02`'s rule is that a dedupe key embeds the occurrence it announces, including its
-- local start time, so a rescheduled event is not swallowed by the send for its old one. The
-- start time alone cannot keep that promise here: 18:00 -> 19:00 -> 18:00 -> 19:00 mints the
-- same key twice and the fourth notice would be silently dropped, leaving members holding a
-- time the event no longer has. The revision is monotonic per plan change, so it cannot
-- collide; the start time stays in the key anyway, because a log nobody can read is a log
-- nobody checks.
--
-- WHY A NEW `event_change` TYPE RATHER THAN REUSING `event`. `event` is pref-gated on
-- `branch_updates` (`15`'s tier table, `_shared/pushChannels.ts`), which is right for "there
-- is a new event" and wrong for "the one you said you were coming to is cancelled": a member
-- who turned branch news off would turn up at a locked door. `15` classes anything answering
-- an action the member took as transactional and always on, and RSVPing is such an action.
-- So the change notices are transactional and the postings are pref-gated, which is the same
-- line `15` already draws between an RSVP reminder and a branch update.
--
-- Rollback (roll forward, per the database standard): a compensating migration unschedules
-- `event-notices`, drops the five functions, restores the two guards and drops the four
-- columns. Notifications already written stay; their dedupe keys keep working.

begin;

set local lock_timeout = '3s';

-- --- 1. a type for "the plan you said yes to has changed" ---------------------------
--
-- Rewritten rather than widened: the constraint is a CHECK over a text column, chosen in
-- 20260816120000 over an enum precisely so this is a one-step migration rather than the
-- ALTER TYPE ... ADD VALUE two-step. `_shared/pushChannels.ts` gains the matching routing
-- row in this same PR, and its test asserts the two lists are identical.

alter table public.notifications drop constraint notifications_type_known;
alter table public.notifications add constraint notifications_type_known check (
  type in (
    -- pref-gated
    'prayer', 'testimony_glory', 'event', 'ministry', 'branch', 'service_reminder',
    -- always-on (transactional)
    'moderation', 'rsvp_reminder', 'registration', 'purchase', 'event_change'
  )
);

-- --- 2. what the event remembers telling people ------------------------------------

alter table public.events
  -- The plan as last announced. All three NULL means nothing has ever been said about this
  -- event, which is itself the trigger for the posting notice.
  add column announced_status public.event_status,
  add column announced_starts_at_local timestamp,
  add column announced_location text,
  -- Bumped by the update guard whenever the plan changes, and used for NOTHING except
  -- making a dedupe key unique across a round trip (header). Never a reason to send.
  add column notice_revision integer not null default 1;

comment on column public.events.announced_status is
  'The status the audience was last told about. With the two columns beside it, "what they were told" versus "what is true" IS the job''s work list (ADR 0016: live state, not an outbox). NULL until the first notice goes out.';
comment on column public.events.announced_starts_at_local is
  'The start the audience was last told about. A cancel-then-reinstate inside the settle window leaves this equal to the current start, which is why the undo announces silence rather than a phantom move.';
comment on column public.events.announced_location is
  'The place the audience was last told about (docs/spec/11: "changing time or venue").';
comment on column public.events.notice_revision is
  'Monotonic per plan change, so an event moved back to a time it already had mints a fresh dedupe key instead of colliding with the old one (docs/spec/02''s key rule, extended). It never decides whether to send.';

-- Every event that already exists has been lived with; nobody may be told about it now.
-- (W3.4's lesson: enrolling history is not a reminder, it is a surprise.)
update public.events
set announced_status = status,
    announced_starts_at_local = starts_at_local,
    announced_location = location;

-- The work list is a handful of rows out of a small table, but the predicate runs every
-- minute for ever, so it gets the partial index that makes it a lookup rather than a scan.
-- The predicate is the same expression `due_event_notices` filters on, deliberately.
create index events_notice_due_idx
  on public.events (updated_at)
  where announced_status is distinct from status
     or announced_starts_at_local is distinct from starts_at_local
     or announced_location is distinct from location;

-- --- 3. the two guards ---------------------------------------------------------------

/**
 * A new event is unannounced, whoever wrote it.
 *
 * The four columns are BOOKKEEPING and never an input: a leader who could set
 * `announced_status` on the way in could silence the cancellation of their own event. The
 * grant layer cannot express "every column except these" without pinning every future column
 * into a grant list, so the guard owns them instead, and it owns them for the service role
 * too. Seeds and pgTAP fixtures that want history rather than an announcement say so
 * explicitly afterwards, which is the honest way round: one line in the seed, rather than a
 * rule that quietly depends on which connection wrote the row.
 */
create or replace function public.events_insert_guard()
returns trigger
language plpgsql
as $function$
begin
  -- Default the zone from the branch; ministry-wide events default to HQ's
  -- zone (docs/spec/02: "defaults to the branch's timezone").
  if new.timezone is null or new.timezone = '' then
    if new.branch_id is not null then
      select b.timezone into new.timezone
      from public.branches b
      where b.id = new.branch_id;
    else
      select b.timezone into new.timezone
      from public.branches b
      where b.is_hq
      order by b."order"
      limit 1;
    end if;
  end if;

  new.announced_status := null;
  new.announced_starts_at_local := null;
  new.announced_location := null;
  new.notice_revision := 1;
  return new;
end;
$function$;

/**
 * A plan change is a fact the RSVP list is owed; every other edit is not.
 *
 * `updated_at` moves on EVERY save, which is what the settle window reads, so a leader
 * fixing a typo two minutes after moving an event delays the notice rather than adding one.
 * That is the right direction: the window exists so the row can settle, and a row still
 * being edited has not settled.
 *
 * The announced columns are protected from a human writer HERE rather than in a policy,
 * because RLS decides which ROWS a leader may update and never which columns (the lesson of
 * 20260803140000, applied to the write side). A trusted caller (the job, a seed, pgTAP) has
 * no `auth.uid()` and may set them, which is how `mark_event_announced` records a send.
 */
create or replace function public.events_update_guard()
returns trigger
language plpgsql
as $function$
begin
  -- Reinstatement only while the start is still in the future: a past event
  -- stays cancelled (docs/spec/11).
  if old.status = 'cancelled' and new.status = 'scheduled'
     and public.event_start_instant(new.starts_at_local, new.timezone) <= now() then
    raise exception 'a past event cannot be reinstated'
      using errcode = 'check_violation';
  end if;

  if new.timezone is null or new.timezone = '' then
    new.timezone := old.timezone;
  end if;

  if (select auth.uid()) is not null then
    -- Not the writer's to set. A leader may change the plan; what has been SAID about it is
    -- the server's own record.
    new.announced_status := old.announced_status;
    new.announced_starts_at_local := old.announced_starts_at_local;
    new.announced_location := old.announced_location;
    new.notice_revision := old.notice_revision;
  end if;

  -- THE PLAN, and nothing else (decision 2, docs/spec/11). `timezone` is here because a
  -- zone change moves the instant even when the wall clock does not; `ends_at_local`,
  -- `description`, `title`, `image_path` and `rsvp_enabled` are deliberately not.
  if new.status is distinct from old.status
     or new.starts_at_local is distinct from old.starts_at_local
     or new.timezone is distinct from old.timezone
     or new.location is distinct from old.location then
    new.notice_revision := new.notice_revision + 1;
  end if;

  new.updated_at := now();
  return new;
end;
$function$;

-- --- 4. which notice is owed, and under which key ------------------------------------

/**
 * posted | cancelled | moved | reinstated, or NULL when nobody is owed anything.
 *
 * IMMUTABLE and argument-only, so pgTAP can drive every combination without a row.
 *
 * THE SILENCES ARE THE INTERESTING HALF. Nothing is owed when the announced plan already
 * matches the live one, which is what makes decision 4's undo work: cancel and reinstate
 * inside the settle window and this returns NULL, because from the audience's point of view
 * nothing happened. Nothing is owed either for an event created and cancelled before anyone
 * was told it existed, or for an edit to an event that is already off.
 *
 * A TIMEZONE-ONLY CHANGE IS DELIBERATELY NOT A MOVE. The zone is derived from the branch and
 * the dashboard does not offer it (`17` §3), so the only way to change it is to move the
 * event to another branch, which is not a thing the events module does. If it ever becomes
 * editable, this function grows an announced_timezone argument and the comparison below
 * becomes an instant comparison.
 */
create function public.event_notice_kind(
  announced_status public.event_status,
  announced_starts_at_local timestamp,
  announced_location text,
  current_status public.event_status,
  current_starts_at_local timestamp,
  current_location text
)
returns text
language sql
immutable
as $function$
  select case
    when announced_status is null and current_status = 'scheduled' then 'posted'
    when announced_status is null then null
    when announced_status = 'scheduled' and current_status = 'cancelled' then 'cancelled'
    when announced_status = 'cancelled' and current_status = 'scheduled' then 'reinstated'
    when current_status = 'cancelled' then null
    when announced_starts_at_local is distinct from current_starts_at_local
      or announced_location is distinct from current_location then 'moved'
    else null
  end;
$function$;

comment on function public.event_notice_kind is
  'Which of the four event notices an event owes, from the plan last announced and the plan as it stands (docs/spec/11). NULL is a real answer and covers three silences: nothing changed, an event cancelled before anyone was told it existed, and an edit to an event that is already off.';

/**
 * The dedupe key for one notice.
 *
 * `event_<kind>:<event>:<local start>:r<revision>`. `02`'s rule is the start time; the
 * revision is this migration's addition to it, because an event that moves back to a time it
 * already had would otherwise reuse a key and be silently swallowed (header). Both halves are
 * here on purpose: the revision makes it correct, the timestamp makes it readable.
 */
create function public.event_notice_key(
  kind text,
  event_id uuid,
  starts_at_local timestamp,
  notice_revision integer
)
returns text
language sql
immutable
as $function$
  select 'event_' || kind || ':' || event_id::text || ':'
    || to_char(starts_at_local, 'YYYY-MM-DD"T"HH24:MI')
    || ':r' || notice_revision::text;
$function$;

comment on function public.event_notice_key is
  'The notifications.dedupe_key for an event notice: kind, event, local start and revision (docs/spec/02''s key rule, plus the collision the rule alone does not cover; see this migration''s header).';

-- --- 5. who is due, and who receives it ------------------------------------------------

/**
 * Events with a notice owed, once they have been still long enough to mean it.
 *
 * THE SETTLE WINDOW IS THE UNDO. Two minutes measured on `updated_at`, so a mis-tap reversed
 * inside it sends nothing at all, and a leader mid-edit is not racing the job.
 *
 * PAST EVENTS ARE NOT ANNOUNCED, whatever they owe. Telling somebody that an event they have
 * already missed has moved is noise, and it is the one case where doing nothing is right;
 * the row simply falls out of this query for good.
 */
create function public.due_event_notices(
  at_time timestamptz default now(),
  settle interval default '2 minutes'
)
returns table (
  event_id uuid,
  kind text,
  dedupe_key text,
  status public.event_status,
  branch_id uuid,
  title text,
  starts_at_local timestamp,
  location text,
  timezone text
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    e.id,
    public.event_notice_kind(
      e.announced_status, e.announced_starts_at_local, e.announced_location,
      e.status, e.starts_at_local, e.location
    ),
    public.event_notice_key(
      public.event_notice_kind(
        e.announced_status, e.announced_starts_at_local, e.announced_location,
        e.status, e.starts_at_local, e.location
      ),
      e.id, e.starts_at_local, e.notice_revision
    ),
    e.status,
    e.branch_id,
    e.title,
    e.starts_at_local,
    e.location,
    e.timezone
  from public.events e
  where (
      e.announced_status is distinct from e.status
      or e.announced_starts_at_local is distinct from e.starts_at_local
      or e.announced_location is distinct from e.location
    )
    and e.updated_at <= at_time - settle
    and public.event_start_instant(e.starts_at_local, e.timezone) > at_time
    and public.event_notice_kind(
          e.announced_status, e.announced_starts_at_local, e.announced_location,
          e.status, e.starts_at_local, e.location
        ) is not null
  order by e.updated_at;
$function$;

revoke all on function public.due_event_notices(timestamptz, interval)
  from public, anon, authenticated, service_role;
grant execute on function public.due_event_notices(timestamptz, interval) to service_role;

comment on function public.due_event_notices is
  'Events owing a notice, settled for two minutes and still in the future (docs/spec/11, W3.5 slice 4). The settle window is the undo: a cancellation reversed inside it announces nothing.';

/**
 * Who has not been told yet, a page at a time.
 *
 * THE ANTI-JOIN ON `notifications` IS THE CURSOR. `deliver_notifications` claims a send by
 * inserting the row (ADR 0022), so the members already holding this key are exactly the ones
 * already dealt with, and a run that dies halfway resumes by asking the same question again.
 * There is no page number to lose and nothing to reset.
 *
 * WHO, BY KIND. A posting reaches the branch, or everyone for a ministry-wide event, and is
 * PREF-GATED on the column `15`'s tier table names: `branch_updates` for a branch event,
 * `ministry_announcements` for a ministry-wide one. An absent prefs row means the column
 * defaults, which are all true (`02`). A change reaches the people who said they were coming
 * and is NOT gated at all: it answers an action they took, which `15` calls transactional.
 * The gate lives here rather than in the edge function for the reason ADR 0016 gives and
 * W3.4's seam restates: the database decides who, the function delivers.
 */
create function public.event_notice_recipients(
  event uuid,
  chunk_size integer default 500
)
returns table (profile_id uuid)
language sql
stable
security definer
set search_path = ''
as $function$
  with target as (
    select
      e.id,
      e.branch_id,
      public.event_notice_kind(
        e.announced_status, e.announced_starts_at_local, e.announced_location,
        e.status, e.starts_at_local, e.location
      ) as kind,
      public.event_notice_key(
        public.event_notice_kind(
          e.announced_status, e.announced_starts_at_local, e.announced_location,
          e.status, e.starts_at_local, e.location
        ),
        e.id, e.starts_at_local, e.notice_revision
      ) as dedupe_key
    from public.events e
    where e.id = event
  ),
  audience as (
    -- The posting: a branch, or the whole family, minus anyone who switched that tier off.
    select p.id as profile_id
    from target t
    join public.profiles p
      on p.deleted_at is null
      and (t.branch_id is null or p.branch_id = t.branch_id)
    left join public.notification_prefs np on np.profile_id = p.id
    where t.kind = 'posted'
      and case
        when t.branch_id is null then coalesce(np.ministry_announcements, true)
        else coalesce(np.branch_updates, true)
      end

    union

    -- The change: everyone still holding an RSVP. A member who cancelled their own RSVP has
    -- left the conversation and is not pulled back into it.
    select r.profile_id
    from target t
    join public.rsvps r on r.event_id = t.id and r.status <> 'cancelled'
    join public.profiles p on p.id = r.profile_id and p.deleted_at is null
    where t.kind in ('cancelled', 'moved', 'reinstated')
  )
  select a.profile_id
  from audience a
  cross join target t
  where not exists (
    select 1
    from public.notifications n
    where n.profile_id = a.profile_id
      and n.dedupe_key = t.dedupe_key
  )
  limit chunk_size;
$function$;

revoke all on function public.event_notice_recipients(uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.event_notice_recipients(uuid, integer) to service_role;

comment on function public.event_notice_recipients is
  'One page of members not yet holding this event''s current notice (docs/spec/11, `15`). Prefs gate a posting; a change to an event someone RSVP''d to is transactional and gates on nothing. The anti-join on notifications.dedupe_key IS the cursor.';

/**
 * Record what was said, after it was said (ADR 0016).
 *
 * Takes the plan it is confirming rather than reading it fresh, so an edit that landed WHILE
 * the run was delivering is not swallowed: the row still differs from what was announced
 * afterwards, and the next tick announces the newer plan. Safe to lose entirely, because the
 * dedupe keys are what stop a double-send; this only stops the job re-asking a settled
 * question.
 */
create function public.mark_event_announced(
  event uuid,
  announced_status public.event_status,
  announced_starts_at_local timestamp,
  announced_location text
)
returns void
language sql
volatile
security definer
set search_path = ''
as $function$
  update public.events e
  set announced_status = mark_event_announced.announced_status,
      announced_starts_at_local = mark_event_announced.announced_starts_at_local,
      announced_location = mark_event_announced.announced_location
  where e.id = event;
$function$;

revoke all on function public.mark_event_announced(uuid, public.event_status, timestamp, text)
  from public, anon, authenticated, service_role;
grant execute on function public.mark_event_announced(uuid, public.event_status, timestamp, text)
  to service_role;

comment on function public.mark_event_announced is
  'Advances the announcement bookkeeping after a notice went out (ADR 0016: record after sending). Confirms the plan it was given, so a plan changed mid-run is announced on the next tick rather than lost.';

/**
 * How many people a change to this event would reach, for the dashboard.
 *
 * ONE definition, shared with `event_notice_recipients` above: `going` plus `interested`,
 * minus deleted accounts, which is exactly who a cancellation notice goes to. `17` §2 made
 * that argument for broadcasts ("the number a leader approved and the number that receives
 * cannot drift") and it applies harder here, because the number is on a confirmation screen
 * for an action that cannot be taken back.
 *
 * Granted to `authenticated` rather than service_role alone, because a leader is deciding
 * whether to cancel and needs to see it. It discloses nothing they cannot already read: the
 * `can_moderate_branch` gate is the same one `rsvps`' own SELECT policy applies, so a leader
 * asking about another branch's event gets zeroes rather than a count.
 */
create function public.event_rsvp_audience(event uuid)
returns table (going integer, interested integer, reachable integer)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    count(*) filter (where r.status = 'going')::integer,
    count(*) filter (where r.status = 'interested')::integer,
    count(*)::integer
  from public.events e
  join public.rsvps r on r.event_id = e.id and r.status <> 'cancelled'
  join public.profiles p on p.id = r.profile_id and p.deleted_at is null
  where e.id = event
    and public.can_moderate_branch(e.branch_id);
$function$;

revoke all on function public.event_rsvp_audience(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.event_rsvp_audience(uuid) to authenticated, service_role;

comment on function public.event_rsvp_audience is
  'Going, interested, and how many a change would actually reach (docs/spec/11, `17` §3). The same set `event_notice_recipients` announces to, so the count on the cancel screen and the audience of the notice are one definition. Scoped by can_moderate_branch: another branch''s event answers zero.';

/**
 * How many people POSTING an event would reach, for the form that is about to post one.
 *
 * The counterpart of `event_rsvp_audience` for an event that does not exist yet, and the
 * same argument as `broadcast_recipient_count`: the number a leader is deciding against has
 * to be the number that receives, or the sentence above the form is a guess wearing a digit.
 * So the pref gate is applied HERE, exactly as `event_notice_recipients`' posted arm applies
 * it, rather than in the dashboard, which cannot see another member's preferences at all
 * (`notification_prefs` is the member's own row and RLS says so).
 *
 * NULL means ministry-wide, the same convention as `events.branch_id`, and it counts every
 * live member with ministry announcements on. Gated on `can_moderate_branch`, so a leader
 * cannot size another branch or the whole ministry.
 *
 * The argument carries a DEFAULT so a caller can omit it, which is how "ministry-wide"
 * travels from a typed client: supabase-js generates every function argument as non-null,
 * so an omitted argument is the only honest way to say NULL without a cast (the same reason
 * `create_broadcast_draft`'s optional columns default rather than accept null).
 */
create function public.event_posting_audience(branch uuid default null)
returns integer
language sql
stable
security definer
set search_path = ''
as $function$
  select case when public.can_moderate_branch(branch) then (
    select count(*)::integer
    from public.profiles p
    left join public.notification_prefs np on np.profile_id = p.id
    where p.deleted_at is null
      and (branch is null or p.branch_id = branch)
      and case
        when branch is null then coalesce(np.ministry_announcements, true)
        else coalesce(np.branch_updates, true)
      end
  ) else 0 end;
$function$;

revoke all on function public.event_posting_audience(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.event_posting_audience(uuid) to authenticated, service_role;

comment on function public.event_posting_audience is
  'How many members a newly posted event would notify: the branch (or everyone, for NULL), minus anyone who switched that tier off (docs/spec/15). The same gate event_notice_recipients applies, so the number on the form is the number that receives. Zero for a branch the caller does not moderate.';

-- --- 6. the schedule ------------------------------------------------------------------
--
-- Every minute, like the fan-out, and for the same reason: a cancellation is time-critical
-- news, and the settle window already spends two minutes of the budget deliberately. An
-- unarmed database (no vault entries) no-ops, so this migration is identical in every
-- environment (ADR 0016).

select cron.schedule(
  'event-notices',
  '* * * * *',
  $cron$select jobs.invoke_edge_function('event-notices')$cron$
);

commit;
