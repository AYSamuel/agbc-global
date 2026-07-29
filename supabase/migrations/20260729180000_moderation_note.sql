-- A private note on a moderation decision (docs/spec/17 §1, W2.7 slice 3, decided
-- 2026-07-29).
--
-- `17` requires a reason for "Reject (with reason)" and says nothing about Remove, yet
-- removal is the most consequential decision a leader makes and the one most likely to
-- be asked about months later. "Why was my testimony taken down" should have a better
-- answer than a name and a timestamp.
--
-- It is NOT `rejection_reason`, deliberately. That field is author-facing: `09` shows it
-- in MY-POSTS next to "Edit and resubmit". The removals that most need a recorded reason
-- are the safeguarding ones (`17` §1, `20`): content disclosing abuse or self-harm, or a
-- photo of an identifiable child. Handing the true reason back to the author is exactly
-- wrong in those cases, and sometimes unsafe. So the note is written for the ministry's
-- own record and never leaves the moderation surface.
--
-- Rollback (roll forward): a compensating migration drops both columns and restores the
-- two guard predicates. Nothing else reads them.

alter table public.testimonies add column moderation_note text;
alter table public.prayers add column moderation_note text;

comment on column public.testimonies.moderation_note is
  'Private moderator note (docs/spec/17 §1). NEVER shown to the author, never selected by the feed views; contrast rejection_reason, which is author-facing.';
comment on column public.prayers.moderation_note is
  'Private moderator note (docs/spec/17 §1). NEVER shown to the author, never selected by the feed views; contrast rejection_reason, which is author-facing.';

-- The feed views name their columns explicitly, so neither column reaches the public
-- read path and no view needs rebuilding. Asserted in 017 rather than trusted.

-- Both update guards must now treat a note change as a MODERATION action. Without this,
-- writing a note alone falls through both branches: it would not be refused for a
-- non-moderator, and it would skip the compare-and-set. The rest of each function is
-- unchanged from its current definition.

-- The two functions below are the LIVE definitions, taken verbatim from
-- pg_get_functiondef with exactly one clause added to each. Generated rather than
-- retyped: hand-copying dropped the in_counter_write() bypass and rewrote the
-- actor-is-null branch on the first attempt, which would have broken the
-- glory-reaction counters and let admins skip the compare-and-set entirely.

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
  if public.in_counter_write() then
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
  if public.in_counter_write() then
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
