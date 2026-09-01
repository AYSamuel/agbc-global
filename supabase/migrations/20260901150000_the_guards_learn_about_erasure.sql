/**
 * W4.5 slice 1b: the three guards learn about the erasure.
 *
 * Every one of them exists to stop a member rewriting their own history, and every one of
 * them would refuse the erasure, because the erasure runs under the departing member's OWN
 * uid: they are the one who asked. `testimonies_update_guard` and `prayers_update_guard`
 * raise "authorship, branch, and consent evidence are immutable" on any change to
 * `author_id`, which is precisely what "keep my posts, credited to A former member" is;
 * `profiles_guard` refuses an owner touching anything outside the allowlist, and `email` is
 * deliberately not in it.
 *
 * The mechanism is the one already here twice: a transaction-local flag, checked in the same
 * place the existing ones are checked. `in_counter_write()` gets an `or` beside it in the two
 * content guards, and `in_account_erasure()` joins `actor_is_privileged` in the profile one.
 *
 * THE WHOLE BODIES ARE RESTATED because `create or replace` cannot patch one line. They were
 * extracted from the live database rather than retyped, so a diff against the migration that
 * created each one shows exactly the lines that moved and nothing else; every comment is
 * byte-identical.
 *
 * Note what is deliberately NOT done here: clearing `request.jwt.claims` inside the routine
 * would have made all three guards treat the erasure as a server write with no code change at
 * all, and it was rejected. `profiles_audit` writes the actor from those claims, and an
 * erasure with a NULL actor would lose the one fact the audit row exists to record, that the
 * member themselves asked for this.
 *
 * Rollback plan: restore each function from the migration that owns it (20260730120000 for
 * profiles_guard, and the family-domain migrations for the two content guards); the flag
 * function then has no readers and can be dropped with them.
 */

begin;

set local lock_timeout = '3s';

-- --- profiles_guard: the erasure joins the privileged writers ----------------------
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
    or public.in_privileged_profile_write()
    -- W4.5: the account erasure, which runs under the departing member's own uid and is
    -- the one write that IS allowed to rewrite their own row (docs/spec/16).
    or public.in_account_erasure();
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

-- --- testimonies_update_guard: the erasure may null the author ---
CREATE OR REPLACE FUNCTION public.testimonies_update_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  actor uuid := (select auth.uid());
  is_author boolean;
  content_changed boolean;
  moderation_changed boolean;
