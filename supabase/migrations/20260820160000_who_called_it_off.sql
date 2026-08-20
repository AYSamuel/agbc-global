-- W3.5 slice 4 follow-up: an event's status change gets a name against it (docs/spec/11,
-- `17` §3, ADR 0015).
--
-- Cancelling reaches everyone holding an RSVP, and until now the row recorded that it had
-- happened and never by whose hand. That was flagged when the slice landed rather than
-- discovered later, and this is the fix.
--
-- WHY A COLUMN RATHER THAN `privileged_actions`. ADR 0015 puts privileged actions in a
-- ledger written by a trigger, and this one does not go there for the reason W3.5 slice 1
-- gave when a broadcast approval did not either: that table is profile-oriented (`actor_id`
-- and `target_id` both reference `profiles`) and the subject of this action is an EVENT.
-- Forcing it in would mean a row whose target is null and whose meaning lives entirely in a
-- JSON blob, which is a worse record than two columns on the row itself.
--
-- SERVER-OWNED, exactly like the announcement bookkeeping beside it: the guard writes both
-- columns from `auth.uid()` and restores them for any caller who tries to set them, because
-- a leader who could write "cancelled by somebody else" could put a name on an act that was
-- not theirs. A trusted caller (a seed, a job, pgTAP) has no `auth.uid()` and leaves them
-- null, which reads as "the server did it" and is true.
--
-- ONLY ON A STATUS CHANGE. Moving an event is a plan change and already tells the people
-- affected; who typed it is not something anybody has needed. Cancelling and reinstating
-- are the two acts with a blast radius, so they are the two that carry a name.
--
-- Rollback (roll forward): a compensating migration restores the previous guard and drops
-- the two columns. Nothing else reads them.

begin;

set local lock_timeout = '3s';

alter table public.events
  add column status_changed_by uuid references public.profiles (id) on delete set null,
  add column status_changed_at timestamptz;

comment on column public.events.status_changed_by is
  'Who cancelled this event, or put it back on (docs/spec/17 §3). Server-written from auth.uid() by events_update_guard; NULL means a trusted caller with no user context (a seed, a job) or an account since deleted. Not in privileged_actions because that ledger is profile-oriented and this action has no profile target.';
comment on column public.events.status_changed_at is
  'When that happened. Distinct from updated_at, which moves on every edit including the ones nobody hears about.';

-- The FK gets its covering index, per the conventions in `02`.
create index events_status_changed_by_idx
  on public.events (status_changed_by)
  where status_changed_by is not null;

/**
 * The guard, with one more thing to record.
 *
 * Everything else is unchanged from 20260820120000; the addition is the four lines that
 * stamp the actor when `status` moves, and the two that stop a writer stamping them
 * themselves.
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
    -- the server's own record, and so is whose hand did it.
    new.announced_status := old.announced_status;
    new.announced_starts_at_local := old.announced_starts_at_local;
    new.announced_location := old.announced_location;
    new.notice_revision := old.notice_revision;
    new.status_changed_by := old.status_changed_by;
    new.status_changed_at := old.status_changed_at;
  end if;

  -- THE PLAN, and nothing else (docs/spec/11: "changing time or venue"). `timezone` is here
  -- because a zone change moves the instant even when the wall clock does not;
  -- `ends_at_local`, `description`, `title` and `rsvp_enabled` are deliberately not.
  if new.status is distinct from old.status
     or new.starts_at_local is distinct from old.starts_at_local
     or new.timezone is distinct from old.timezone
     or new.location is distinct from old.location then
    new.notice_revision := new.notice_revision + 1;
  end if;

  -- The two acts with a blast radius carry a name; an edit does not.
  if new.status is distinct from old.status then
    new.status_changed_by := (select auth.uid());
    new.status_changed_at := now();
  end if;

  new.updated_at := now();
  return new;
end;
$function$;

commit;
