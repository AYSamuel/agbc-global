/**
 * A branch that has closed takes no more attendance (W3.5 slice 5c, follow-up).
 *
 * `02` has said since the enum was written that an archived branch's services stop. That
 * turned out to be true of exactly one caller: `service-reminders` joins on
 * `branches.status`, so the reminders stopped. NOTHING ELSE ASKED. `archive_branch()` does
 * not touch `branch_services` (there is no `active` column to clear), the app's services
 * query carries no status filter, and this guard has never read the branch at all beyond its
 * timezone. So on the device, a member whose branch had closed was still shown "THIS SUNDAY ·
 * Sunday Worship · 11:00 AM" with a check-in beneath it, one card under a banner saying the
 * branch had closed.
 *
 * The screen is fixed where it is drawn. This is the half that has to hold anyway, because
 * the client is never the mechanism: a stale app that has not refetched, a deep link, and
 * above all an OFFLINE CHECK-IN QUEUED BEFORE THE CLOSURE and replayed after it all arrive
 * here with a perfectly well-formed row. Attendance is a fact about a gathering that
 * happened; a branch that has stopped meeting holds none.
 *
 * ONLY THE MEMBER PATH IS REFUSED, which is why the check sits under `actor is not null`
 * rather than at the top. A trusted writer with no user context (the seeds, a backfill, the
 * counter reconciliation) is stating history rather than claiming to be somewhere, and a
 * closure that happens today must not make yesterday's attendance unwritable.
 *
 * The guard runs as the INVOKING role, so this read needs `authenticated` to hold SELECT on
 * `branches`: it does, granted by name in `20260820180000` when that table's ambient
 * privileges were replaced with explicit ones. A definer wrapper would work too and is worse,
 * because it would hide exactly that dependency.
 */
create or replace function public.attendance_insert_guard()
returns trigger
language plpgsql
as $$
declare
  actor uuid := (select auth.uid());
  zone text;
  state public.branch_status;
  basis timestamptz;
begin
  if actor is null then
    -- Trusted writer. It may state the day outright; otherwise derive it as usual.
    if new.service_date is not null then
      return new;
    end if;
  else
    new.profile_id := actor;
  end if;

  select b.timezone, b.status into zone, state
    from public.branches b where b.id = new.branch_id;

  if zone is null then
    -- No such branch: the foreign key raises the real error, and inventing a date here would
    -- only hide it.
    return new;
  end if;

  -- A member cannot arrive somewhere that has stopped meeting. `check_violation` rather than
  -- `insufficient_privilege` on purpose: this is not about who they are, and the app reads
  -- the two apart when it decides whether to say "you may not" or "there is nothing here".
  if actor is not null and state <> 'active' then
    raise exception 'that branch has closed, so there is no gathering to check in to'
      using errcode = 'check_violation';
  end if;

  basis := coalesce(new.client_taken_at, now());
  if basis > now() or basis < now() - interval '72 hours' then
    basis := now();
  end if;
  new.service_date := public.attendance_service_date(basis, zone);
  return new;
end;
$$;

comment on function public.attendance_insert_guard is
  'Stamps the service date in the branch''s own timezone and forces profile_id to the caller. Refuses a member''s check-in at an archived branch (W3.5 slice 5c): a branch that has stopped meeting holds no gathering, and an offline check-in queued before the closure must not land after it. Trusted writers with no user context are stating history and are not refused.';
