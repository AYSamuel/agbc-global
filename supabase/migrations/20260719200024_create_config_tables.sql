-- Remote configuration (docs/spec/02): app_config is read PRE-AUTH on launch (the
-- forced-update gate, docs/spec/21 §8); giving_config keeps bank details server-side
-- so changes never require an app release (docs/spec/12/22). Client writes: none
-- (admin writes ride service-role dashboard routes; an is_admin policy covers direct
-- admin tooling).

create table public.app_config (
  key text primary key,
  value jsonb not null,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);

create index app_config_updated_by_idx on public.app_config (updated_by);

alter table public.app_config enable row level security;
alter table public.app_config force row level security;

create policy "app config is publicly readable"
  on public.app_config for select
  using (true);

create policy "admins manage app config"
  on public.app_config for all
  using (public.is_admin())
  with check (public.is_admin());

create trigger app_config_set_updated_at
  before update on public.app_config
  for each row execute function public.set_updated_at();

create table public.giving_config (
  id uuid primary key default gen_random_uuid(),
  -- The full public giving structure from the website's site.ts (paypalUrl,
  -- currencies, accounts). Public-by-design values shown with copy buttons; still
  -- server-side so bank changes are config, not releases (docs/spec/12).
  accounts jsonb not null,
  updated_by uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);

create index giving_config_updated_by_idx on public.giving_config (updated_by);

alter table public.giving_config enable row level security;
alter table public.giving_config force row level security;

create policy "giving config is publicly readable"
  on public.giving_config for select
  using (true);

create policy "admins manage giving config"
  on public.giving_config for all
  using (public.is_admin())
  with check (public.is_admin());

create trigger giving_config_set_updated_at
  before update on public.giving_config
  for each row execute function public.set_updated_at();
