-- Bootstrap the first admin (docs/spec/17, W2.7 slice 1). The dashboard authorizes
-- against profiles.role, so SOMEONE has to hold 'admin' before any leader can be
-- promoted through it. Two existing rules make the obvious approaches impossible,
-- and both are load-bearing rather than obstacles:
--
--   * nothing but the member creates their own profile (docs/spec/03 AUTH-3, the
--     "members create their own profile" policy pins role = 'member'), so a
--     migration cannot UPDATE a row that does not exist yet;
--   * profiles_guard refuses any role change by the row's owner, which is the rule
--     that stops a member promoting themselves. Relaxing it to solve a bootstrapping
--     problem would trade a real control for a convenience.
--
-- So the promotion is declared here as data and applied by a trigger, the same
-- shape the counter triggers already use: SECURITY DEFINER work that announces
-- itself to the guard through a transaction-local flag (agbc.counter_write is the
-- precedent). Production gets its first admin by applying this same migration, which
-- makes the grant audit-visible in git rather than a hand-typed UPDATE nobody saw.
--
-- Rollback (roll forward, per the database standard): a compensating migration drops
-- the trigger and the table, restores profiles_guard to its two-clause form, and
-- demotes the seeded account with an explicit UPDATE. Dropping this table alone does
-- NOT demote anyone: the promotion has already been written to profiles.role.
--
-- Retention: one row of personal data (an email), kept only while the grant stands;
-- its lawful basis is running the ministry's own service (docs/spec/20). Deleting the
-- row is the deletion path, and the account-deletion job must reach it when that job
-- is built (docs/spec/16, Phase 3): it is deliberately outside profiles' cascade,
-- because a member deleting their app account must not silently revoke an admin grant.

create table public.bootstrap_admins (
  -- The sign-in identity, matched case-insensitively against profiles.email. Stored
  -- lowercase so the allowlist cannot hold the same address twice in different cases.
  email text primary key check (email = lower(email)),
  -- Why this address is on the list; read by humans reviewing the grant, never by code.
  note text not null,
  created_at timestamptz not null default now()
);

comment on table public.bootstrap_admins is
  'Allowlist of emails promoted to admin on profile creation (docs/spec/17). Not exposed through the API: no GRANTs, no policies.';

-- RLS forced and NO policies, deliberately: this table is trigger-only.
alter table public.bootstrap_admins enable row level security;
alter table public.bootstrap_admins force row level security;

-- The REVOKE is not redundant. Supabase's project bootstrap sets ALTER DEFAULT
-- PRIVILEGES ... GRANT ALL ON TABLES TO anon, authenticated, service_role, so a new
-- table in `public` arrives with full privileges for every API role and "we granted
-- nothing" means "everything was granted for us". RLS alone would still hide the rows
-- from anon and authenticated, but service_role carries BYPASSRLS and would read and
-- WRITE this allowlist freely. Revoking is what actually makes the second boundary
-- real: the table is now reachable only by the SECURITY DEFINER trigger below and by
-- direct migration connections. (Verified against the live local stack 2026-07-29;
-- the same default silently widens every other table in this schema, tracked as a
-- separate sweep.)
revoke all on public.bootstrap_admins from anon, authenticated, service_role;

-- The promotion write. Mirrors public.in_counter_write(): explicit intent beats
-- inferring it from pg_trigger_depth().
create function public.in_bootstrap_promote()
returns boolean
language sql
stable
as $$
  select coalesce(current_setting('agbc.bootstrap_promote', true), 'off') = 'on';
$$;

-- AFTER INSERT, not BEFORE: the profile must exist as the member's own row, created
-- through their own policy, exactly as AUTH-3 writes it. The promotion is a separate,
-- server-owned act on top of that row.
create function public.profiles_bootstrap_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.bootstrap_admins b
    where lower(b.email) = lower(new.email)
  ) then
    return null;
  end if;

  perform set_config('agbc.bootstrap_promote', 'on', true);
  update public.profiles
    set role = 'admin'
    where id = new.id and role is distinct from 'admin';
  perform set_config('agbc.bootstrap_promote', 'off', true);

  return null;
end;
$$;

create trigger profiles_bootstrap_admin
  after insert on public.profiles
  for each row execute function public.profiles_bootstrap_admin();

-- Teach the invariant guard about the flag. Everything else about the guard is
-- unchanged: an owner still cannot touch their own role, and the promotion above is
-- the only writer that can raise this flag (the setting is transaction-local and
-- set inside a SECURITY DEFINER function; a client has no SQL surface to call
-- set_config through PostgREST).
create or replace function public.profiles_guard()
returns trigger
language plpgsql
as $$
declare
  -- Privileged = admin claim, or NO user context at all: service-role requests and
  -- direct DB connections (seeds, jobs, tests setup) carry no sub claim. A real
  -- member/leader request always has auth.uid(). The bootstrap promotion runs
  -- INSIDE the new member's own transaction, so it has their uid and needs the
  -- explicit flag to be recognised as server-owned.
  actor_is_privileged boolean :=
    public.is_admin()
    or (select auth.uid()) is null
    or public.in_bootstrap_promote();
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

-- The grant itself. Ayo's app address, the same identity he signs into the mobile
-- app with (docs/spec/17 has no separate admin identity; dedicated admin accounts
-- are a Phase B item once role assignment exists in the dashboard).
insert into public.bootstrap_admins (email, note)
values (
  'aysamuel007@gmail.com',
  'First admin, seeded at W2.7 so the dashboard has someone who can promote leaders (docs/spec/17).'
)
on conflict (email) do nothing;

-- Order must not matter: if the profile already exists when this migration runs,
-- promote it now. A migration runs on a direct connection with no user context, so
-- profiles_guard already treats this as privileged; the flag is raised anyway so
-- that this statement does not quietly depend on how it happens to be applied.
do $$
begin
  perform set_config('agbc.bootstrap_promote', 'on', true);
  update public.profiles p
    set role = 'admin'
    from public.bootstrap_admins b
    where lower(p.email) = lower(b.email)
      and p.role is distinct from 'admin';
  perform set_config('agbc.bootstrap_promote', 'off', true);
end;
$$;
