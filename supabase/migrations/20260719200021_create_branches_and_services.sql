-- Branches + machine-readable service schedule (docs/spec/02 Core identity).
-- Public content: anonymous read is the product (guest-first); no client writes
-- (branch management is a dashboard/service-role concern, docs/spec/17).

create type public.branch_status as enum ('active', 'archived');
create type public.service_kind as enum ('sunday', 'midweek', 'classes');

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  city text not null,
  country text not null,
  is_hq boolean not null default false,
  -- Branches are ARCHIVED, never hard-deleted: attendance/content/audit rows
  -- reference them (docs/spec/02).
  status public.branch_status not null default 'active',
  -- IANA id; acts exactly once, at attendance write time (docs/spec/02).
  timezone text not null,
  languages text not null default '',
  youtube_channel_id text,
  email text not null default '',
  lat numeric not null,
  lng numeric not null,
  -- Display strings only; the machine-readable schedule is branch_services.
  service_times jsonb not null default '{}'::jsonb,
  address jsonb not null default '{}'::jsonb,
  lead jsonb not null default '{}'::jsonb,
  leaders jsonb not null default '[]'::jsonb,
  welcome text not null default '',
  quote text,
  "order" integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.branches is
  'Church branches; archived (never deleted) per docs/spec/02. Seeded from the website JSON merged with the augmentation map (seeds/00-common.sql).';

alter table public.branches enable row level security;
alter table public.branches force row level security;

create policy "branches are publicly readable"
  on public.branches for select
  using (true);

create table public.branch_services (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id),
  -- 0 = Sunday .. 6 = Saturday.
  weekday smallint not null check (weekday between 0 and 6),
  -- Branch-local wall clock; DST resolution rules live in docs/spec/02.
  start_time time not null,
  kind public.service_kind not null,
  -- Service WINDOW = [start_time - 30 min, start_time + duration_min] everywhere it
  -- is load-bearing (live detection, live-watch credit, the "I'm here" affordance).
  duration_min integer not null default 120,
  label text not null default '',
  created_at timestamptz not null default now()
);

create index branch_services_branch_id_idx on public.branch_services (branch_id);

alter table public.branch_services enable row level security;
alter table public.branch_services force row level security;

create policy "branch services are publicly readable"
  on public.branch_services for select
  using (true);

-- Shared helper used by every table carrying updated_at.
create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger branches_set_updated_at
  before update on public.branches
  for each row execute function public.set_updated_at();

-- Explicit privileges: never rely on ambient default-privilege bootstrap (a db-only
-- environment has none, and explicitness is least-privilege anyway). RLS remains the
-- row boundary; GRANTs are the table boundary.
grant usage on schema public to anon, authenticated, service_role;
grant select on public.branches, public.branch_services to anon, authenticated;
grant all on public.branches, public.branch_services to service_role;
