-- The avatars bucket exists (docs/spec/02 §Storage, `16` §DELETE).
-- ---------------------------------------------------------------------------
-- FOUND BY W4.5 SLICE 5's reach walk, 2026-09-02. `02` has listed an `avatars` bucket since
-- the schema was first written and no migration has ever created one, while `profiles.
-- avatar_url` has existed since W1.2 and `authenticated` holds a column UPDATE grant on it.
-- Three things were true at once, and only the third made it urgent:
--
--   * a spec that describes storage nobody can write to,
--   * a column any member may set to any string, checked by nothing, and
--   * an erasure that reads that column, records the path for `erasure-sweep`, and calls
--     `remove()` on a bucket that is not there, which throws, retries five times and then
--     raises a `job_alerts` row about a GDPR obligation nobody is working on.
--
-- Creating the bucket answers the third. It also makes the second REACHABLE for the first
-- time, which is why the path check is in this migration and not left for the uploader: with
-- objects in the bucket and no check, a member could point `avatar_url` at somebody else's
-- object and have their own erasure delete a stranger's picture. The hole is opened and
-- closed in one change rather than shipped and remembered.
--
-- WHAT THIS DOES NOT DO. There is still no uploader (`16`'s profile edit), and the app draws
-- a gradient with initials rather than a photograph, so nothing writes `avatar_url` yet.
-- Whoever builds that screen still owes: the re-encode + EXIF strip on upload that `02`
-- requires of every image ("a testimony photo can carry a member's home coordinates", and a
-- face is no less personal), and the rename of `avatar_url` to a path column, since its name
-- predates the W2.3 rule that a row holds a PATH and the sweep still skips anything
-- URL-shaped rather than guessing.

-- ---------------------------------------------------------------------------
-- The bucket
-- ---------------------------------------------------------------------------
-- Public-read, as `02` says, and for `sermon-artwork`'s reason rather than by default: a
-- profile picture is the face somebody chose to show the family on every card they appear
-- on, so there is nothing in it to fence, and all three costs of a signed URL apply (image
-- caching by URL, URLs that must never be persisted into an offline query, and a list that
-- would have to re-mint on every render). `public` widens only the READ path; who may put
-- bytes in is decided by the policies below and is narrower here than in any other public
-- bucket, because the writer is the member themselves.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Who writes
-- ---------------------------------------------------------------------------
-- The member, inside their own `<profile_id>/` folder and nowhere else: `testimony-photos`'s
-- rule with the moderation gate taken off, because a profile picture is not queued content.
-- The folder is what makes the erasure safe to run per member, and it is what the path check
-- further down holds `profiles.avatar_url` to.
--
-- No `aal2` here, unlike the artwork and event buckets. Those are written by staff from the
-- dashboard, where a second factor is already in hand; this is written by a member on a
-- phone, and there is no step-up in the app to demand.

create policy "members put up their own face"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ ('^[0-9a-f-]{36}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$')
    and exists (
      select 1 from public.profiles p
       where p.id = (select auth.uid()) and p.deleted_at is null
    )
  );

-- No UPDATE policy, deliberately, like every other bucket here: objects are write-once, so
-- the bytes behind a path cannot change under it. It matters most on a public bucket, whose
-- URL is cached by the CDN and by every member's `expo-image` disk cache; swapping bytes in
-- place would leave the old face on other people's devices for as long as those caches live.
-- Changing a picture is a new object at a new path, which every cache reads as what it is.

create policy "members take their own face down"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not exists (
      select 1 from public.profiles p where p.avatar_url = storage.objects.name
    )
  );

-- ---------------------------------------------------------------------------
-- Who reads the object ROW (which is not who reads the picture)
-- ---------------------------------------------------------------------------
-- The picture is served by the public route, which never consults RLS, and the app builds
-- that URL from the path it already holds. So this is not the read boundary for anybody
-- looking at a face; it exists so a member can `list()` their own folder to find the old
-- object they are replacing. Left open it would hand an enumeration of every path in the
-- bucket to `anon`, which is a directory of the congregation for nobody's benefit.

