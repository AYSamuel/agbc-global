-- The privileged-action log (docs/spec/17 §Platform, ADR 0015, W2.7 people slice).
--
-- `17` has always required that "every privileged action [is] audit-logged (actor, action,
-- target, timestamp, immutable)". Until now the only thing resembling this was
-- `moderated_by` / `moderated_at` on the content rows themselves, which answers "who last
-- touched this row" and cannot answer "who made this person a leader in March".
--
-- Two design choices here are the whole point, and both are about making the guarantee
-- structural rather than remembered:
--
-- 1. **A trigger writes the rows, not the callers.** Every path that changes a role or a
--    branch is audited: the RPCs built in this slice, a migration, a hand-typed fix during
--    an incident, the bootstrap promotion, the admin self-branch carve-out. A caller that
--    has to remember to write its own audit row is a caller that will eventually forget,
--    and the forgotten case will be the one someone asks about.
--
-- 2. **Append-only is enforced by a trigger, not just by absent policies.** A missing
--    UPDATE policy is not a refusal: `service_role` carries BYPASSRLS, so anything holding
--    that key could rewrite history freely. The trigger fires regardless of grants, RLS or
--    who is connected.
--
-- Retention: 7 years, per `20`'s schedule. Deliberately NOT enforced by a job yet: nothing
-- approaches 7 years for a long time, and a purge job with no rows to purge is code that
-- rots untested. `21` §5 carries the pointer.
--
-- Not partitioned. Privileged actions are a handful per month, so time partitioning buys
-- nothing today. The ceiling worth naming (`database.md` asks for one): revisit the moment
-- moderation decisions migrate onto this table, which turns it into thousands of rows a
-- year rather than dozens.
--
-- Rollback (roll forward): a compensating migration drops the two triggers, the table and
-- the enum. Nothing reads it yet.

create type public.privileged_action as enum (
  'role_changed',
  'branch_changed',
  'branch_request_rejected'
);

comment on type public.privileged_action is
  'Privileged actions (ADR 0015). Note what is NOT here: there is no branch_request_approved. An approved request IS a branch_changed row carrying the request that caused it, so recording both would be two rows for one event and an invariant to keep in step. A REJECTION needs its own value precisely because it changes no profile and so fires no trigger.';

create table public.privileged_actions (
  -- Internal and append-only, so a monotonic key is right and the project's
  -- gen_random_uuid() question does not arise (`database.md`: bigint internally is a valid
  -- pattern where there is no external id). Nothing outside the database cites these.
  id bigint generated always as identity primary key,

  -- Both nullable and both ON DELETE SET NULL. Null actor means server-owned (a migration,
  -- a job) or an erased account; null target with target_redacted_at set means erased.
  actor_id uuid references public.profiles (id) on delete set null,
  target_id uuid references public.profiles (id) on delete set null,
  target_redacted_at timestamptz,

  action public.privileged_action not null,

  -- Only the fields that changed. Read as a unit, never joined, which is the legitimate
  -- use for JSON per `database.md`.
  before jsonb,
  after jsonb,

  -- The private ministry record for a refusal. Lives HERE rather than on the request row,
  -- because a column on a row the subject can read is disclosed to the subject: RLS is
  -- row-level and hides no fields (ADR 0015). Admin-readable only.
  note text,

  occurred_at timestamptz not null default now()
);

comment on table public.privileged_actions is
  'Append-only log of privileged actions (docs/spec/17, ADR 0015). Written by triggers, never by callers. Immutable except for erasure redaction. Admin-read-only. Retention 7 years (`20`).';
comment on column public.privileged_actions.target_redacted_at is
  'Set by the deletion job when it drops an erased member''s identity while keeping the governance record (`20`). Distinguishes "identity removed" from "never had a target".';
comment on column public.privileged_actions.note is
  'Private ministry record, e.g. why a branch request was refused. NEVER shown to the member and never readable by a leader; contrast rejection_reason on content, which is author-facing.';

-- Both FK columns indexed (`database.md`), leading with the column each question starts
-- from: "what happened to this person" and "what has this person done".
create index privileged_actions_target_idx
  on public.privileged_actions (target_id, occurred_at desc);
create index privileged_actions_actor_idx
  on public.privileged_actions (actor_id, occurred_at desc);
create index privileged_actions_action_idx
  on public.privileged_actions (action, occurred_at desc);

alter table public.privileged_actions enable row level security;
alter table public.privileged_actions force row level security;

