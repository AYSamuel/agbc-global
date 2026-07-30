-- Role assignment: the admin write path (docs/spec/17 §People, ADR 0015, W2.7 people slice).
--
-- WHY THIS IS A FUNCTION AND NOT A POLICY. There is no write path to another member's
-- profile at all, and adding one would be the wrong fix. The only UPDATE policy on
-- `profiles` is `members update their own profile` (`id = auth.uid()`), so an admin
-- updating somebody else matches zero rows and returns UPDATE 0 with no error at all
-- (measured 2026-07-29, asserted in pgTAP `018` test 9). A broad "admins update any
-- profile" policy would hand every column on every row to one role for the sake of two;
-- a SECURITY DEFINER function grants exactly the write this feature needs and checks the
-- authority itself. `019` proved the shape works: definer rights bypass RLS while
-- auth.uid() still names the human, so the audit trigger records the real actor.
--
-- WHAT IT REFUSES, and why each one is here rather than left to a caller:
--
--   * not a live admin           -> `caller_is_admin_live()`, the table and never the JWT
--                                   claim, so a just-demoted admin cannot hand out roles
--                                   with a token that has not expired yet (ADR 0015 §6).
--   * session is not aal2        -> defence in depth behind the dashboard's step-up.
--   * target is the caller       -> no self-service privilege change, admins included.
--   * target would be the last admin -> read the honesty note on that clause below.
--   * no such member / closed account / target still in onboarding / archived destination.
--
-- THE STEP-UP IS CHECKED IN BOTH PLACES ON PURPOSE (decision 8: `17` names role
-- assignment explicitly). `apps/dashboard/src/server/authorize.ts` already refuses a
-- session that has not cleared TOTP, and additionally enforces a 24-hour freshness window.
-- Only that layer can know what "fresh" means for a dashboard request, so freshness stays
-- there; the level itself is asserted here, where it cannot be routed around. A future
-- caller that forgets the dashboard's rules still cannot hand out authority from an aal1
-- session.
--
-- THE FLAG, and why a second mechanism was not invented. `in_bootstrap_promote()` is the
-- established shape for "this write is server-owned even though it carries a member's
-- uid": a transaction-local GUC that `profiles_guard` recognises.
-- `in_privileged_profile_write()` mirrors it exactly.
--
-- Worth stating plainly, because it looks redundant: the guard's privileged bypass already
-- answers true for a live admin, so this function's own write would have been let through
-- without any flag. The flag is here so the function declares its own authority instead of
-- borrowing the guard's admin bypass. That matters twice. It matters the day the bypass is
-- narrowed (an admin bypass that waves through every column of every profile is broader
-- than anything actually needs), and it matters immediately for `decide_branch_request`,
-- where the actor is a LEADER and the bypass answers false. One mechanism, introduced by
-- the first migration that needs it.
--
-- The blast radius of the new flag, named rather than left implicit: a caller who could set
-- the GUC would be able to write their own `branch_id`, which is precisely the hole PR #101
-- closed. They could NOT write their own `role`, because that refusal sits ahead of the
-- bypass and the new flag is deliberately not exempted from it (pinned by `020`). The GUC is
-- set only inside SECURITY DEFINER functions owned by postgres, and a PostgREST client has
-- no surface to call `set_config` through, which is the same reasoning that makes
-- `agbc.bootstrap_promote` safe, over a strictly smaller blast radius.
--
-- Rollback (roll forward): a compensating migration drops the function and the helper and
-- restores `profiles_guard` to the three-clause form in
-- `20260729200000_branch_is_assigned.sql`. Nothing depends on the function yet; the
-- dashboard surface is a later slice and is mockup-gated.

-- The flag. Mirrors public.in_bootstrap_promote() and public.in_counter_write(): explicit
-- intent, rather than inferring server-ownership from pg_trigger_depth() or from who the
-- caller happens to be.
create function public.in_privileged_profile_write()
returns boolean
language sql
stable
as $function$
  select coalesce(current_setting('agbc.privileged_profile_write', true), 'off') = 'on';
$function$;

comment on function public.in_privileged_profile_write is
  'True inside a transaction that has opted into a server-owned profile write (set_member_role, decide_branch_request). Recognised by profiles_guard as privileged for branch_id, and deliberately NOT for an owner writing their own role.';

