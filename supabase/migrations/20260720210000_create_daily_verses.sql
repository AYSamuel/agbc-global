-- Daily verse (docs/spec/02 daily_verses, docs/spec/07): one verse per day per
-- language, free for everyone. Translation is WEB (World English Bible), public
-- domain, so storing the text and rendering it on branded share images is
-- licensing-clean (decision 2026-07-12). Content is admin-managed via the
-- dashboard from Phase A (docs/spec/17), never an external API at runtime.

create table public.daily_verses (
  id uuid primary key default gen_random_uuid(),
  -- Anchored to the user's DEVICE-LOCAL date (docs/spec/07 midnight rollover):
  -- a plain date, never a timestamp.
  date date not null,
  reference text not null,
  text text not null,
  translation text not null default 'WEB',
  language text not null default 'en'
    check (language in ('en', 'de', 'nl', 'fr')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One verse per day per language; the pair is also the read path's index
  -- (Home queries date = today and language = the UI language).
  unique (date, language)
);

comment on table public.daily_verses is
  'One verse per day per language (WEB, public domain). Seeded/managed by admins via the dashboard; the queue monitor alerts below 14 future rows (docs/spec/21 §5).';

alter table public.daily_verses enable row level security;
alter table public.daily_verses force row level security;

-- Public content, guest-first (docs/spec/02 policy matrix).
create policy "daily verses are publicly readable"
  on public.daily_verses for select
  using (true);

create policy "admins manage daily verses"
  on public.daily_verses for all
  using (public.is_admin())
  with check (public.is_admin());

create trigger daily_verses_set_updated_at
  before update on public.daily_verses
  for each row execute function public.set_updated_at();

-- Explicit privileges (RLS is the row boundary; GRANTs the table boundary);
-- anon holds SELECT so behavior matches between the local stack and CI.
grant select on public.daily_verses to anon, authenticated;
grant insert, update, delete on public.daily_verses to authenticated;
grant all on public.daily_verses to service_role;
