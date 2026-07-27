-- W2.3 · Compose slice, part 3: nothing may reference a photo the server has not opened.
--
-- Part 2 built the private bucket, the own-folder rules and the approved-only read
-- boundary. Two holes are left, and both are the kind that only close server-side:
--
--   1. **The bytes are unverified.** Storage checks the size and the Content-Type the
--      client DECLARED; it does not look inside the file. `~/.claude/standards/security.md`
--      §File uploads is explicit that the declared type is never trusted and that content
--      must be validated (magic bytes) as a separate layer. That check needs to read the
--      object, so it lives in the `photo-guard` edge function (service role).
--   2. **Nothing forced the check to happen.** The plan for this slice had the app call
--      the guard after posting, so a bad file was cleaned up afterwards; a client that
--      simply never called it was never checked at all. Decided with Ayo 2026-07-27:
--      invert it. The guard records every object it has opened, and the testimony guards
--      REFUSE an `image_path` that has no matching record. Skipping the check is now an
--      insert that fails, which is the same posture as every other rule here: the
--      database is the mechanism, not the app (project CLAUDE.md, docs/spec/02).
--
-- The record pins the object's identity AND its `version`, both of which Storage mints
-- fresh on every write. A member who deletes their validated object and uploads new bytes
-- at the same path gets a new id and version, so the stale record stops matching and the
-- reference is refused again. That closes the check-then-swap window without the database
-- ever having to read a byte.
--
-- Art. 9 also moves here: a photo can expose far more than the words around it (a face, a
-- child, a hospital room), so docs/spec/20 §Photos requires the consent step to ask for
-- the permission of anyone identifiable. That is different WORDING, and consent wording is
-- versioned evidence, so it is a different VERSION: `content-share-photo-v1`. Rather than
-- hard-code that key in a trigger, versions now declare whether they cover photos, and the
-- guards check the flag.
--
-- Rollback plan: re-create the storage UPDATE policy, re-emit both testimony guards from
-- 20260726120100 verbatim, drop the two asserts, drop `testimony_photo_validations`, drop
-- the `covers_photos` column, and mark `content-share-photo-v1` inactive (never delete it:
-- rows reference it as evidence).

-- ---------------------------------------------------------------------------
-- Consent wording that covers a photo
-- ---------------------------------------------------------------------------

alter table public.consent_versions
  add column covers_photos boolean not null default false;

comment on column public.consent_versions.covers_photos is
  'True when this wording asks the author for the permission of anyone identifiable in a photo (docs/spec/20 §Photos). A post carrying an image_path may only record a version with this set, so the Art. 9 evidence always matches what the author actually agreed to.';

-- The v1 note claimed a photo reminder that its wording never contained: the shipped v1
-- copy is three points and none of them mention photos. Correcting the NOTE is not
-- editing consent wording (the wording lives in the app bundle, hashed against the key);
-- it is removing a claim the evidence would not support.
update public.consent_versions
set notes = 'Initial compose consent wording (W2.3): shared publicly with the family, reviewed by a branch leader first, editable and deletable by the author. No photo clause: a post carrying a photo records content-share-photo-v1 instead.'
where version = 'content-share-v1';

-- v1 is NOT retired. It is still the exact and complete description of what a member
-- agrees to when they share words only, which is every prayer request and most
-- testimonies; retiring it would mint evidence noise for no gain.
insert into public.consent_versions (version, covers_photos, notes)
values (
  'content-share-photo-v1',
  true,
  'W2.3 slice 3: the content-share-v1 points plus the photo-permission clause required by docs/spec/20 §Photos (ask anyone identifiable, never a child without a parent''s consent). Recorded only when the post carries an image.'
)
on conflict (version) do nothing;

-- ---------------------------------------------------------------------------
-- The record of what the guard has opened
-- ---------------------------------------------------------------------------
-- No policies, deliberately: RLS is forced and nothing grants anon or authenticated, so
-- the only writer is the service role inside the edge function. A member cannot forge a
-- validation any more than they can forge an approval.

create table public.testimony_photo_validations (
  object_name text primary key,
  -- Storage's identity for the object AS VALIDATED. `object_id` is the pin that
  -- matters: an object deleted and re-uploaded at the same path gets a new one, so a
  -- stale record stops matching. `object_version` is the same story one level finer and
  -- is nullable on purpose: Storage sets it on every upload through the API, but a row
  -- written by any other route may not carry one, and a missing version must not lock a
  -- member out of attaching their photo when the id already answers the question.
  object_id uuid not null,
  object_version text,
  byte_size bigint not null,
  -- The type the BYTES turned out to be, not the one the upload declared.
  content_type text not null,
  validated_at timestamptz not null default now()
);

comment on table public.testimony_photo_validations is
  'One row per testimony photo whose leading bytes the `photo-guard` edge function has read and accepted (docs/spec/02 §Storage, ~/.claude/standards/security.md §File uploads). Written by the service role only. public.assert_photo_validated() refuses any testimony that references an object without a matching, still-current row. RETENTION: a row is meaningful only while its object exists, and `object_name` starts with the member''s id, so account deletion (docs/spec/20) deletes these rows alongside that member''s storage objects; a row left behind by an object delete is already inert, because the assert joins storage.objects.';

alter table public.testimony_photo_validations enable row level security;
alter table public.testimony_photo_validations force row level security;

revoke all on public.testimony_photo_validations from anon, authenticated;
grant all on public.testimony_photo_validations to service_role;

