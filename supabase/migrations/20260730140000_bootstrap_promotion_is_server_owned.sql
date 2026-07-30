-- The bootstrap promotion is server-owned, and the audit log has to say so (ADR 0015 §8).
--
-- DEFECT, found 2026-07-30 while preparing to add a second admin. `profiles_bootstrap_admin`
-- runs INSIDE the new member's own transaction, under their own uid, so `auth.uid()` inside
-- `profiles_audit` returns THEM. Measured on the live local stack: creating a profile whose
-- email is on the allowlist writes
--
--   action=role_changed  actor_id=<the new admin>  target_id=<the new admin>
--   before={"role":"member"}  after={"role":"admin"}
--
-- The audit log therefore records the single most sensitive grant in the system as a SELF
-- PROMOTION, which is the one thing every other rule in this feature exists to forbid. Ask it
-- the question it was built to answer, "who made this person an admin", and it answers "they
-- did". That is false: the allowlist in `bootstrap_admins`, reviewed in git, granted it.
--
-- Nothing was exploitable. `profiles_guard` still refuses an owner writing their own role and
-- the bootstrap flag is the documented exception (`015`). The bug is in the RECORD, not the
-- rule, which is exactly the class of bug an audit log cannot afford: a wrong entry is worse
-- than a missing one, because it will be believed.
--
-- Why nobody caught it: `015` predates the audit table entirely (PR #104 landed after it), so
-- no test asserted the attribution of this path. `019` asserts attribution for an ordinary
-- role change, where `auth.uid()` genuinely IS the actor. pgTAP `021` closes the gap.
--
-- THE FIX uses a convention the table already documents rather than inventing one. From
-- `20260729220000_privileged_actions.sql`: "Null actor means server-owned (a migration, a job)
-- or an erased account". A bootstrap promotion is precisely a migration granting a role, so a
-- null actor is not an absence of information, it is the correct answer. Who authorised it is
-- answerable from `bootstrap_admins` and the git history of the migration that added the row,
-- which is a better audit trail than a uuid could be. `target_id` still says who was promoted.
--
-- Deliberately narrow: only the bootstrap path changes. Every other role change, including
-- both W2.7 RPCs, still records the human who acted, because there the caller IS the actor.
--
-- Rollback (roll forward): a compensating migration restores the definition in
-- `20260729220000_privileged_actions.sql`. No data migration is needed for existing rows; the
-- only one that could exist is the first admin's, and its `actor_id` is left as history rather
-- than rewritten, because `privileged_actions` is append-only by design and reaching for the
-- maintenance flag to tidy a cosmetic row would be exactly the wrong precedent.

-- Taken verbatim from pg_get_functiondef against the live stack, with ONE change, marked.
CREATE OR REPLACE FUNCTION public.profiles_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  -- THE ONLY CHANGE IN THIS MIGRATION. The bootstrap promotion carries the new member's uid
  -- because it runs inside their transaction, so auth.uid() names the SUBJECT of the grant
  -- rather than its author. Null is the table's documented value for a server-owned action,
  -- and a migration handing out a role is server-owned. Read the header for the measurement.
  actor uuid := case
    when public.in_bootstrap_promote() then null
    else (select auth.uid())
  end;
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
        actor, new.id, 'role_changed',
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
      actor, old.id, 'role_changed',
      jsonb_build_object('role', old.role),
      jsonb_build_object('role', new.role)
    );
  end if;

  if new.branch_id is distinct from old.branch_id then
    insert into public.privileged_actions (actor_id, target_id, action, before, after)
    values (
      actor, old.id, 'branch_changed',
      jsonb_build_object('branch_id', old.branch_id),
      jsonb_build_object('branch_id', new.branch_id)
    );
  end if;

  return null;
end;
$function$;

comment on function public.profiles_audit is
  'Writes privileged_actions rows for any role or branch change, on EVERY path (ADR 0015): the slice RPCs, a migration, an incident fix, the bootstrap promotion, an admin setting their own branch. Auditing lives here rather than in each caller so it cannot be forgotten. The bootstrap promotion records a NULL actor, because it runs under the new member''s uid but is authorised by the allowlist in git, not by them (fixed 2026-07-30, pgTAP 021).';
