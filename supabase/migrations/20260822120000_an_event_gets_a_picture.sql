/**
 * W3.5 slice 4b (docs/spec/11, docs/spec/02 §Storage, docs/spec/17 §5): the picture an
 * event shows on its own page.
 *
 * `events.image_url` has existed since 20260724120000 and has never held a value: nothing
 * writes it (the dashboard form has no picture field), and the app renders it as the hero
 * behind EVENT-DETAIL's gradient, so every event has shown the branded cover since W1.4.
 * The column was the promise; this is the mechanism, and it arrives as a RENAME rather than
 * a new column for the same reason `testimonies` did in 20260726120100: what belongs in the
 * row is the PATH, and calling it a URL invites somebody to store one.
 *
 * WHAT IS COPIED FROM `sermon-artwork` (20260815140000), and it is nearly all of it: a
 * public-read bucket, 5 MiB, jpeg/png/webp, machine-minted `<uuid>.<ext>` names, no UPDATE
 * policy, a DELETE policy whose referenced-check makes the removal order a mechanism rather
 * than a convention, and a BEFORE trigger so a row cannot point at an object that is not
 * there. The posture argument transfers wholesale: this is the picture an event advertises
 * itself with, on a page a guest can open without an account, so there is nothing in it to
 * fence, and the three costs of a signed URL (image caching by URL, URLs that must not be
 * persisted, and a query that IS persisted for offline) are the costs here too.
 *
 * WHAT IS DIFFERENT, and it is one thing: WHO WRITES. A message is admin-only; an event
 * belongs to a branch and its own leaders run it (`events` INSERT is
 * `can_moderate_branch(branch_id)`). A storage object has no branch, so that function
 * cannot be the bucket's rule, and `caller_is_admin_live()` would lock out exactly the
 * people this slice is for. Hence `caller_is_moderator_live()` below: the same live-table
 * read, widened to leaders.
 *
 * Not branch-scoping the OBJECT (by folder, say) is deliberate. It would only decide which
 * leader may delete an ORPHAN, since attaching is already scoped by the row's own policy
 * and any leader can upload into their own folder anyway. It would buy a permanent branch
 * id in a public URL and a second place for the branch rule to live, for that.
 *
 * Rollback plan: drop the trigger + its two functions, drop the three policies and the
 * bucket row, drop `caller_is_moderator_live()`, rename the column back.
 */

begin;

-- `events` is read by every EVENTS and EVENT-DETAIL open and by the reminder jobs; the
-- rename takes ACCESS EXCLUSIVE (~/.claude/standards/database.md §Migrations).
set local lock_timeout = '3s';

-- ---------------------------------------------------------------------------
-- The column: a PATH, never a URL
-- ---------------------------------------------------------------------------
-- Renamed rather than added-and-dropped because it has never held a value (verified: 0 of 6
-- rows locally, and nothing has ever written it in any environment). A path even though this
-- bucket is public and the URL never expires: the URL is derivable from the path and the
-- reverse is not, and a stored URL would pin the project host into every row, which is the
-- thing that makes an environment migration painful (docs/spec/19).

alter table public.events rename column image_url to image_path;

comment on column public.events.image_path is
  'Object path inside the PUBLIC-READ `event-images` bucket, never a URL (the URL is derived; a stored one would pin the project host into the row). The hero behind EVENT-DETAIL''s gradient; null is the branded cover, which is a designed state (`11`). Renamed from `image_url` in W3.5 slice 4b, before it ever held a value. Trigger-checked to reference an existing object; a referenced object is not deletable, so clear the column first. Swapping it is a QUIET edit: only `starts_at_local` and `location` reach anyone (20260820120000, `11` §Notifications).';

-- Leads the delete policy's referenced-check; partial because most rows are null, the same
-- shape as sermons_artwork_path_idx and testimonies_image_path_idx.
create index events_image_path_idx
  on public.events (image_path)
  where image_path is not null;

-- ---------------------------------------------------------------------------
-- Who counts as a moderator, read from the live table
-- ---------------------------------------------------------------------------
-- `can_moderate_branch(uuid)` answers "may this caller act on THAT branch", which every
-- events policy asks and no storage policy can: a `storage.objects` row has no branch. This
-- is the same question with the branch dropped, for the one place that cannot supply one.
--
-- ADR 0015: authority is read from the live table, never from a JWT claim, because a claim
-- is minted at sign-in and a demotion after it would be invisible until the token refreshed.
-- `stable` and not `immutable`: it reads a table.
--
-- SECURITY DEFINER is deliberately NOT used, matching `can_moderate_branch`: the caller can
-- already read their own profile row under RLS, so a definer would add reach nobody needs
-- and would hand EXECUTE to PUBLIC by default.