-- ---------------------------------------------------------------------------
-- The asserts
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER because the point is that the caller can NOT read this table. The
-- lookup is scoped to the caller's own folder as well as the path, so this cannot be
-- used as an oracle for whether some other member's object has been validated: to a
-- stranger's path it always answers the same way it answers to a path that does not
-- exist.
create function public.assert_photo_validated(target text)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  actor uuid := (select auth.uid());
begin
  -- Null target = no photo. Null actor = service role / seeds, already trusted.
  if target is null or actor is null then
    return;
  end if;

  if not exists (
    select 1
    from public.testimony_photo_validations v
    join storage.objects o
      on o.bucket_id = 'testimony-photos'
     and o.name = v.object_name
     and o.id = v.object_id
     and o.version is not distinct from v.object_version
    where v.object_name = target
      and split_part(v.object_name, '/', 1) = actor::text
  ) then
    raise exception 'this photo has not been checked yet'
      using errcode = 'check_violation';
  end if;
end;
$$;

comment on function public.assert_photo_validated(text) is
  'Refuses an image_path that the photo-guard edge function has not validated, or that has been re-written since it did (the join pins storage.objects.id and .version).';

-- How the guard records a pass. A SECURITY DEFINER function rather than a direct insert
-- from the edge function, for one reason: the object's identity, version and size are read
-- here from storage.objects, which is not exposed through the API and therefore cannot
-- have been shaped by anything the client sent. The function supplies only the verdict.
create function public.record_photo_validation(object_name text, content_type text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Both parameters share a name with a column of the target table. Copying them once
  -- keeps the function's public argument names readable for the RPC caller while the body
  -- stays unambiguous; the ON CONFLICT target below names the constraint for the same
  -- reason, since a bare `(object_name)` there resolves to the parameter and errors.
  target_name constant text := record_photo_validation.object_name;
  target_type constant text := record_photo_validation.content_type;
  found_object record;
begin
  select o.id as oid,
         o.version as oversion,
         coalesce((o.metadata ->> 'size')::bigint, 0) as osize
  into found_object
  from storage.objects o
  where o.bucket_id = 'testimony-photos'
    and o.name = target_name;

  if not found then
    raise exception 'no such photo object' using errcode = 'no_data_found';
  end if;

  -- Re-validating the same path is normal (a retry, or a member who re-picks): the
  -- record is the CURRENT truth about that object, so it is overwritten, not appended.
  insert into public.testimony_photo_validations
    (object_name, object_id, object_version, byte_size, content_type)
  values (
    target_name,
    found_object.oid,
    found_object.oversion,
    found_object.osize,
    target_type
  )
  on conflict on constraint testimony_photo_validations_pkey do update
    set object_id = excluded.object_id,
        object_version = excluded.object_version,
        byte_size = excluded.byte_size,
        content_type = excluded.content_type,
        validated_at = now();
end;
$$;

comment on function public.record_photo_validation(text, text) is
  'Service-role entry point for the photo-guard edge function: records that an object''s bytes were read and accepted. Never callable by anon or authenticated.';

revoke all on function public.record_photo_validation(text, text) from public;
revoke all on function public.record_photo_validation(text, text) from anon, authenticated;
grant execute on function public.record_photo_validation(text, text) to service_role;

-- Consent has to describe what the author is actually doing. Sharing a photo of other
-- people is the higher-stakes act, so it carries its own wording (docs/spec/20 §Photos)
-- and this ties the row to it.
create function public.assert_consent_covers_photo(target_version text)
returns void
language plpgsql
stable
as $$
begin
  if not exists (
    select 1 from public.consent_versions v
    where v.version = target_version and v.covers_photos
  ) then
    raise exception 'consent wording % does not cover sharing a photo', target_version
      using errcode = 'check_violation';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Both testimony guards, re-emitted with the two new asserts
-- ---------------------------------------------------------------------------
-- Bodies are 20260726120100 verbatim apart from the marked lines (`create or replace
-- function` takes no patches).

create or replace function public.testimonies_insert_guard()
returns trigger
language plpgsql
as $$
declare
  actor uuid := (select auth.uid());
begin
  if actor is null then
    return new;
  end if;

  perform public.assert_content_quota();
  perform public.assert_consent_version_active(new.consent_version);

  new.author_id := actor;
  select p.branch_id into new.branch_id
  from public.profiles p
  where p.id = actor;

  new.status := 'pending';
  new.moderated_by := null;
  new.moderated_at := null;
  new.rejection_reason := null;
  new.deleted_at := null;
  new.glory_count := 0;
  new.consented_at := coalesce(new.consented_at, now());

  perform public.assert_photo_path_owned(new.image_path);
  -- New in this migration: the photo must have been opened by the guard, and the
  -- consent recorded on the row must be wording that mentions photos.
  if new.image_path is not null then
    perform public.assert_photo_validated(new.image_path);
    perform public.assert_consent_covers_photo(new.consent_version);
  end if;
  perform public.assert_prayer_link_allowed(new.from_prayer_id);
  return new;
end;
$$;

create or replace function public.testimonies_update_guard()
returns trigger
language plpgsql
as $$
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
    or new.rejection_reason is distinct from old.rejection_reason;

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
      raise exception 'content changed since review'
        using errcode = 'serialization_failure';
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
$$;

-- ---------------------------------------------------------------------------
-- Objects become immutable once written
-- ---------------------------------------------------------------------------
-- 20260726120100 let a member overwrite their own object in place. Nothing in the app
-- needs it (paths are random uuids and uploads never upsert), and leaving it would mean
-- the validated bytes and the stored bytes could diverge between the guard's read and a
-- leader's review. The validation record's version pin already detects that; removing the
-- policy means it cannot happen in the first place. Replacing a photo is a new object
-- plus a delete, both of which stay allowed.
drop policy "members replace their own testimony photos" on storage.objects;
