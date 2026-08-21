-- W3.5 slice 5b: the ministry has one headquarters, and moving it is its own act
-- (docs/spec/17 §5, `02` §branches).
--
-- `is_hq` has been a plain boolean since `20260719200021` with nothing keeping it unique,
-- and until now that was harmless because nothing could write it: `branches` had no client
-- write path at all. Slice 5a gave admins one, and slice 5b's frames make HQ movable
-- (decided with Ayo 2026-08-20), so the gap becomes reachable in the same change that makes
-- it matter.
--
-- WHAT TWO HEADQUARTERS WOULD DO, since "at most one" reads like tidiness until you look:
--   * `events_insert_guard` defaults a ministry-wide event's timezone from
--     `where b.is_hq order by b."order" limit 1`, so a second HQ silently decides what time
--     the whole family gathers, by display order;
--   * `archive_branch` refuses to close HQ, so a second one is a second branch that cannot
--     be closed, for a reason nobody wrote down;
--   * the app draws a gold HQ badge in the branch switcher and the onboarding list
--     (`BranchSwitchSheet.tsx`, `BranchRow.tsx`), so members would see two.
-- None of those raises an error. They are all "the wrong answer, confidently", which is the
-- class of bug this schema puts in the database rather than in a review checklist.
--
-- Rollback (roll forward): a compensating migration drops the function and the index and
-- restores `is_hq` to both column grants.

begin;

set local lock_timeout = '3s';

-- ---------------------------------------------------------------------------
-- 1. At most one
-- ---------------------------------------------------------------------------
-- A partial unique index on a CONSTANT: every row with `is_hq` true indexes the same key,
-- so the second one collides. It cannot be a UNIQUE CONSTRAINT, because constraints have no
-- WHERE clause, and a constraint over `is_hq` alone would forbid a second branch that is
-- NOT the headquarters, which is every other branch there is.
--
-- The consequence worth knowing is in the function below: a partial unique INDEX is checked
-- as each row is written, and only a deferrable CONSTRAINT can wait until commit. So the
-- move has to clear before it sets, and cannot be one clever statement.

create unique index branches_one_headquarters_idx
  on public.branches ((true))
  where is_hq;

comment on index public.branches_one_headquarters_idx is
  'At most one branch is the headquarters (docs/spec/17 §5). Partial on is_hq and unique on a constant, because a constraint cannot carry a WHERE clause.';

-- ---------------------------------------------------------------------------
-- 2. And nobody writes it directly
-- ---------------------------------------------------------------------------
-- Out of both column grants slice 5a wrote, for the same reason `status` was never in them:
-- the act has preconditions and a companion write, so it belongs to a function rather than
-- to whoever remembers both halves. A client that names the column gets `42501` at the grant
-- layer, before RLS is consulted.
--
-- INSERT too, not just UPDATE: a branch is never BORN the headquarters. The ADD BRANCH frame
-- says so in as many words ("headquarters and closing are decided from a branch's own page,
-- not here"), and the column already defaults to false.

revoke insert (is_hq), update (is_hq) on public.branches from authenticated;

-- ---------------------------------------------------------------------------
-- 3. Moving it
-- ---------------------------------------------------------------------------
/**
 * Hand the headquarters to another branch.
 *
 * ADMIN AT aal2, like every other act in this module, and the dashboard asks for a FRESH
 * authenticator code on top of the session (`verifyStepUp`, the pattern `set_member_role`
 * established). The line 5b draws, and it is worth stating because it is a judgement rather
 * than a rule: an ordinary branch edit rides the sign-in, and the two acts that reach every
 * member ask again. Those two are closing a branch and this. Re-challenging a name change or
 * an address fix would be the "queues stop getting cleared" mistake in a different module.
 *
 * TWO STATEMENTS, CLEAR THEN SET, and not one `set is_hq = (id = branch)`. The unique index
 * above is checked per row as the statement runs, and a single UPDATE gives no promise about
 * which row it reaches first: if it sets the new headquarters before clearing the old, the
 * index refuses and the act fails for a reason that has nothing to do with the caller.
 * Inside one function they are one transaction, so no reader ever sees zero or two.
 *
 * AN ARCHIVED BRANCH CANNOT TAKE IT. HQ is where members are asked to move when a branch
 * closes, so a closed branch holding it would send them somewhere that is not accepting
 * anybody, and `archive_branch` would then refuse to close the branch they were pointed at.
 */
create function public.set_headquarters(branch uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  subject record;
begin
  if not public.caller_is_admin_live() then
    raise exception 'only an admin may move the headquarters'
      using errcode = 'insufficient_privilege';
  end if;
  if coalesce(public.jwt_claim('aal'), '') <> 'aal2' then
    raise exception 'moving the headquarters needs a fresh code from your authenticator'
      using errcode = 'insufficient_privilege';
  end if;

  select b.status, b.is_hq into subject
    from public.branches b where b.id = branch;

  if not found then
    raise exception 'no such branch' using errcode = 'no_data_found';
  end if;
  if subject.is_hq then
    raise exception 'that branch is already the headquarters'
      using errcode = 'check_violation';
  end if;
  if subject.status <> 'active' then
    raise exception 'a closed branch cannot be the headquarters'
      using errcode = 'check_violation';
  end if;

  update public.branches set is_hq = false where is_hq;
  update public.branches set is_hq = true where id = branch;
end;
$function$;

comment on function public.set_headquarters is
  'Move the ministry headquarters (docs/spec/17 §5, decided with Ayo 2026-08-20). Admin at aal2; the dashboard adds a fresh authenticator code. Clears before setting, because branches_one_headquarters_idx is checked per row and a single statement gives no ordering promise.';

revoke all on function public.set_headquarters(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.set_headquarters(uuid) to authenticated;

commit;
