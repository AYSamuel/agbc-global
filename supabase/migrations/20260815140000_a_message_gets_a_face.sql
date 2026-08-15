-- W3.1 slice 5 (docs/spec/08 §Media architecture, docs/spec/02 §Storage, docs/spec/17 §4):
-- the picture a message shows on every card.
--
-- A message created in the dashboard had none, anywhere. `thumbnail_url` is written by the
-- nightly sync from the YouTube Data API (`supabase/functions/youtube-sync/core.ts`), and a
-- message that was never on YouTube is never synced, so a midweek word was a blank navy
-- card in the rails, a blank cover on the player and no art at all on a lock screen.
--
-- The picture is therefore its OWN column in its OWN bucket, and the reason is worth
-- stating: putting it in `thumbnail_url` would have been shorter and would have died on
-- the next sync run, because that column is sync-owned (20260720190000's field policy) and
-- the upsert overwrites it every night. A column two writers both own is a column with no
-- owner.
--
-- Rollback plan: drop the trigger + its two functions, drop the column and its index, drop
-- the three policies and the bucket row.

-- ---------------------------------------------------------------------------
-- THE POSTURE, and why it is NOT the audio's
-- ---------------------------------------------------------------------------
-- `sermon-audio` is PRIVATE with 24-hour signed URLs (decided 2026-08-14). This bucket is
-- PUBLIC-READ, deliberately, and the difference is what the object IS rather than which
-- bucket was built last.
--
-- The audio is the asset: the church's own recording, the thing worth copying, and a URL
-- that dies within a day is a real fence against casual spread. The artwork is the
-- advertisement for it. It is chosen BY the church FOR public display, on every rail card
-- in a guest-first app; there is no privacy interest to protect and no moderation state
-- gating it, which is exactly what makes it unlike `testimony-photos` too (private because
-- a pending photo must be unreachable pre-review, and because it can carry a face, a child,
-- a hospital room: Art. 9 data, docs/spec/20). Fencing a picture whose entire purpose is to
-- be seen buys nothing.
--
-- Three costs settled it, all of which the audio never pays because it mints ONE URL per
-- player open where artwork appears on every card:
--
--   1. `expo-image` caches by URL. A rotating signature makes every re-mint a new cache
--      key, so the same picture would be re-downloaded on every rotation, on every screen.
--   2. Signed URLs must not be persisted: `features/watch/audioSource.ts` refuses to (a
--      bearer credential in AsyncStorage outlives the session that minted it), and the same
--      refusal would apply here. The sermons query IS persisted (docs/spec/04's offline
--      state), so the rails would paint from cache offline with every picture missing.
--   3. The lock screen is fetched by the OS itself, out of our process, possibly hours into
--      a background listen. A URL we cannot refresh is the wrong thing to hand it.
--
-- What `public` changes is ONLY the read path (`/storage/v1/object/public/...` skips RLS).
-- Writes stay exactly as fenced as the audio's: live-table admins at aal2, machine-minted
-- names, no UPDATE policy. The app needs no read policy at all, because `getPublicUrl()` is
-- string construction with no round trip; the SELECT policy below exists solely so the
-- dashboard can `list()` an object's size and date, and is admin-only for that reason.

begin;

-- Same lock discipline as 20260814120000: the column add and the trigger both take ACCESS
-- EXCLUSIVE on `sermons`, which every Watch surface reads (~/.claude/standards/database.md
-- §Migrations). `set local` binds only inside an explicit transaction.
set local lock_timeout = '3s';

-- ---------------------------------------------------------------------------
-- The column: a PATH, like every other object reference here
-- ---------------------------------------------------------------------------
-- A path even though this bucket is public and its URL never expires, for two reasons
-- beyond consistency: the URL is derivable from the path and the reverse is not, and a
-- stored URL would hard-code the project host into every row, which is exactly the thing
-- that makes an environment migration painful (docs/spec/19).

alter table public.sermons add column artwork_path text;

comment on column public.sermons.artwork_path is
  'Object path inside the PUBLIC-READ `sermon-artwork` bucket, never a URL (the URL is derived; a stored one would pin the project host into the row). The message''s OWN picture, uploaded in the dashboard, preferred over `thumbnail_url` everywhere both could exist. Never `thumbnail_url` itself: that column is sync-owned and overwritten nightly (20260720190000). Trigger-checked to reference an existing object; a referenced object is not deletable, so clear the column first.';

-- Leads the delete policy's referenced-check; partial because most rows are null, the same
-- shape as sermons_audio_path_idx and testimonies_image_path_idx.
create index sermons_artwork_path_idx
  on public.sermons (artwork_path)
  where artwork_path is not null;

-- ---------------------------------------------------------------------------
-- The bucket
-- ---------------------------------------------------------------------------
-- 5 MiB matches `testimony-photos` and is generous for a cover: a 1600x900 JPEG at good
-- quality lands near 400 KB. WebP joins jpeg/png here where it is absent there, and that
-- is a considered difference rather than drift: this picture is fetched on every rail card
-- by every member on mobile data, so the format that halves it earns its place, and its
-- magic bytes are as unambiguous as the other two (RIFF....WEBP inside the same twelve
-- bytes the audio check already reads).
--
-- The mime allowlist and the size cap are the two controls Storage enforces server-side;
-- the magic-byte check at save time (dashboard) is a layer on top, never a substitute
-- (~/.claude/standards/security.md §File uploads).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'sermon-artwork',
  'sermon-artwork',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Who writes
-- ---------------------------------------------------------------------------
-- Identical to the audio shelf, and safe for the identical inverted reason: requiring
-- `aal2` was ruled OUT on content tables because it would lock every mobile member out the
-- moment one enrolled a factor, and no mobile member ever writes this bucket, so the claim
-- check costs nobody anything. Authority is read from the live table, never a claim
-- (`caller_is_admin_live()`, ADR 0015).
--
-- Names are machine-minted `<uuid>.<ext>`: random ids per docs/spec/02, nothing traversable,
-- nothing human-written. That last part matters more here than for audio, because these
-- URLs are PUBLIC and permanent: a filename is where "berlin-youth-camp-photo-of-sarah.jpg"
-- would otherwise end up in a link anyone can keep.
--
-- One extension per format, `jpg` never `jpeg`: the extension comes from our own server-side
-- mint against a fixed map, so admitting two spellings of one format would only widen what
-- the regex has to say.

create policy "admins hang sermon artwork"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'sermon-artwork'
    and public.caller_is_admin_live()
    and public.jwt_claim('aal') = 'aal2'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
  );

