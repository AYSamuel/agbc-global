-- W2.3 · Compose slice, part 2: the testimony photo path.
--
-- docs/spec/02 §Storage specifies `testimony-photos` as a PRIVATE bucket whose objects
-- are reachable by signed URL only for approved rows, so a photo attached to a pending
-- testimony is unreachable before a leader has looked at it. None of it existed yet:
-- no bucket, no object policy, and the column that points at the object was called
-- `image_url`, which is the wrong shape entirely (a signed URL expires; what belongs on
-- the row is the object path).
--
-- Renaming a column is normally an expand/backfill/contract sequence (~/.claude/standards
-- /database.md). Straight rename is safe here and only here: the column has never held a
-- value in any environment (no seed sets it, no client writes it), and prod has no rows
-- at all. Doing it now costs nothing; doing it after launch would cost a release cycle.
--
-- Rollback plan: rename back, recreate the view and guard from the W1.5 migration, drop
-- the storage policies and the bucket row.

alter table public.testimonies rename column image_url to image_path;

comment on column public.testimonies.image_path is
  'Object path inside the PRIVATE `testimony-photos` bucket (`<author_id>/<uuid>.jpg`), never a URL: URLs for this bucket are signed and expire. Readable only per the storage.objects policies below (docs/spec/02 §Storage).';

-- Leads the storage SELECT policy's lookup; partial because almost every row is null.
create index testimonies_image_path_idx
  on public.testimonies (image_path)
  where image_path is not null;

-- The feed is dropped and rebuilt rather than replaced: `create or replace view` refuses
-- to rename an output column. Body is the W1.5 original with the renamed column.
drop view public.testimony_feed;

create view public.testimony_feed
with (security_invoker = false) as
select
  t.id,
  t.branch_id,
  t.body,
  t.language,
  t.category_id,
  c.key as category_key,
  t.image_path,
  t.from_prayer_id,
  t.glory_count,
  t.created_at,
  t.updated_at,
  t.author_id,
  a.display_name as author_name,
  a.avatar_url as author_avatar_url,
  -- The ribbon is a LINK only while the origin prayer is itself publicly visible;
  -- otherwise the app degrades it to a static label (docs/spec/09).
  (
    select p.id from public.prayers p
    where p.id = t.from_prayer_id
      and p.status = 'approved'
      and p.deleted_at is null
  ) as origin_prayer_id
from public.testimonies t
join public.profiles a on a.id = t.author_id
left join public.testimony_categories c on c.id = t.category_id
where t.status = 'approved'
  and t.deleted_at is null
  -- Two-way block filter, inlined (see the note in the W1.5 migration). A guest has no
  -- auth.uid(), so blocks nobody and is blocked by nobody.
  and not exists (
    select 1 from public.blocked_users b
    where (b.blocker_id = (select auth.uid()) and b.blocked_id = t.author_id)
       or (b.blocked_id = (select auth.uid()) and b.blocker_id = t.author_id)
  );

comment on view public.testimony_feed is
  'The ONLY public read path for testimonies (docs/spec/09). Security-definer by design: this WHERE clause is the public-visibility boundary.';

grant select on public.testimony_feed to anon, authenticated;

-- ---------------------------------------------------------------------------
-- "A member cannot claim someone else's photo"
-- ---------------------------------------------------------------------------
-- Without this, a member could point their own testimony at another member's object
-- path and, once a leader approved the testimony, mint a signed URL for a private photo
-- they were never allowed to see. The storage policies below hang the public-read
-- decision on "is there an approved testimony referencing this object", so ownership of
-- the reference is exactly as load-bearing as ownership of the object.

create function public.assert_photo_path_owned(target text)
returns void
language plpgsql
stable
as $$
declare
  actor uuid := (select auth.uid());
begin
  -- Null target = no photo. Null actor = service role / seeds, already trusted.
  if target is null or actor is null then
    return;
  end if;
  if split_part(target, '/', 1) <> actor::text then
    raise exception 'a testimony photo must live in the author''s own folder'
      using errcode = 'check_violation';
  end if;
end;
$$;

-- Both guards re-emitted in full (create or replace takes no patches): the insert guard
-- gains the ownership assert, the update guard gains it and follows the column rename.

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
    -- "removed is terminal for authors": edits refused, delete stays allowed.
    if old.status = 'removed' then
      raise exception 'removed content cannot be edited; only an admin may restore it'
        using errcode = 'insufficient_privilege';
    end if;
    perform public.assert_photo_path_owned(new.image_path);
    perform public.assert_prayer_link_allowed(new.from_prayer_id);
    -- Any author edit re-enters moderation and leaves the public feed until it is
    -- re-approved (docs/spec/02, 09). Reactions are retained.
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
    -- Compare-and-set (docs/spec/02): the moderator carries the updated_at of the
    -- version they reviewed. If the author edited in between, OLD has moved on.
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
-- The bucket
-- ---------------------------------------------------------------------------
-- Private, 5 MiB, images only. The mime allowlist and the size cap are the two controls
-- Storage itself enforces server-side; the client re-encode (EXIF/GPS stripping) and the
-- magic-byte check are layers on top, not substitutes (~/.claude/standards/security.md
-- §File uploads).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'testimony-photos',
  'testimony-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png']
)
on conflict (id) do nothing;

-- "Can this caller read this object?" SECURITY DEFINER for the same reason as
-- testimony_is_published: the asker is precisely someone whose RLS on `testimonies` does
-- not cover the row (a guest looking at another member's approved photo). Postgres
-- grants EXECUTE on this to PUBLIC, so it must disclose nothing new: it does not. The
-- approved half repeats what public.testimony_feed already publishes, and the moderator
-- half answers false for everyone who is not that branch's leader.
create function public.can_read_testimony_photo(object_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.testimonies t
    where t.image_path = object_name
      and (
        (t.status = 'approved' and t.deleted_at is null)
        or public.can_moderate_branch(t.branch_id)
      )
  );
$$;

-- Members write only inside their own folder; the folder name IS the author id, which is
-- what assert_photo_path_owned above ties back to the row.
create policy "members upload their own testimony photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'testimony-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.caller_is_onboarded()
  );

create policy "members replace their own testimony photos"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'testimony-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'testimony-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "members delete their own testimony photos"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'testimony-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- The read boundary. An author always reaches their own object (their pending photo is
-- theirs to see); everyone else reaches it only once an approved testimony points at it,
-- or if they moderate that testimony's branch. A signed URL cannot be minted without
-- passing this, which is what makes "pending photos are unreachable pre-review" true.
--
-- Deviation from docs/spec/02, synced in this PR: `02` said an edge function would mint
-- the signed URLs. Storage RLS gives the identical guarantee with no extra service on
-- the read path, and one less place for the rule to be re-implemented wrongly.
create policy "testimony photos are readable when approved"
  on storage.objects for select
  to anon, authenticated
  using (
    bucket_id = 'testimony-photos'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or public.can_read_testimony_photo(name)
    )
  );