-- No EXECUTE revoke, matching its two sibling flag helpers. It reports whether a flag is
-- set in the CALLER'S OWN transaction and grants nothing by answering. Revoking would also
-- be actively harmful: profiles_guard runs as the invoking role and calls this, and on this
-- local Postgres a role invoking a function it lacks EXECUTE on takes the backend down
-- rather than raising (recorded in `019`'s closing note). Narrow grants belong on functions
-- that DO something privileged, which is why the one below has them and this does not.

-- --- teach the guard about the flag -----------------------------------------------------

-- Taken verbatim from pg_get_functiondef against the live local stack, with ONE change,
-- marked. Generated rather than retyped for the reason the last two migrations to touch
-- this function both give: hand-copying it silently dropped a bypass clause once, and this
-- is the function that decides who may hand out roles.
CREATE OR REPLACE FUNCTION public.profiles_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  -- Privileged = admin, or NO user context at all: service-role requests and
  -- direct DB connections (seeds, jobs, tests setup) carry no sub claim. A real
  -- member/leader request always has auth.uid(). The bootstrap promotion runs
  -- INSIDE the new member's own transaction, so it has their uid and needs the
  -- explicit flag to be recognised as server-owned.
  --
  -- CHANGE 2 of 3, same class of bug as the branch hole above. This tested
  -- public.is_admin(), which reads the `user_role` JWT CLAIM. This is the function that
  -- decides who may change `role`, so trusting a claim meant a just-demoted admin kept
  -- the power to hand roles out until their access token expired, up to an hour later.
  -- caller_is_admin_live() asks the table instead, which is why the moderation guards
  -- already use it for the restore check. A member cannot forge the claim, so the window
  -- was bounded and needed a real prior admin, but "bounded privilege escalation" is not
  -- a property worth keeping in the function that guards roles.
  --
  -- THE ONLY CHANGE IN THIS MIGRATION: in_privileged_profile_write(). The approval flow
  -- writes another member's branch_id while carrying a LEADER's uid, which every clause
  -- below is built to refuse. Same shape as the bootstrap flag on the line under it.
  actor_is_privileged boolean :=
    public.caller_is_admin_live()
    or (select auth.uid()) is null
    or public.in_bootstrap_promote()
    or public.in_privileged_profile_write();
begin
  -- CHANGE 3 of 3: a privilege change is never self-service, admins included. This sits
  -- AHEAD of the privileged bypass on purpose, so that it binds the one actor the bypass
  -- would otherwise wave straight through.
  --
  -- 015 test 11 ("even an allowlisted owner cannot write their own role") passed before
  -- this line existed, but only by accident: it acts with a deliberately understated
  -- `user_role: member` claim, so the old claim-based is_admin() answered false and the
  -- checks below caught it. A real admin holding a correct token was privileged, returned
  -- early, and could rewrite their own role. The property that test names was never
  -- actually true. Moving the bypass to the live table (change 2) is what exposed it, and
  -- relaxing the test to match would have been the wrong direction.
  --
  -- NOTE what is NOT in this condition: in_privileged_profile_write(). The new flag is
  -- exempted from the bypass above and NOT from this refusal, which is the whole reason
  -- the two are separate mechanisms. in_bootstrap_promote() has to be here because the
  -- bootstrap genuinely changes a member's own role inside their own transaction; no
  -- privileged profile write ever needs to, because set_member_role refuses target = self
  -- outright. If a future caller seems to need it, that caller is wrong.
  --
  -- Two null-safety notes, both load-bearing. Server contexts have no auth.uid(), so
  -- `old.id = null` is NULL, the whole condition is NULL, and seeds, jobs and service-role
  -- writes pass through untouched. And the bootstrap promotion runs INSIDE the new
  -- member's own transaction, changing their own role under their own uid, which is
  -- exactly the shape this refuses: in_bootstrap_promote() is why it still works (015).
  if new.role is distinct from old.role
     and old.id = (select auth.uid())
     and not public.in_bootstrap_promote() then
    raise exception 'role is immutable to its owner'
      using errcode = 'insufficient_privilege';
  end if;

  if actor_is_privileged then
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'role is immutable to its owner';
  end if;
  if new.email is distinct from old.email then
    raise exception 'email mirrors the auth identity; change it via the auth email-change flow';
  end if;
  if new.deleted_at is distinct from old.deleted_at then
    raise exception 'deletion runs through the deletion job, not a profile update';
  end if;
  if old.onboarded_at is not null
     and new.onboarded_at is distinct from old.onboarded_at then
    raise exception 'onboarded_at is set once by AUTH-3';
  end if;
  if old.age_confirmed_at is not null
     and new.age_confirmed_at is distinct from old.age_confirmed_at then
    raise exception 'age_confirmed_at is set once by AUTH-3';
  end if;
  -- CHANGE 1 of 3: the security fix. Chosen during onboarding, assigned afterwards.
  -- errcode is explicit here where the older raises above leave it at P0001: this is a
  -- refusal of authority, and the request flow will want to tell "you may not do that"
  -- (403) apart from "that was malformed" (400) without matching on message text.
  --
  -- The POSITION matters, not just the rule. It sits after the onboarded_at check because
  -- ProfileStep's resume path writes branch_id and onboarded_at in one statement and
  -- reads `onboarded_at is set once` off the message to recognise "already onboarded
  -- elsewhere" (ProfileStep.tsx:54, 118). Swap the two clauses and a resuming member gets
  -- the generic error screen instead of being signed in. Pinned by 018.
  if old.onboarded_at is not null
     and new.branch_id is distinct from old.branch_id then
    raise exception 'a branch change is approved by a leader or admin, not self-assigned'
      using errcode = 'insufficient_privilege';
  end if;
  if new.created_at is distinct from old.created_at then
    raise exception 'created_at is immutable';
  end if;

  return new;
end;
$function$;

-- --- the admin write path ---------------------------------------------------------------

create function public.set_member_role(
  target uuid,
  new_role public.profile_role,
  new_branch uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  actor uuid := (select auth.uid());
  subject record;
  destination record;
  live_admins integer;
  touched integer;
begin
  -- Authority before anything else, and from the table. Note the ORDER: an ordinary member
  -- probing this endpoint is told they may not, not walked into setting up an authenticator
  -- app for a screen that was never theirs.
  if not public.caller_is_admin_live() then
    raise exception 'only an admin assigns roles'
      using errcode = 'insufficient_privilege';
  end if;

  -- The step-up. Read from the access token's own `aal` claim, which the auth server sets
  -- and a client cannot forge; public.jwt_claim() is the house reader for it. The
  -- dashboard's authorize() has already refused an aal1 session by the time a real request
  -- lands here, which is exactly why this is worth having: the check that never fires is
  -- the one that catches the next caller.
  if coalesce(public.jwt_claim('aal'), '') <> 'aal2' then
    raise exception 'handing out authority needs a fresh code from your authenticator'
      using errcode = 'insufficient_privilege';
  end if;

  -- profiles_guard refuses this too, one clause ahead of its privileged bypass. It is
  -- repeated here because a trigger message surfacing through an RPC reads as an internal
  -- failure, and because this function should not depend on a rule living somewhere else
  -- for its most important refusal.
  if target = actor then
    raise exception 'a role change is never self-service, admins included'
      using errcode = 'insufficient_privilege';
  end if;

  select p.role, p.deleted_at, p.onboarded_at into subject
    from public.profiles p
   where p.id = target;

  -- Precise errors for a caller who is already a verified admin. The SURFACE is what has
  -- to be neutral: `17`'s exact-email lookup must read the same for an address with no
  -- account as for one that exists and cannot be changed, so the dashboard collapses these
  -- into one message rather than passing them through (docs/spec/20, data minimisation).
  if not found then
    raise exception 'no such member'
      using errcode = 'no_data_found';
  end if;
  if subject.deleted_at is not null then
    raise exception 'that account is closed'
      using errcode = 'check_violation';
  end if;

  -- A HALF-CREATED PRINCIPAL DOES NOT RECEIVE AUTHORITY, and this one is a real defect rather
  -- than a nicety. profiles_guard exempts a member from the branch lock while onboarded_at is
  -- null, because AUTH-3's resume path rewrites the row after the app is killed mid-flow
  -- (ProfileStep.tsx:107-124). So if an admin assigns a branch to someone still in onboarding,
  -- the member's own resume write silently REVERTS it while the role sticks: a leader of a
  -- branch nobody assigned them to, with no error anywhere and an audit trail that says
  -- otherwise. Authority here derives from branch_id (`can_moderate_branch`), which is the
  -- whole subject of ADR 0015, so a silently wrong branch is a silently wrong scope.
  --
  -- Fail closed on an incomplete account, the same judgement `caller_is_onboarded()` already
  -- encodes for the other direction. Nothing legitimate is lost: onboarding takes minutes, and
  -- `17`'s archived-branch reassignment acts on onboarded members.
  if subject.onboarded_at is null then
    raise exception 'that member has not finished joining yet'
      using errcode = 'check_violation';
  end if;

  -- THE LAST ADMIN, and this clause is honest about its own reach so that nobody reads it as
  -- the thing holding the invariant up, or deletes it as dead code.
  --
  -- It cannot fire through this entry point, by arithmetic rather than luck: the caller must
  -- be a LIVE admin and the target cannot be the caller, so any target holding 'admin' means
  -- at least two live admins exist and demoting one leaves one. What actually keeps the
  -- ministry off zero is the PAIR of refusals. Demote the second admin and one remains; try
  -- to demote the last and you are the last. `020` pins that as a sequence, and says plainly
  -- that removing this clause turns nothing red. It stays as the backstop for the next
  -- caller: a service-role path, a batch fix, an archived-branch sweep, or any relaxation of
  -- the self refusal. The rule belongs to the data layer, not to whoever remembers it (`17`).
  --
  -- FOR UPDATE, because counting and then acting is a race (`database.md` §Transactions): two
  -- admins demoting each other at the same moment would both read two, both pass, and leave
  -- zero. Locking the counted rows makes the second caller wait and re-count one. A backstop
  -- with a known race fails on the day it is finally needed.
  --
  -- The SUBJECT read above is deliberately unlocked: it only decides whether the lock is
  -- worth taking, and the count under the lock is what decides the refusal. Locking the
  -- target first and the set second is what would deadlock, two callers each holding one
  -- admin row and each waiting for the other's.
  --
  -- Cost, named as `database.md` asks: no index on `role`, so this is a sequential scan of
  -- profiles, reached only when an admin is being demoted. Revisit if the People surface
  -- starts counting staff on every page load.
  if subject.role = 'admin' and new_role <> 'admin' then
    select count(*) into live_admins from (
      select 1 from public.profiles p
       where p.role = 'admin' and p.deleted_at is null
       for update
    ) locked;

    if live_admins <= 1 then
      raise exception 'the last admin cannot be demoted'
        using errcode = 'check_violation';
    end if;
  end if;

  -- The branch is optional and, when given, is applied whatever the role. The plan calls it
  -- "only meaningful when granting leader", which is true of the dashboard form (the branch
  -- chooser appears only for a leader grant) but is not a rule worth enforcing down here:
  -- an admin-initiated assignment is the ONLY way to move an onboarded member without a
  -- request, and `17` module 5 needs exactly that when a branch is archived and its members
  -- are reassigned. Refusing it would leave a wrong branch uncorrectable.
  if new_branch is not null then
    select b.status into destination
      from public.branches b
     where b.id = new_branch;

    if not found then
      raise exception 'no such branch'
        using errcode = 'no_data_found';
    end if;
    -- Archiving moves people OUT of a branch (`17` module 5). Nobody is ever assigned in,
    -- and leadership of an archived branch is authority over nothing.
    if destination.status <> 'active' then
      raise exception 'that branch is archived'
        using errcode = 'check_violation';
    end if;
  end if;

  -- ONE statement for both columns, deliberately. The audit trigger writes a row per fact
  -- that changed, so a single statement yields one row for the role and one for the branch
  -- (`019` test 9 pins that shape) rather than two half-audited writes that could interleave.
  perform set_config('agbc.privileged_profile_write', 'on', true);

  update public.profiles p
     set role = new_role,
         branch_id = coalesce(new_branch, p.branch_id)
   where p.id = target;

  get diagnostics touched = row_count;

  perform set_config('agbc.privileged_profile_write', 'off', true);

  -- The failure mode this whole slice exists because of: an UPDATE that matches nothing and
  -- says nothing. Every reachable cause is refused above, so zero rows here means an
  -- invariant broke underneath us (an RLS regression, or an owner that lost BYPASSRLS), and
  -- a 500 is the honest answer. Silence is what let the branch hole live in PR #101.
  if touched <> 1 then
    raise exception 'set_member_role changed no row for %', target
      using errcode = 'internal_error';
  end if;
end;
$function$;

comment on function public.set_member_role(uuid, public.profile_role, uuid) is
  'Admin-only role assignment (docs/spec/17 §People, ADR 0015). SECURITY DEFINER because RLS has no write path to another member''s profile and should not get a broad one. Refuses a non-admin, an aal1 session, target = self, a closed account, an archived destination branch, and demoting the last admin. The audit row comes from the profiles_audit trigger, not from here.';

-- Authorization is checked INSIDE the function, so the grant is only about who may attempt
-- it. anon and PUBLIC lose EXECUTE; service_role is not granted it either, because no job or
-- edge function assigns roles and a key that leaks should not be able to.
--
-- REVOKING FROM `public` AND `anon` IS NOT ENOUGH, and finding that out is worth more than
-- this function. Supabase's project bootstrap sets ALTER DEFAULT PRIVILEGES ... GRANT
-- EXECUTE ON FUNCTIONS TO anon, authenticated, service_role, exactly as it does for tables
-- (issue #96, `015` test 4). Those are explicit grants to named roles, so revoking from
-- PUBLIC leaves every one of them standing. Measured on the live local stack 2026-07-30:
-- with only `from public, anon` revoked, this function's ACL still read
-- `service_role=X/postgres`, and `020` caught it.
--
-- The hygiene note in the plan says "revoke execute from public, anon", which is the wording
-- every function in this schema has followed. It is insufficient on Supabase. The correct
-- shape is to start from zero for every API role and hand back exactly what is needed, which
-- is what the table REVOKEs in the last two migrations already do. `custom_access_token` is
-- the pre-existing case of the same gap (it revokes from authenticated, anon, public and so
-- still grants service_role EXECUTE on the token hook); left alone here rather than widened
-- into an unrelated fix, and noted for the #96 sweep.
revoke all on function public.set_member_role(uuid, public.profile_role, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.set_member_role(uuid, public.profile_role, uuid) to authenticated;
