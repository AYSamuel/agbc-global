-- Push targets + notification preferences (docs/spec/02). Own-rows only; a
-- notification_prefs row is auto-created for every profile by trigger, and fan-out
-- treats an absent row as the column defaults.

create type public.device_platform as enum ('ios', 'android');

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  -- Upserted on registration; deleted on sign-out and on DeviceNotRegistered
  -- receipts (docs/spec/15).
  expo_push_token text not null unique,
  platform public.device_platform not null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index devices_profile_id_idx on public.devices (profile_id);

alter table public.devices enable row level security;
alter table public.devices force row level security;

-- "Deleted accounts cannot write" (docs/spec/02): every write additionally requires
-- a live profile; the subquery runs under the caller's own RLS (own-row read).
create function public.caller_profile_is_live()
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.deleted_at is null
  );
$$;

create policy "members read their own devices"
  on public.devices for select
  using (profile_id = (select auth.uid()));

create policy "members register their own devices"
  on public.devices for insert
  with check (profile_id = (select auth.uid()) and public.caller_profile_is_live());

create policy "members update their own devices"
  on public.devices for update
  using (profile_id = (select auth.uid()) and public.caller_profile_is_live())
  with check (profile_id = (select auth.uid()));

create policy "members delete their own devices"
  on public.devices for delete
  using (profile_id = (select auth.uid()));

create table public.notification_prefs (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  ministry_announcements boolean not null default true,
  branch_updates boolean not null default true,
  service_reminders boolean not null default true,
  -- The wedge's reward loop (docs/spec/09/15).
  prayer_activity boolean not null default true,
  prayer_reminders boolean not null default true,
  testimony_activity boolean not null default true,
  whatsapp_opt_in boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.notification_prefs enable row level security;
alter table public.notification_prefs force row level security;

create policy "members read their own notification prefs"
  on public.notification_prefs for select
  using (profile_id = (select auth.uid()));

-- No client INSERT policy on purpose: rows exist only via the profile trigger.
create policy "members update their own notification prefs"
  on public.notification_prefs for update
  using (profile_id = (select auth.uid()) and public.caller_profile_is_live())
  with check (profile_id = (select auth.uid()));

create trigger notification_prefs_set_updated_at
  before update on public.notification_prefs
  for each row execute function public.set_updated_at();

-- Auto-create prefs for every new profile (docs/spec/02). SECURITY DEFINER because
-- the inserting member has no INSERT policy on notification_prefs by design.
create function public.create_notification_prefs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notification_prefs (profile_id)
  values (new.id)
  on conflict (profile_id) do nothing;
  return new;
end;
$$;

create trigger profiles_create_notification_prefs
  after insert on public.profiles
  for each row execute function public.create_notification_prefs();
