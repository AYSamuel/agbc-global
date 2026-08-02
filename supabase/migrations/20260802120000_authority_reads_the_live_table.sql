-- Authority reads the live table, everywhere (ADR 0015, docs/spec/17 §Platform).
--
-- ADR 0015 settled this during W2.7: an authorization check must read the CURRENT row in
-- `profiles`, never a claim carried in the caller's token. `caller_is_admin_live()` was
-- written for that decision and the surfaces built since use it. The tables built BEFORE
-- it never got swept, and still authorize with `is_admin()`, which is
-- `jwt_claim('user_role') = 'admin'`.
--
-- What that actually costs, concretely, because "stale claim" understates it:
--
--  1. `jwt_expiry = 3600`. A demoted admin keeps every admin write path for up to an hour
--     after their role changes, because their token still says admin and nothing re-reads
--     the table.
--  2. `is_admin()` never looks at `deleted_at`. A soft-deleted admin keeps them for as long
--     as they hold a token, and re-authenticating is not required to keep one alive.
--
-- The surfaces still on the claim were the config the app reads on launch (`app_config`,
-- including the forced-update floor), the giving configuration, the sermon catalogue, the
-- daily verse that reaches every member of every branch each morning, and the profile
-- invariant guards themselves.
--
-- `profiles` also scoped a leader's read by `jwt_claim('branch_id')`, which is the same
-- shape as the hole PR #101 closed for content moderation: authority derived from a value
-- the token carries rather than from the row.
--
-- WHY A NEW MIGRATION rather than edits to the four that created these policies: those have
-- run against dev and against production. Editing them would leave a freshly built database
-- disagreeing with every existing one, which is the trap `19` names about the migrations
-- folder being the schema.
--
-- Rollback (roll forward): a compensating migration restores `is_admin()` and re-creates the
-- six policies against it. Nothing here changes a column, so no data moves either way.

-- EXPLICIT TRANSACTION, and the first migration here to need one. The Supabase CLI applies
-- each file without wrapping it, which is fine for a migration that adds things and wrong
-- for one that REPLACES authorization: between the DROP POLICY and the CREATE POLICY that
-- follows it, a table has no admin policy at all, and a failure anywhere in the middle would
-- leave it that way. All six swaps land together or none do.
--
-- It also makes the next line legal: `set local` outside a transaction is a no-op that warns
-- (measured, 2026-08-02).
begin;

-- Lock discipline (`database.md`), and the first migration here to set it: DROP POLICY takes
-- an ACCESS EXCLUSIVE lock, and one of the five tables is `profiles`, which every
-- authenticated request touches. Without a timeout a policy swap that arrives behind a long
-- read waits, and every query after it queues behind the waiting DDL. Three seconds then
-- failing is the better outcome: the migration is re-runnable, a stalled production is not.
set local lock_timeout = '3s';

-- --- the live reads ----------------------------------------------------------------------

-- SECURITY DEFINER, which is load-bearing rather than convenient.
--
-- `caller_is_admin_live()` shipped as SECURITY INVOKER, so its SELECT on `profiles` runs
-- under the caller's own RLS. That works from a policy on some OTHER table, and it cannot
-- work from a policy ON `profiles`: the function would query the table whose policies are
-- mid-evaluation and Postgres stops it with "infinite recursion detected in policy for
-- relation profiles". Three of the call sites this migration fixes are on `profiles`.
--
-- Reading past RLS is also the more honest model. "What is my role" and "which rows may I
-- see" are different questions, and answering the first should not depend on the second.
-- Nothing leaks: every function here reports on the CALLER and returns nothing about anyone
-- else, so the answer is something they could always determine anyway.
create or replace function public.caller_role_live()
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select p.role::text
  from public.profiles p
  where p.id = (select auth.uid())
    and p.deleted_at is null;
$function$;

comment on function public.caller_role_live is
  'The caller''s role as the profiles table has it right now, or null when there is no live profile (signed out, erased, soft-deleted). Authority checks read this, never a token claim (ADR 0015).';

create or replace function public.caller_branch_live()
returns uuid
language sql
stable
security definer
set search_path = ''
as $function$
  select p.branch_id
  from public.profiles p
  where p.id = (select auth.uid())
    and p.deleted_at is null;
$function$;

comment on function public.caller_branch_live is
  'The caller''s home branch as the profiles table has it right now. Scoping reads this rather than jwt_claim(''branch_id''), so moving a leader takes effect at once instead of at their next token refresh.';

