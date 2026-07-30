-- Deciding a branch request (ADR 0015, W2.7 people slice, docs/spec/17 §People).
--
-- The destination decides. `022` built the record; this is the only thing that may change its
-- status, because the status change and the profile move have to happen together or not at
-- all. A half-applied move is a member whose request says approved and whose branch did not
-- change, or worse the reverse, and nothing in the app would notice.
--
-- WHY SECURITY DEFINER, again: RLS has no path for a LEADER to write another member's
-- profile, and should not get one. `set_member_role` needed the same treatment for the same
-- reason. The authority is checked inside the function.
--
-- THE 48-HOUR FALLBACK (decision 5) is what makes "usually within 48 hours" honest rather
-- than dependent on one person's week. It is an expectation, never a hold: the move lands the
-- moment it is approved. What the 48 hours actually gates is the ADMIN, not the member. A
-- destination leader may decide immediately, always. An admin may decide immediately when the
-- destination has no leader at all (true of every branch today), and otherwise waits 48 hours
-- so the branch's own leader gets first refusal on their own queue.
--
-- THE REJECTION IS THE CASE WORTH READING TWICE. It changes no profile, so `profiles_audit`
-- never fires for it, so it is the one decision that would leave no trace if this function
-- did not write the row itself. It is also the case where the note matters most, because the
-- member is told nothing (decision 3) and the ministry record is the only place the reason
-- exists. Both halves are here rather than remembered by a caller.
--
-- THE APPROVAL'S AUDIT ROW COMES FROM THE TRIGGER, deliberately, and that creates one problem
-- this migration has to solve. `privileged_actions.request_id` needs to be on that row, but
-- the trigger writes it and knows nothing about requests. The options were to have this
-- function insert its own duplicate row (rejected: the enum comment in
-- `20260729220000_privileged_actions.sql` says plainly that an approved request IS a
-- branch_changed row carrying its request, and recording both would be two rows for one event
-- and an invariant to keep in step), or to have the trigger infer the request (rejected: the
-- house rule is that explicit intent beats inferring it). So the caller states it, through the
-- same transaction-local GUC pattern as `in_bootstrap_promote()` and
-- `in_privileged_profile_write()`. One mechanism, used a third time.
--
-- Rollback (roll forward): a compensating migration drops this function and
-- `current_audit_request()`, and restores `profiles_audit` to the definition in
-- `20260730140000_bootstrap_promotion_is_server_owned.sql`.

-- The request currently being applied, for the audit trigger to stamp onto its rows. Null
-- outside a decision, which is every other path that changes a role or a branch.
create function public.current_audit_request()
returns uuid
language sql
stable
as $function$
  select nullif(current_setting('agbc.audit_request_id', true), '')::uuid;
$function$;

comment on function public.current_audit_request is
  'The branch request being applied in this transaction, or null. Set only by decide_branch_request so the audit trigger can link its row to the request that caused it (ADR 0015).';

-- No EXECUTE revoke, matching the sibling flag helpers: it reports a value set in the
-- caller's OWN transaction and grants nothing by answering, and profiles_audit calls it.

-- --- teach the audit trigger about the request --------------------------------------------

-- Taken verbatim from pg_get_functiondef, with ONE change, marked: `request_id` is now
-- carried onto every row it writes.
CREATE OR REPLACE FUNCTION public.profiles_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  -- The bootstrap promotion carries the new member's uid because it runs inside their
  -- transaction, so auth.uid() names the SUBJECT of the grant rather than its author. Null is
  -- the table's documented value for a server-owned action, and a migration handing out a
  -- role is server-owned (fixed 2026-07-30, pgTAP 021).
  actor uuid := case
    when public.in_bootstrap_promote() then null
    else (select auth.uid())
  end;
  -- THE ONLY CHANGE IN THIS MIGRATION. Null on every path except a branch decision, which is
  -- the only caller that sets the GUC.
  linked_request uuid := public.current_audit_request();
begin
  -- A profile BORN privileged. In production this cannot come from a member: the INSERT
  -- policy pins `role = 'member'`. It can come from a migration, a seed, or a hand-typed
  -- fix during an incident, and those are exactly the grants most worth having a record of.
  if tg_op = 'INSERT' then
    if new.role <> 'member' then
      insert into public.privileged_actions
        (actor_id, target_id, action, before, after, request_id)
      values (
        actor, new.id, 'role_changed',
        null,
        jsonb_build_object('role', new.role),
        linked_request
      );
    end if;
    -- Branch on insert is deliberately NOT audited. Choosing a home branch at onboarding is
    -- an ordinary member act, not a privileged one, so auditing it would write a row for
    -- every person who ever joins and bury the grants this log exists to surface.
    return null;
  end if;

  if new.role is distinct from old.role then
    insert into public.privileged_actions
      (actor_id, target_id, action, before, after, request_id)
    values (
      actor, old.id, 'role_changed',
      jsonb_build_object('role', old.role),
      jsonb_build_object('role', new.role),
      linked_request
    );
  end if;

  if new.branch_id is distinct from old.branch_id then
    insert into public.privileged_actions
      (actor_id, target_id, action, before, after, request_id)
    values (
      actor, old.id, 'branch_changed',
      jsonb_build_object('branch_id', old.branch_id),
      jsonb_build_object('branch_id', new.branch_id),
      linked_request
    );
  end if;

  return null;
