-- Profiles: the app user (docs/spec/02), email identity per ADR 0011, with the
-- write-path invariants that make "never trust the client" true. Server-trusted:
-- triggers + RLS are the mechanism, never the UI.

create type public.profile_role as enum ('member', 'leader', 'admin');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  -- The sign-in identity (mirrors auth.users.email; verified by definition, docs/spec/02).
  email text not null unique,
  -- Optional, E.164; collected ONLY at WhatsApp broadcast opt-in (docs/spec/15).
  phone text unique,
  display_name text not null default '',
  avatar_url text,
  branch_id uuid not null references public.branches (id),
  language text not null default 'en'
    check (language in ('en', 'de', 'nl', 'fr')),
  role public.profile_role not null default 'member',
  theme_pref text not null default 'system'
    check (theme_pref in ('system', 'light', 'dark')),
  -- Set ONLY when AUTH-3 completes; write policies elsewhere additionally require
  -- onboarded_at is not null (docs/spec/03).
  onboarded_at timestamptz,
  age_confirmed_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_branch_id_idx on public.profiles (branch_id);

-- JWT claim helpers. Custom claims are injected by the access token hook
-- (20260719200025_custom_access_token_hook.sql); wrap auth.uid() in (select ...)
-- inside policies per the docs/spec/02 per-row re-evaluation footgun.
create function public.jwt_claim(claim text)
returns text
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> claim;
$$;

create function public.jwt_role()
returns text
language sql
stable
as $$
  select coalesce(public.jwt_claim('user_role'), 'member');
$$;

create function public.is_admin()
returns boolean
language sql
stable
as $$
  select public.jwt_role() = 'admin';
$$;

alter table public.profiles enable row level security;
alter table public.profiles force row level security;

create policy "members read their own profile"
  on public.profiles for select
  using (id = (select auth.uid()));

-- Leaders read rows in their branch (the column-limited view arrives with the
-- dashboard, docs/spec/17); admins read all.
create policy "leaders read profiles in their branch"
  on public.profiles for select
  using (
    public.jwt_role() in ('leader', 'admin')
    and (public.is_admin() or branch_id = (public.jwt_claim('branch_id'))::uuid)
  );

create policy "members create their own profile"
  on public.profiles for insert
  with check (
    id = (select auth.uid())
    and role = 'member'
    and deleted_at is null
  );

create policy "members update their own profile"
  on public.profiles for update
  using (id = (select auth.uid()) and deleted_at is null)
  with check (id = (select auth.uid()));

-- Invariant guards (docs/spec/02): role immutable to its owner; email changes only
-- via the auth flow (service role); deletion only via the deletion job;
-- onboarded_at / age_confirmed_at are one-time sets (AUTH-3), never changed after.
create function public.profiles_guard()
returns trigger
language plpgsql
as $$
declare
  -- Privileged = admin claim, or NO user context at all: service-role requests and
  -- direct DB connections (seeds, jobs, tests setup) carry no sub claim. A real
  -- member/leader request always has auth.uid().
  actor_is_privileged boolean :=
    public.is_admin() or (select auth.uid()) is null;
begin
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
  if new.created_at is distinct from old.created_at then
    raise exception 'created_at is immutable';
  end if;

  return new;
end;
$$;

create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.profiles_guard();

-- Non-privileged inserts are always member-role, self-owned.
create function public.profiles_insert_guard()
returns trigger
language plpgsql
as $$
begin
  if public.is_admin() or (select auth.uid()) is null then
    return new;
  end if;
  new.role := 'member';
  new.id := (select auth.uid());
  return new;
end;
$$;

create trigger profiles_insert_guard
  before insert on public.profiles
  for each row execute function public.profiles_insert_guard();

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();