create policy "members read their own folder"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ---------------------------------------------------------------------------
-- "An avatar must live in its owner's folder"
-- ---------------------------------------------------------------------------
-- `assert_photo_path_owned()` says the same thing about a testimony photo, and its message
-- names testimonies, which is asserted elsewhere. A sibling is cheaper than a message that
-- has to describe two things at once.
--
-- STABLE and not SECURITY DEFINER, and granted to `authenticated`, because a trigger
-- function runs as the INVOKING role: an ungranted helper turns a member's own profile
-- update into a bare 42501 (the W3.4 lesson).

create function public.assert_avatar_path_owned(target text)
returns void
language plpgsql
stable
as $$
declare
  actor uuid := (select auth.uid());
begin
  -- Null target = no picture. Null actor = service role, seeds, jobs: already trusted.
  if target is null or actor is null then
    return;
  end if;
  -- A URL rather than a path: the column's unsettled shape (see the header). Nothing writes
  -- it today, and the sweep skips these for the same reason, so this refuses to judge one
  -- rather than reading a folder out of a hostname.
  if pg_catalog.strpos(target, '://') > 0 then
    return;
  end if;
  if pg_catalog.split_part(target, '/', 1) <> actor::text then
    raise exception 'an avatar must live in its owner''s own folder'
      using errcode = 'check_violation';
  end if;
end;
$$;

comment on function public.assert_avatar_path_owned(text) is
  'Refuses an avatar path outside the caller''s own storage folder. Without it a member could point their profile at a stranger''s object and have their own erasure delete it (docs/spec/16, W4.5 slice 5).';

grant execute on function public.assert_avatar_path_owned(text) to authenticated;

-- ---------------------------------------------------------------------------
-- The profiles guard learns about it
-- ---------------------------------------------------------------------------
-- Restated whole, as `20260901150000` restated the three content guards, because a trigger
-- function has no patch syntax and a diff of the body is the only honest record of what
-- changed. THE ONLY CHANGE is the avatar clause at the end, inside the member's own branch
-- so that service-role writes, seeds and the erasure itself pass through it untouched.

create or replace function public.profiles_guard()
returns trigger
language plpgsql
as $function$
declare
  -- Privileged = admin, or NO user context at all: service-role requests and
  -- direct DB connections (seeds, jobs, tests setup) carry no sub claim. A real
  -- member/leader request always has auth.uid(). The bootstrap promotion runs
  -- INSIDE the new member's own transaction, so it has their uid and needs the
  -- explicit flag to be recognised as server-owned.
  actor_is_privileged boolean :=
    public.caller_is_admin_live()
    or (select auth.uid()) is null
    or public.in_bootstrap_promote()
    or public.in_privileged_profile_write()
    -- W4.5: the account erasure, which runs under the departing member's own uid and is
    -- the one write that IS allowed to rewrite their own row (docs/spec/16).
    or public.in_account_erasure();
begin
  -- A privilege change is never self-service, admins included. This sits AHEAD of the
  -- privileged bypass on purpose, so that it binds the one actor the bypass would otherwise
  -- wave straight through. in_privileged_profile_write() is deliberately NOT in this
  -- condition: set_member_role refuses target = self outright, so no privileged profile
  -- write ever needs to change somebody's own role, while the bootstrap genuinely does.
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
  -- Chosen during onboarding, assigned afterwards. The POSITION matters, not just the rule:
  -- it sits after the onboarded_at check because ProfileStep's resume path writes branch_id
  -- and onboarded_at in one statement and reads `onboarded_at is set once` off the message
  -- to recognise "already onboarded elsewhere". Swap the two and a resuming member gets the
  -- generic error screen instead of being signed in. Pinned by 018.
  if old.onboarded_at is not null
     and new.branch_id is distinct from old.branch_id then
    raise exception 'a branch change is approved by a leader or admin, not self-assigned'
      using errcode = 'insufficient_privilege';
  end if;
  if new.created_at is distinct from old.created_at then
    raise exception 'created_at is immutable';
  end if;

  -- THE ONLY NEW CLAUSE (W4.5 slice 5). The bucket exists as of this migration, so a path
  -- here now names a real object that a real erasure will delete.
  if new.avatar_url is distinct from old.avatar_url then
    perform public.assert_avatar_path_owned(new.avatar_url);
  end if;

  return new;
end;
$function$;