end;
$function$;

-- --- the decision --------------------------------------------------------------------------

create function public.decide_branch_request(
  request uuid,
  approve boolean,
  note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  req record;
  caller uuid := (select auth.uid());
  caller_role public.profile_role;
  caller_branch uuid;
  caller_is_admin boolean := public.caller_is_admin_live();
  decides_destination boolean;
  destination_has_leader boolean;
  clean_note text := btrim(coalesce(note, ''));
  touched integer;
begin
  select r.profile_id, r.to_branch_id, r.status, r.created_at
    into req
    from public.branch_change_requests r
   where r.id = request;

  if not found then
    raise exception 'no such request' using errcode = 'no_data_found';
  end if;
  if req.status <> 'pending' then
    raise exception 'this request has already been decided'
      using errcode = 'check_violation';
  end if;

  select p.role, p.branch_id into caller_role, caller_branch
    from public.profiles p
   where p.id = caller and p.deleted_at is null;

  -- THE DESTINATION, NOT THE SOURCE (decision 1). The leader of the branch being LEFT has no
  -- say here and no UPDATE policy on the table either; they are told afterwards.
  decides_destination :=
    caller_role = 'leader' and caller_branch = req.to_branch_id;

  if not (decides_destination or caller_is_admin) then
    raise exception 'only the branch being joined, or an admin, decides this'
      using errcode = 'insufficient_privilege';
  end if;

  -- The admin fallback. Ordered after the authority check so a member probing this endpoint
  -- learns they may not, rather than learning how long a queue has been waiting.
  if caller_is_admin and not decides_destination then
    select exists (
      select 1 from public.profiles p
       where p.role = 'leader'
         and p.branch_id = req.to_branch_id
         and p.deleted_at is null
    ) into destination_has_leader;

    if destination_has_leader and req.created_at > now() - interval '48 hours' then
      raise exception 'the branch leader has 48 hours to decide this first'
        using errcode = 'check_violation';
    end if;
  end if;

  -- A refusal without a reason is not a ministry record, and the member is told nothing
  -- (decision 3), so this note is the only place the reason will ever exist.
  if not approve and clean_note = '' then
    raise exception 'a refusal needs a reason for the ministry record'
      using errcode = 'check_violation';
  end if;
  -- Refused rather than silently dropped: the dashboard only offers the note on the reject
  -- path, so a note arriving with an approval is a bug in the caller, and swallowing it would
  -- lose something a leader took the trouble to write.
  if approve and clean_note <> '' then
    raise exception 'a note is recorded for a refusal, not an approval'
      using errcode = 'check_violation';
  end if;

  if approve then
    -- ONE statement for both columns so the audit trigger sees one change per fact, and both
    -- rows carry the request that caused them.
    --
    -- A LEADER'S APPROVED MOVE DROPS THEM TO MEMBER (decision 4): leadership is authority over
    -- one branch's content and does not travel. Granting the new branch's leadership instead
    -- is a separate, deliberate act through set_member_role, which sets role and branch in one
    -- call; that is what "in the same action" means, not a parameter here.
    perform set_config('agbc.privileged_profile_write', 'on', true);
    perform set_config('agbc.audit_request_id', request::text, true);

    update public.profiles p
       set branch_id = req.to_branch_id,
           role = case when p.role = 'leader' then 'member' else p.role end
     where p.id = req.profile_id;

    get diagnostics touched = row_count;

    perform set_config('agbc.audit_request_id', '', true);
    perform set_config('agbc.privileged_profile_write', 'off', true);

    -- The same silence PR #101 was written about: every reachable cause is refused above, so
    -- zero rows means an invariant broke underneath us and a 500 is the honest answer.
    if touched <> 1 then
      raise exception 'decide_branch_request moved no profile for %', req.profile_id
        using errcode = 'internal_error';
    end if;

    update public.branch_change_requests
       set status = 'approved'
     where id = request;
  else
    update public.branch_change_requests
       set status = 'rejected'
     where id = request;

    -- THE ROW NO TRIGGER WRITES. A rejection changes no profile, so profiles_audit never
    -- fires, and without this the one decision that most needs a record would leave none.
    insert into public.privileged_actions
      (actor_id, target_id, action, request_id, note)
    values (caller, req.profile_id, 'branch_request_rejected', request, clean_note);
  end if;

  -- decided_at and the refusal of a second decision are enforced by the table's own guard,
  -- so they hold for any future caller too, not only this one.
end;
$function$;

comment on function public.decide_branch_request(uuid, boolean, text) is
  'Approves or refuses a branch request (ADR 0015). The DESTINATION branch decides; an admin is the fallback, immediately when the destination has no leader and after 48 hours when it does. An approval moves the profile and drops a leader to member; a refusal requires a private note and writes the audit row itself, because no trigger fires for it. The decider is recorded only in privileged_actions, never on the request row.';

revoke all on function public.decide_branch_request(uuid, boolean, text)
  from public, anon, authenticated, service_role;
grant execute on function public.decide_branch_request(uuid, boolean, text) to authenticated;