-- The REVOKE is not redundant, and this is the second table to need the note (`015` test 4,
-- issue #96). Supabase's project bootstrap sets ALTER DEFAULT PRIVILEGES ... GRANT ALL ON
-- TABLES TO anon, authenticated, service_role, so a new table in `public` arrives with full
-- privileges for every API role: "we granted nothing" means "everything was granted for
-- us". Start from zero, then hand back exactly one verb to exactly one role.
revoke all on public.privileged_actions from anon, authenticated, service_role;
grant select on public.privileged_actions to authenticated;

-- No INSERT grant to anybody. Rows arrive only through the SECURITY DEFINER trigger below
-- and through migration connections.
create policy "admins read the audit log"
  on public.privileged_actions
  for select
  using (public.caller_is_admin_live());

-- --- append-only -----------------------------------------------------------------------

-- Explicit intent beats inferring it, the same reasoning as in_bootstrap_promote() and
-- in_counter_write(). Only the erasure and retention paths set this.
create function public.in_audit_maintenance()
returns boolean
language sql
stable
as $function$
  select coalesce(current_setting('agbc.audit_maintenance', true), 'off') = 'on';
$function$;

comment on function public.in_audit_maintenance is
  'True inside a transaction that has opted into audit maintenance (erasure redaction, retention purge). Everything else finds privileged_actions append-only.';

create function public.privileged_actions_append_only()
returns trigger
language plpgsql
as $function$
begin
  if not public.in_audit_maintenance() then
    raise exception 'privileged_actions is append-only'
      using errcode = 'insufficient_privilege';
  end if;

  -- Maintenance is allowed to REDACT. It is not allowed to rewrite the record: the whole
  -- value of this table is that the account under investigation cannot edit it, and
  -- "maintenance" must not become a hole that swallows that. Only the identity-bearing
  -- fields may move.
  --
  -- `note` is deliberately absent from this list, and that is an OPEN POLICY QUESTION, not
  -- an oversight. It is free text a leader typed, so it may name the member: leaving it
  -- untouched on erasure would keep identifying data the privacy notice says we dropped,
  -- while wiping it would let someone erase a safeguarding record by closing their account.
  -- Safeguarding records normally survive an erasure request under their own lawful basis,
  -- so the likely answer is that it stays and `20` says so. Permitting either here means
  -- whichever way Ayo decides needs no second migration.
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
       or new.actor_id is distinct from old.actor_id
       or new.action is distinct from old.action
       or new.before is distinct from old.before
       or new.after is distinct from old.after
       or new.occurred_at is distinct from old.occurred_at then
      raise exception 'audit maintenance may redact a target, never rewrite the record'
        using errcode = 'insufficient_privilege';
    end if;
    -- Redaction CLEARS the target. It must never point the record at a different person,
    -- which would turn a tamper-proof log into a way to reassign blame. Note the shape:
    -- "changed to something non-null", not "is non-null". The stricter version forced every
    -- maintenance update to null the target, so a note-only redaction was impossible and
    -- this check masked the rewrite check above it (caught by 019 test 14).
    if new.target_id is distinct from old.target_id and new.target_id is not null then
      raise exception 'redaction clears target_id rather than replacing it'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  return old;
end;
$function$;

create trigger privileged_actions_append_only
  before update or delete on public.privileged_actions
  for each row execute function public.privileged_actions_append_only();

-- --- the writer ------------------------------------------------------------------------

-- SECURITY DEFINER because the INSERT grant was revoked above: a member completing
-- onboarding, or an admin acting through an RPC, must be able to CAUSE an audit row
-- without being able to write one directly.
--
-- auth.uid() still reads the real caller inside a SECURITY DEFINER function (definer
-- rights change privileges, not the JWT context), so the actor recorded is the human who
-- did it, not postgres.
create function public.profiles_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  -- A profile BORN privileged. In production this cannot come from a member: the INSERT
  -- policy pins `role = 'member'`. It can come from a migration, a seed, or a hand-typed
  -- fix during an incident, and those are exactly the grants most worth having a record of.
  -- Without this branch, inserting a leader directly leaves no trace anywhere, which is the
  -- hole this table exists to close (found 2026-07-29: the dev seeds do precisely this).
  if tg_op = 'INSERT' then
    if new.role <> 'member' then
      insert into public.privileged_actions (actor_id, target_id, action, before, after)
      values (
        (select auth.uid()), new.id, 'role_changed',
        null,
        jsonb_build_object('role', new.role)
      );
    end if;
    -- Branch on insert is deliberately NOT audited. Choosing a home branch at onboarding is
    -- an ordinary member act, not a privileged one, so auditing it would write a row for
    -- every person who ever joins and bury the grants this log exists to surface.
    return null;
  end if;

  if new.role is distinct from old.role then
    insert into public.privileged_actions (actor_id, target_id, action, before, after)
    values (
      (select auth.uid()), old.id, 'role_changed',
      jsonb_build_object('role', old.role),
      jsonb_build_object('role', new.role)
    );
  end if;

  if new.branch_id is distinct from old.branch_id then
    insert into public.privileged_actions (actor_id, target_id, action, before, after)
    values (
      (select auth.uid()), old.id, 'branch_changed',
      jsonb_build_object('branch_id', old.branch_id),
      jsonb_build_object('branch_id', new.branch_id)
    );
  end if;

  return null;
end;
$function$;

comment on function public.profiles_audit is
  'Writes privileged_actions rows for any role or branch change, on EVERY path (ADR 0015): the slice RPCs, a migration, an incident fix, the bootstrap promotion, an admin setting their own branch. Auditing lives here rather than in each caller so it cannot be forgotten.';

create trigger profiles_audit
  after insert or update on public.profiles
  for each row execute function public.profiles_audit();

-- No EXECUTE revokes on the three functions above, deliberately, matching the two sibling
-- flag helpers (`in_bootstrap_promote`, `in_counter_write`) which are PUBLIC-executable.
--
-- `in_audit_maintenance()` leaks nothing: it reports whether a flag is set in the CALLER'S
-- OWN transaction, and grants nothing by answering. The two trigger functions cannot be
-- called usefully at all outside a trigger ("trigger functions can only be called as
-- triggers").
--
-- Revoking would also be actively harmful here. The append-only trigger runs as the
-- invoking role and calls `in_audit_maintenance()`, and on this local Postgres a role
-- invoking a function it lacks EXECUTE on takes the backend down rather than raising a
-- permission error. Narrow EXECUTE grants belong on functions that DO something
-- privileged, which is why `custom_access_token`, `sync_upsert_sermons` and
-- `record_photo_validation` have them and these do not.