create function public.caller_is_moderator_live()
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.deleted_at is null
      and p.role in ('admin', 'leader')
  );
$$;

comment on function public.caller_is_moderator_live is
  'True when the caller is an admin or a leader, read from the live table rather than a JWT claim (ADR 0015). `can_moderate_branch()` without the branch, for the one caller that has no branch to give it: a storage policy. Never use it where a branch IS available; scoping is not optional there.';

-- ---------------------------------------------------------------------------
-- The bucket
-- ---------------------------------------------------------------------------
-- Identical limits to `sermon-artwork`, and for the identical reasons: 5 MiB is generous for
-- a cover, and WebP earns its place on a picture members fetch on mobile data. The mime
-- allowlist and the size cap are what Storage enforces server-side; the magic-byte check at
-- save time (dashboard) is a layer on top, never a substitute
-- (~/.claude/standards/security.md §File uploads).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-images',
  'event-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Who writes
-- ---------------------------------------------------------------------------
-- Leaders as well as admins, which is the whole difference from the artwork shelf. `aal2`
-- costs them nothing and is not a widening of the dashboard's rule: `authorize()` already
-- refuses every route below aal2 and sends a leader to /mfa to enrol, so a leader who can
-- reach the events form has cleared it. It is here for the caller that does not come through
-- the dashboard at all.
--
-- Names are machine-minted `<uuid>.<ext>`: random per docs/spec/02, nothing traversable,
-- nothing human-written. That matters here as much as it does for artwork, because these
-- URLs are PUBLIC and permanent, and a filename is where a member's name would otherwise end
-- up in a link anyone can keep.

create policy "moderators hang event images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'event-images'
    and public.caller_is_moderator_live()
    and public.jwt_claim('aal') = 'aal2'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
  );

-- No UPDATE policy, deliberately, like every other bucket here: objects are write-once, so
-- the bytes behind a path cannot change under it. It matters more on a public bucket,
-- because the URL is cached by the CDN and by every member's `expo-image` disk cache;
-- swapping bytes in place would leave the old picture on devices for as long as those caches
-- live. Replacing a picture is a new object at a new path, which every cache reads as the
-- new picture it is.

create policy "moderators unhang event images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'event-images'
    and public.caller_is_moderator_live()
    and public.jwt_claim('aal') = 'aal2'
    and not exists (
      select 1 from public.events e where e.image_path = storage.objects.name
    )
  );

-- ---------------------------------------------------------------------------
-- Who reads the object ROW (which is not who reads the picture)
-- ---------------------------------------------------------------------------
-- The picture is served by the public route, which never consults RLS; the app holds a path
-- and builds that URL locally. So this is not the read boundary for members, and it is
-- scoped to the only caller that needs it: the dashboard, which lists an object to state its
-- size and the day it went up, and reads its first bytes back at save time. Left open it
-- would hand `list()` to `anon`, an enumeration of every path in the bucket for nobody's
-- benefit.

create policy "moderators read event image objects"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'event-images'
    and public.caller_is_moderator_live()
  );

-- ---------------------------------------------------------------------------
-- "An event cannot point at a picture that is not there"
-- ---------------------------------------------------------------------------
-- A dangling path is a broken hero on the event's own page, which is worse than the branded
-- cover it replaced: the fallback is designed and a broken image is not. The reference is
-- checked when it is WRITTEN, which is also what fixes the removal order.
--
-- Service-role writers (seeds, jobs) are exempt like every guard in this schema. The storage
-- read runs under the caller's own rights, and the SELECT policy above grants exactly the
-- moderators who are the only callers able to write this column at all.

create function public.assert_event_image_exists(target text)
returns void
language plpgsql
stable
as $$
begin
  if target is null or (select auth.uid()) is null then
    return;
  end if;
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'event-images' and o.name = target
  ) then
    raise exception 'events.image_path must reference an uploaded event-images object'
      using errcode = 'check_violation';
  end if;
end;
$$;

create function public.events_image_path_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' or new.image_path is distinct from old.image_path then
    perform public.assert_event_image_exists(new.image_path);
  end if;
  return new;
end;
$$;

-- Its own trigger rather than a clause inside `events_guard` / `events_update_guard`: those
-- two force the zone and police the status machine, and both are BEFORE triggers that only
-- assert and return, so the order Postgres runs them in cannot matter. One trigger, one
-- sentence about what it checks.
create trigger events_image_path_guard
  before insert or update on public.events
  for each row execute function public.events_image_path_guard();

commit;
