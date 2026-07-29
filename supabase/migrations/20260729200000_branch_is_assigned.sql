-- A member's branch is approved, never self-assigned (W2.7 slice 3.5, decided 2026-07-29).
--
-- SECURITY FIX. `can_moderate_branch()` keys off `profiles.branch_id`, and `branch_id`
-- sat in the member-writable allowlist (`02` §Invariants). Those two facts together meant
-- a branch leader could update their own profile into another branch and immediately
-- moderate it. Measured on the local stack on 2026-07-29, acting as a Berlin leader:
--
--   before: can_moderate_branch(glasgow) -> f   glasgow items in the queue -> 0
--   update public.profiles set branch_id = <glasgow> where id = <self>;   -- UPDATE 1
--   after:  can_moderate_branch(glasgow) -> t   glasgow items in the queue -> 1
--
-- Every branch-scoping test we had proves a leader cannot reach another branch WHILE
-- STAYING IN THEIR OWN. None of them moved first, so the whole matrix passed green over
-- an open door. The lesson is in the pgTAP file, not just here.
--
-- The moderation rights are not the worst of it. Pending testimonies and prayer requests
-- are Art. 9 special-category data (`20`): a leader could READ another branch's
-- unreviewed disclosures. That is an unauthorised disclosure, not a permissions nicety.
--
-- The rule (Ayo, 2026-07-29): nobody sets their own branch. A change is PROPOSED and
-- someone above approves it. A member's proposal goes to their branch leader, a leader's
-- to an admin, and the member is told to expect about 48 hours, because branch drives
-- attendance, reminders and "my branch" scoping and should not churn weekly. This
-- migration installs the half that closes the hole. The proposal and approval flow is a
-- feature with its own surfaces in `16` and `17`, specced separately.
--
-- Until that flow lands, NOBODY can move an onboarded member, admins included. That is
-- deliberate for now, and worth stating plainly because it is easy to misread this
-- migration as "admins do it manually meanwhile". They cannot: the only UPDATE policy on
-- `profiles` is `members update their own profile` (id = auth.uid()), so RLS filters
-- another member's row out before this trigger is ever reached. Measured 2026-07-29: an
-- admin updating a leader's branch returns UPDATE 0, not a refusal. The approval flow
-- therefore has to bring its own admin write path, and W2.7 slice 3.5 builds it as a
-- SECURITY DEFINER function that writes the audit row and the profile in one transaction,
-- so `17`'s "every privileged action audit-logged" is structural rather than remembered.
--
-- Onboarding is exempt (`old.onboarded_at is null`). AUTH-3 picks the branch on the way
-- in, and its resume path rewrites the row after the app is killed mid-flow
-- (ProfileStep.tsx:107-124). The lock closes behind the member the moment onboarding
-- completes, which is exactly how onboarded_at and age_confirmed_at already behave in
-- this same function.
--
-- Nothing regresses in the app: no surface changes branch after onboarding today.
-- ProfileStep.tsx is the only writer of branch_id, and apps/mobile/app/settings/ holds
-- only index.tsx and language.tsx.
--
-- Rollback (roll forward): a compensating migration restores the previous definition,
-- which this file reproduces in full apart from the three changes marked below.

-- The definition below is the LIVE one, taken verbatim from pg_get_functiondef with three
-- changes, all marked. Generated rather than retyped: hand-copying the moderation guards
-- last week silently dropped a bypass clause, and this function is the one that decides
-- who may hand out roles.

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
  actor_is_privileged boolean :=
    public.caller_is_admin_live()
    or (select auth.uid()) is null
    or public.in_bootstrap_promote();
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

comment on column public.profiles.branch_id is
  'Home branch. Chosen during onboarding, then immutable to its owner: it drives moderation authority via can_moderate_branch(), so self-assignment was privilege escalation (fixed 2026-07-29). Changes are proposed and approved by a branch leader or admin.';