begin
  -- W4.5: `or in_account_erasure()`. Nulling author_id is what "keep my posts" means,
  -- and the immutability check below is written to refuse exactly that (docs/spec/16).
  if public.in_counter_write() or public.in_account_erasure() then
    return new;
  end if;

  if actor is null then
    new.updated_at := now();
    return new;
  end if;

  if new.id is distinct from old.id
     or new.author_id is distinct from old.author_id
     or new.branch_id is distinct from old.branch_id
     or new.created_at is distinct from old.created_at
     or new.consent_version is distinct from old.consent_version
     or new.consented_at is distinct from old.consented_at then
    raise exception 'authorship, branch, and consent evidence are immutable'
      using errcode = 'check_violation';
  end if;
  if new.glory_count is distinct from old.glory_count then
    raise exception 'glory_count is maintained by triggers, not by clients'
      using errcode = 'check_violation';
  end if;

  is_author := old.author_id = actor;
  content_changed :=
    new.body is distinct from old.body
    or new.image_path is distinct from old.image_path
    or new.category_id is distinct from old.category_id
    or new.language is distinct from old.language
    or new.from_prayer_id is distinct from old.from_prayer_id;
  moderation_changed :=
    new.status is distinct from old.status
    or new.moderated_by is distinct from old.moderated_by
    or new.moderated_at is distinct from old.moderated_at
    or new.rejection_reason is distinct from old.rejection_reason
    -- Added W2.7 slice 3: writing a private note is a MODERATION action. Without
    -- this line a note change falls through both branches, so it would skip both
    -- the can_moderate_branch check and the compare-and-set.
    or new.moderation_note is distinct from old.moderation_note;

  if content_changed then
    if not is_author then
      raise exception 'only the author may edit this testimony'
        using errcode = 'insufficient_privilege';
    end if;
    if old.status = 'removed' then
      raise exception 'removed content cannot be edited; only an admin may restore it'
        using errcode = 'insufficient_privilege';
    end if;
    perform public.assert_photo_path_owned(new.image_path);
    -- New in this migration. Scoped to a CHANGED path so that editing the words of a
    -- post that already carries a photo does not re-litigate the photo.
    if new.image_path is distinct from old.image_path and new.image_path is not null then
      perform public.assert_photo_validated(new.image_path);
    end if;
    -- Adding a photo to a post that never had one means the author is doing something
    -- their recorded consent did not describe. Consent evidence is immutable on this
    -- path, so the only correct answer today is to refuse. W2.6 builds edit-and-resubmit
    -- and will have to run the consent step again for this case; this assert is what
    -- makes forgetting to impossible rather than merely wrong.
    if old.image_path is null and new.image_path is not null then
      perform public.assert_consent_covers_photo(new.consent_version);
    end if;
    perform public.assert_prayer_link_allowed(new.from_prayer_id);
    new.status := 'pending';
    new.moderated_by := null;
    new.moderated_at := null;
    new.rejection_reason := null;
  elsif moderation_changed then
    if not public.can_moderate_branch(old.branch_id) then
      raise exception 'moderation is a leader or admin action'
        using errcode = 'insufficient_privilege';
    end if;
    if old.status = 'removed' and not public.caller_is_admin_live() then
      raise exception 'only an admin may restore removed content'
        using errcode = 'insufficient_privilege';
    end if;
    if new.updated_at is distinct from old.updated_at then
      -- NOT serialization_failure (40001), which W1.5 used. Measured over HTTP on
      -- 2026-07-29: a trigger raising 40001 makes the PostgREST request never return at
      -- all (raw fetch aborted at 8s; the same statement raises instantly in psql).
      -- 40001 means "transient conflict, try again", so the stack keeps retrying, and
      -- this condition is permanent: the row really has changed. A leader approving a
      -- stale item would have watched the page spin forever, holding a connection open.
      -- PT409 asks PostgREST for HTTP 409 Conflict, which is what this actually is.
      raise exception 'content changed since review'
        using errcode = 'PT409';
    end if;
    new.moderated_by := actor;
    new.moderated_at := now();
  end if;

  if new.deleted_at is distinct from old.deleted_at
     and not is_author
     and not public.can_moderate_branch(old.branch_id) then
    raise exception 'only the author may delete this testimony'
      using errcode = 'insufficient_privilege';
  end if;

  new.updated_at := now();
  return new;
end;
$function$;

-- --- prayers_update_guard: the erasure may null the author -------
CREATE OR REPLACE FUNCTION public.prayers_update_guard()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  actor uuid := (select auth.uid());
  is_author boolean;
  content_changed boolean;
  moderation_changed boolean;
