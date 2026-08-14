-- W3.1 slice 1 (docs/spec/08 §Media architecture, docs/spec/02 §Storage, docs/spec/17 §4):
-- the shelf the self-hosted sermon audio lives on.
--
-- The posture decision `02` had left open was taken with Ayo on 2026-08-14: the bucket is
-- PRIVATE and playback URLs are SIGNED with a 24-hour TTL, minted when the player opens.
-- These audios are the church's own uploads (some sermons will never be on YouTube at all),
-- so a URL copied out of the app's traffic goes dead within a day instead of becoming a
-- permanent free door. 24 hours cannot expire mid-listen: a URL minted on open outlives any
-- single session, background included, and reopening mints a fresh one. Guests still listen;
-- the SELECT policy below is the mint permission and covers `anon`.
--
-- Rollback plan: rename the column back, drop the guard trigger + function, drop the three
-- policies and the bucket row.

-- Explicit transaction so `set local` binds (measured in 20260802120000: outside one it is
-- a warning no-op). The rename and the trigger both take ACCESS EXCLUSIVE on `sermons`,
-- which every Watch surface reads; three seconds then failing beats queueing every query
-- behind a waiting ALTER (~/.claude/standards/database.md §Migrations).
begin;

set local lock_timeout = '3s';

-- ---------------------------------------------------------------------------
-- The column: a PATH, not a URL
-- ---------------------------------------------------------------------------
-- Same shape lesson as testimonies.image_url -> image_path (W2.3): a signed URL expires, so
-- what belongs on the row is the object path. Same safety argument too, and only because of
-- it is a straight rename allowed here (~/.claude/standards/database.md): the column has
-- never held a value in any environment. No seed sets it, the sync's field policy never
-- touches it (20260720190000: audio is dashboard-owned), and prod carries none of the app
-- schema yet.

alter table public.sermons rename column audio_url to audio_path;

comment on column public.sermons.audio_path is
  'Object path inside the PRIVATE `sermon-audio` bucket, never a URL: playback URLs are signed (24h TTL) and minted on player open (docs/spec/08). Audio-only playback exists ONLY when present. Dashboard-owned; the sync never writes it.';

-- Leads the delete policy's referenced-check below; partial because almost every row is
-- null (the same shape as testimonies_image_path_idx).
create index sermons_audio_path_idx
  on public.sermons (audio_path)
  where audio_path is not null;

-- ---------------------------------------------------------------------------
-- The bucket
-- ---------------------------------------------------------------------------
-- 150 MiB covers ~2.5 hours at 128 kbps; a normal sermon at 64-128 kbps lands well under
-- half of that. The mime allowlist and the size cap are the two controls Storage enforces
-- server-side; the magic-byte check at attach time (dashboard, slice 1b) is a layer on top,
-- not a substitute (~/.claude/standards/security.md §File uploads). Local's global
-- [storage] file_size_limit is raised alongside in config.toml; PROD's global limit is a
-- dashboard setting and joins the `19` cutover checklist (needs the Pro plan, Track P P6).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'sermon-audio',
  'sermon-audio',
  false,
  157286400,
  array['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/x-m4a']
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Who writes, who reads
-- ---------------------------------------------------------------------------
-- Writers are live-table admins (caller_is_admin_live(), never a claim: ADR 0015) whose
-- session has cleared the dashboard's second factor. Requiring aal2 in a policy was ruled
-- OUT for content tables (it would lock every mobile member out the moment one enrolled a
-- factor; see apps/dashboard/src/server/authorize.ts), and is safe HERE for the same
-- reason inverted: no mobile member ever writes this bucket, so the claim check costs
-- nobody anything and an admin session that never cleared TOTP cannot shelve files.
--
-- Object names are forced to `<uuid>.<ext>`: random ids per docs/spec/02 §Storage, nothing
-- traversable, nothing human-written (a filename is where a speaker's phone number or a
-- member's name would otherwise sneak into a URL).
--
-- No UPDATE policy, deliberately: objects are write-once like testimony-photos, so the
-- bytes behind a path cannot change under it. Replacing audio is a new object plus a
-- delete, and removal clears sermons.audio_path FIRST (the guard below refuses a dangling
-- reference, so the other order cannot even be written).

create policy "admins shelve sermon audio"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'sermon-audio'
    and public.caller_is_admin_live()
    and public.jwt_claim('aal') = 'aal2'
    and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(mp3|m4a|aac)$'
  );

-- The referenced-check makes the removal order a mechanism instead of a convention: an
-- object a sermon still points at simply is not deletable (RLS filters it, 0 rows), so
-- "clear sermons.audio_path first" cannot be forgotten by a future caller. Together with
-- the guard below, a dangling reference cannot be CREATED from either side.
create policy "admins unshelve sermon audio"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'sermon-audio'
    and public.caller_is_admin_live()
    and public.jwt_claim('aal') = 'aal2'
    and not exists (
      select 1 from public.sermons s where s.audio_path = storage.objects.name
    )
  );

-- The mint permission. createSignedUrl() only works for a caller this policy admits, and
-- everyone is admitted: sermons are guest-first content (docs/spec/08 §Permissions), the
-- 24h TTL is the whole fence. Deliberately NOT gated on the sermon row's status: `08`'s
-- rot handling keeps audio playable when the YouTube half of a sermon vanishes.

create policy "sermon audio is mintable by everyone"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'sermon-audio');

-- ---------------------------------------------------------------------------
-- "A sermon cannot point at audio that is not there"
-- ---------------------------------------------------------------------------
-- The audio-only toggle enables itself on `audio_path is not null` (docs/spec/08), so a
-- dangling path is a player that offers audio and then dies on open. The reference is
-- checked when it is WRITTEN, which also fixes the removal order (clear the column, then
-- delete the object). Service-role writers (seeds, jobs) are exempt like every guard in
-- this schema; the storage read runs under the caller's own rights, which the SELECT
-- policy above grants to everyone.

create function public.assert_sermon_audio_exists(target text)
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
    where o.bucket_id = 'sermon-audio' and o.name = target
  ) then
    raise exception 'sermons.audio_path must reference an uploaded sermon-audio object'
      using errcode = 'check_violation';
  end if;
end;
$$;

create function public.sermons_audio_path_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' or new.audio_path is distinct from old.audio_path then
    perform public.assert_sermon_audio_exists(new.audio_path);
  end if;
  return new;
end;
$$;

create trigger sermons_audio_path_guard
  before insert or update on public.sermons
  for each row execute function public.sermons_audio_path_guard();

commit;
