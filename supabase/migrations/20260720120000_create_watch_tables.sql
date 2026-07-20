-- Watch domain (docs/spec/02 Watch, docs/spec/08): sermons is a cache/index of
-- YouTube + self-hosted audio maintained by the nightly sync job; rows are marked
-- unavailable, NEVER deleted (resume positions, notes, and My List survive rot,
-- and restore is symmetric). The personal tables (resume, notes, My List) are
-- member-owned rows per the docs/spec/02 policy matrix.

create type public.sermon_status as enum ('available', 'unavailable');
-- Which channel tab a row came from (mirrors the website's watch page,
-- decision 2026-07-20): 'video' = the Videos tab (UULF playlist, long-form
-- uploads), 'live_replay' = the Live tab (UULV playlist, stream recordings).
create type public.sermon_kind as enum ('video', 'live_replay');

create table public.sermons (
  id uuid primary key default gen_random_uuid(),
  -- null => HQ/global (v1 syncs the HQ channel only, docs/spec/08).
  branch_id uuid references public.branches (id),
  title text not null,
  speaker text not null default '',
  -- Sync upserts on conflict (youtube_id) do update; partial unique below keeps
  -- manual audio-only rows (youtube_id null) collision-free (docs/spec/02).
  youtube_id text,
  -- Self-hosted MP3/AAC in Storage; audio-only exists ONLY when present
  -- (docs/spec/08: never play a YouTube audio track outside the embed).
  audio_url text,
  duration_sec integer check (duration_sec is null or duration_sec > 0),
  thumbnail_url text not null default '',
  series text,
  published_at timestamptz not null default now(),
  is_live boolean not null default false,
  -- Stale-live bound (docs/spec/08): clients treat is_live as false when this is
  -- older than 15 minutes; the nightly sync clears stale flags it finds.
  live_checked_at timestamptz,
  kind public.sermon_kind not null default 'video',
  status public.sermon_status not null default 'available',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.sermons is
  'Cache/index of YouTube + self-hosted audio; nightly sync populates from the channel, manual rows for audio-only (docs/spec/02, 08). Vanished videos go unavailable, never deleted.';

create unique index sermons_youtube_id_key
  on public.sermons (youtube_id)
  where youtube_id is not null;
create index sermons_branch_id_idx on public.sermons (branch_id);
-- The Watch rails read path: available sermons per tab section, newest first.
create index sermons_available_published_idx
  on public.sermons (kind, published_at desc)
  where status = 'available';

alter table public.sermons enable row level security;
alter table public.sermons force row level security;

-- Public content, guest-first (matrix row: anon/auth SELECT). Unavailable rows
-- stay readable: My List renders them greyed and notes remain reachable.
create policy "sermons are publicly readable"
  on public.sermons for select
  using (true);

create policy "admins manage sermons"
  on public.sermons for all
  using (public.is_admin())
  with check (public.is_admin());

create trigger sermons_set_updated_at
  before update on public.sermons
  for each row execute function public.set_updated_at();

-- Resume state (docs/spec/02): one row per member per sermon, throttled writes.
create table public.playback_positions (
  profile_id uuid not null references public.profiles (id),
  sermon_id uuid not null references public.sermons (id),
  position_sec integer not null default 0 check (position_sec >= 0),
  updated_at timestamptz not null default now(),
  primary key (profile_id, sermon_id)
);

create index playback_positions_sermon_id_idx
  on public.playback_positions (sermon_id);

alter table public.playback_positions enable row level security;
alter table public.playback_positions force row level security;

create policy "members own their playback positions"
  on public.playback_positions for all
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

create trigger playback_positions_set_updated_at
  before update on public.playback_positions
  for each row execute function public.set_updated_at();

-- Private sermon notes (docs/spec/02, 08): autosaved, one document per member
-- per sermon enforced client-side; the id PK matches 02's table.
create table public.sermon_notes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id),
  sermon_id uuid not null references public.sermons (id),
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index sermon_notes_profile_sermon_idx
  on public.sermon_notes (profile_id, sermon_id);
create index sermon_notes_sermon_id_idx on public.sermon_notes (sermon_id);

alter table public.sermon_notes enable row level security;
alter table public.sermon_notes force row level security;

create policy "members own their sermon notes"
  on public.sermon_notes for all
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

create trigger sermon_notes_set_updated_at
  before update on public.sermon_notes
  for each row execute function public.set_updated_at();

-- My List (docs/spec/02): membership row per saved sermon; created_at orders the
-- list (drift fix synced to 02 in this change).
create table public.saved_items (
  profile_id uuid not null references public.profiles (id),
  sermon_id uuid not null references public.sermons (id),
  created_at timestamptz not null default now(),
  primary key (profile_id, sermon_id)
);

create index saved_items_sermon_id_idx on public.saved_items (sermon_id);

alter table public.saved_items enable row level security;
alter table public.saved_items force row level security;

create policy "members own their saved items"
  on public.saved_items for all
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

-- Explicit privileges (RLS is the row boundary; GRANTs the table boundary).
-- sermons: public read; client writes NONE (the sync job + dashboard ride the
-- service role; the is_admin policy covers direct admin tooling, which connects
-- as authenticated). Personal tables: full own-row CRUD for members; anon gets
-- SELECT like profiles/devices do (RLS yields zero rows) so behavior is
-- identical between local (default-privilege) and CI (bare) environments.
grant select on public.sermons to anon, authenticated;
grant insert, update, delete on public.sermons to authenticated;
grant select
  on public.playback_positions, public.sermon_notes, public.saved_items
  to anon, authenticated;
grant insert, update, delete
  on public.playback_positions, public.sermon_notes, public.saved_items
  to authenticated;
grant all on public.sermons, public.playback_positions, public.sermon_notes,
  public.saved_items to service_role;