-- No UPDATE policy, deliberately, same as the audio shelf and `testimony-photos`: objects
-- are write-once, so the bytes behind a path cannot change under it. That matters MORE on a
-- public bucket than a private one, because a public URL is cached by the CDN and by every
-- member's `expo-image` disk cache: bytes swapped in place would leave the old picture on
-- devices for as long as those caches live. Replacing artwork is a new object at a new path,
-- which is a new URL, which every cache treats as the new picture it is.

-- The referenced-check makes the removal order a mechanism rather than a convention: an
-- object a sermon still points at is simply not deletable (RLS filters it to 0 rows), so
-- "clear sermons.artwork_path first" cannot be forgotten by a future caller. With the guard
-- below, a dangling reference cannot be created from either side.
create policy "admins unhang sermon artwork"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'sermon-artwork'
    and public.caller_is_admin_live()
    and public.jwt_claim('aal') = 'aal2'
    and not exists (
      select 1 from public.sermons s where s.artwork_path = storage.objects.name
    )
  );

-- ---------------------------------------------------------------------------
-- Who reads the object ROW (which is not who reads the picture)
-- ---------------------------------------------------------------------------
-- The picture itself is served by the public route, which never consults RLS; the app holds
-- a path and builds that URL locally. So this policy is not the read boundary for members,
-- and it is scoped to the only caller that needs it: the dashboard, which lists an object to
-- state its size and the day it went up, and which reads its first bytes back through a
-- signed URL at save time. Left open to everyone it would hand `list()` to `anon`, which is
-- an enumeration of every path in the bucket for no one's benefit.

create policy "admins read sermon artwork objects"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'sermon-artwork'
    and public.caller_is_admin_live()
  );

-- ---------------------------------------------------------------------------
-- "A message cannot point at a picture that is not there"
-- ---------------------------------------------------------------------------
-- A dangling path is a broken image on every rail card, which is worse than the branded
-- gradient it replaced: the fallback is designed and a broken image is not. The reference is
-- checked when it is WRITTEN, which is also what fixes the removal order.
--
-- Its own function and its own trigger rather than an extension of the audio guard: two
-- columns, two objects, two names that each say what they check. Both are BEFORE triggers
-- that only assert and return, so the order Postgres runs them in cannot matter.
--
-- Service-role writers (seeds, jobs) are exempt like every guard in this schema. The storage
-- read runs under the caller's own rights, and the SELECT policy above grants exactly the
-- admins who are the only callers able to write this column at all.

create function public.assert_sermon_artwork_exists(target text)
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
    where o.bucket_id = 'sermon-artwork' and o.name = target
  ) then
    raise exception 'sermons.artwork_path must reference an uploaded sermon-artwork object'
      using errcode = 'check_violation';
  end if;
end;
$$;

create function public.sermons_artwork_path_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' or new.artwork_path is distinct from old.artwork_path then
    perform public.assert_sermon_artwork_exists(new.artwork_path);
  end if;
  return new;
end;
$$;

create trigger sermons_artwork_path_guard
  before insert or update on public.sermons
  for each row execute function public.sermons_artwork_path_guard();

commit;