-- Same name, same meaning, now RLS-independent. Replacing in place rather than adding a
-- second admin helper: two functions answering "is this caller an admin" is how a codebase
-- ends up with one of them on the wrong side of a decision like this one.
create or replace function public.caller_is_admin_live()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  -- coalesce, not a bare comparison. With no live profile caller_role_live() is null, and
  -- `null = 'admin'` is null rather than false. A policy treats that as a refusal, so the
  -- bug would never have shown there, but callers in plpgsql read it as a boolean and
  -- `if not caller_is_admin_live()` on a null does not take the branch. Caught by 025.
  select coalesce(public.caller_role_live() = 'admin', false);
$function$;

comment on function public.caller_is_admin_live is
  'True when the caller is an admin according to the live profiles row. Soft-deleted accounts are not admins. Used by every admin policy in this schema.';

-- No EXECUTE revokes, deliberately, matching every other helper here. These report on the
-- caller alone, and on this local Postgres a role invoking a function it lacks EXECUTE on
-- takes the backend down rather than raising (see the note in 20260729220000).

-- --- the policies that authorized from the token -----------------------------------------

drop policy "admins manage app config" on public.app_config;
create policy "admins manage app config"
  on public.app_config for all
  using (public.caller_is_admin_live())
  with check (public.caller_is_admin_live());

drop policy "admins manage giving config" on public.giving_config;
create policy "admins manage giving config"
  on public.giving_config for all
  using (public.caller_is_admin_live())
  with check (public.caller_is_admin_live());

drop policy "admins manage sermons" on public.sermons;
create policy "admins manage sermons"
  on public.sermons for all
  using (public.caller_is_admin_live())
  with check (public.caller_is_admin_live());

drop policy "admins manage daily verses" on public.daily_verses;
create policy "admins manage daily verses"
  on public.daily_verses for all
  using (public.caller_is_admin_live())
  with check (public.caller_is_admin_live());

-- The leader read, which carried both halves of the problem: the role came from the claim
-- AND the branch came from the claim. A leader moved to another branch could read the
-- profiles of the branch they left until their token expired.
drop policy "leaders read profiles in their branch" on public.profiles;
create policy "leaders read profiles in their branch"
  on public.profiles for select
  using (
    public.caller_is_admin_live()
    or (
      public.caller_role_live() = 'leader'
      and branch_id = public.caller_branch_live()
    )
  );

-- --- the invariant guards ----------------------------------------------------------------

-- `profiles_guard()` is deliberately NOT here, and the reason is worth writing down because
-- I got it wrong first.
--
-- 20260729200000 already moved that guard onto caller_is_admin_live(), as its "CHANGE 2 of
-- 3" comment says, and added two properties the older body lacks: a self-role check that
-- sits AHEAD of the privileged bypass so an admin cannot rewrite their own role, and branch
-- immutability after onboarding. My first draft restated the guard from the 20260729120000
-- body, which silently reverted all three. Tests 018, 020, 023 and 015 caught it at once.
--
-- The lesson, since a grep is how the mistake happened: that file writes
-- `CREATE OR REPLACE FUNCTION` in upper case because it was dumped from
-- pg_get_functiondef, so a lower-case grep for the definition found nothing and the guard
-- looked untouched since its creation. When a function may have been replaced, the live
-- catalog is the source of truth, not the migration files.
create or replace function public.profiles_insert_guard()
returns trigger
language plpgsql
as $$
begin
  if public.caller_is_admin_live() or (select auth.uid()) is null then
    return new;
  end if;
  new.role := 'member';
  new.id := (select auth.uid());
  return new;
end;
$$;

-- --- and the footgun itself --------------------------------------------------------------

-- Dropped rather than deprecated with a comment. Every caller is gone as of the statements
-- above, and a working `is_admin()` sitting in the schema is how a seventeenth call site
-- appears: it reads like the obvious helper, its name is better than the correct one's, and
-- nothing about using it fails. If a later migration needs the claim for something that is
-- genuinely about the token rather than about authority, `jwt_role()` is still there and
-- says what it does.
--
-- This DROP is also the check on my own sweep. If any reference survives that the grep
-- missed, a fresh database fails here, loudly, instead of quietly keeping a policy on the
-- claim.
drop function public.is_admin();

commit;