begin
  -- W4.5: `or in_account_erasure()`. Nulling author_id is what "keep my posts" means,
  -- and the immutability check below is written to refuse exactly that (docs/spec/16).
  if public.in_counter_write() or public.in_account_erasure() then
    return new;
  end if;

  if actor is null then
    new.updated_at := now();
    return new;
  end if;

  if new.id is distinct from old.id
     or new.author_id is distinct from old.author_id
     or new.branch_id is distinct from old.branch_id
     or new.created_at is distinct from old.created_at
     or new.consent_version is distinct from old.consent_version
     or new.consented_at is distinct from old.consented_at then
    raise exception 'authorship, branch, and consent evidence are immutable'
      using errcode = 'check_violation';
  end if;
  if new.praying_count is distinct from old.praying_count
     or new.prayed_count is distinct from old.prayed_count then
    raise exception 'prayer counts are maintained by triggers, not by clients'
      using errcode = 'check_violation';
  end if;

  is_author := old.author_id = actor;
  -- is_anonymous is deliberately NOT here: flipping your own identity on an approved
  -- request does not re-enter moderation (docs/spec/02). It still broadcasts, so
  -- live clients re-render, and the app requires a confirm sheet going anonymous ->
  -- named. Everything else an author can edit re-pends the row.
  content_changed :=
    new.body is distinct from old.body
    or new.language is distinct from old.language;
  moderation_changed :=
    new.status is distinct from old.status
    or new.moderated_by is distinct from old.moderated_by
    or new.moderated_at is distinct from old.moderated_at
    or new.rejection_reason is distinct from old.rejection_reason
    -- Added W2.7 slice 3: writing a private note is a MODERATION action. Without
    -- this line a note change falls through both branches, so it would skip both
    -- the can_moderate_branch check and the compare-and-set.
    or new.moderation_note is distinct from old.moderation_note;

  if new.is_anonymous is distinct from old.is_anonymous and not is_author then
    raise exception 'only the author may change the anonymity of a request'
      using errcode = 'insufficient_privilege';
  end if;

  -- Mark answered / not answered, with the preconditions checked server-side
  -- (docs/spec/02, 09): the UI offering the action is not the mechanism.
  if new.answered_at is distinct from old.answered_at then
    if not is_author then
      raise exception 'only the author may mark a request answered'
        using errcode = 'insufficient_privilege';
    end if;
    if new.answered_at is not null then
      if old.status <> 'approved' or old.deleted_at is not null then
        raise exception 'only an approved, live request can be marked answered'
          using errcode = 'check_violation';
      end if;
    elsif public.prayer_has_live_testimony(old.id) then
      raise exception 'delete the linked testimony before marking this request unanswered'
        using errcode = 'check_violation';
    end if;
  end if;

  if content_changed then
    if not is_author then
      raise exception 'only the author may edit this request'
        using errcode = 'insufficient_privilege';
    end if;
    if old.status = 'removed' then
      raise exception 'removed content cannot be edited; only an admin may restore it'
        using errcode = 'insufficient_privilege';
    end if;
    new.status := 'pending';
    new.moderated_by := null;
    new.moderated_at := null;
    new.rejection_reason := null;
  elsif moderation_changed then
    if not public.can_moderate_branch(old.branch_id) then
      raise exception 'moderation is a leader or admin action'
        using errcode = 'insufficient_privilege';
    end if;
    if old.status = 'removed' and not public.caller_is_admin_live() then
      raise exception 'only an admin may restore removed content'
        using errcode = 'insufficient_privilege';
    end if;
    if new.updated_at is distinct from old.updated_at then
      -- NOT serialization_failure (40001), which W1.5 used. Measured over HTTP on
      -- 2026-07-29: a trigger raising 40001 makes the PostgREST request never return at
      -- all (raw fetch aborted at 8s; the same statement raises instantly in psql).
      -- 40001 means "transient conflict, try again", so the stack keeps retrying, and
      -- this condition is permanent: the row really has changed. A leader approving a
      -- stale item would have watched the page spin forever, holding a connection open.
      -- PT409 asks PostgREST for HTTP 409 Conflict, which is what this actually is.
      raise exception 'content changed since review'
        using errcode = 'PT409';
    end if;
    new.moderated_by := actor;
    new.moderated_at := now();
  end if;

  if new.deleted_at is distinct from old.deleted_at
     and not is_author
     and not public.can_moderate_branch(old.branch_id) then
    raise exception 'only the author may delete this request'
      using errcode = 'insufficient_privilege';
  end if;

  new.updated_at := now();
  return new;
end;
$function$;

commit;
