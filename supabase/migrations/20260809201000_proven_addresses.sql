-- Proven addresses (W2.9 slice 2; ADR 0017 decision 3).
--
-- `profile_emails` holds the addresses a member has PROVEN control of, so the email
-- match on course_registrations reads a SET of addresses rather than the one on
-- auth.users. Claim once, and every later website registration by that address is
-- theirs; spend the proof on a single row instead and the same person is back to
-- "not registered" the next time they book a course.
--
-- Rows arrive ONLY through the claim flow's verify RPC (next migration): a client
-- cannot insert a proven address, because the insert IS the proof. Members read and
-- delete their own rows (removing an address just stops future matching; it unlinks
-- nothing that was already linked).
--
-- Retention: personal data keyed to a profile, so it rides the account-deletion path
-- in docs/spec/16 via the FK cascade (the ADR records this as a named cost).
--
-- Rollback (roll forward): a compensating migration drops the trigger, the function,
-- and the table. Nothing else references them until the claim migration lands.

create table public.profile_emails (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  -- Stored normalized (lower/trim) by the verify RPC; the unique index below holds
  -- either way, because a stray capital must not mint a second proof.
  email text not null,
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table public.profile_emails is
  'Addresses a member has proven by entering a code sent to them (ADR 0017). Written only by verify_email_claim; the email match on course_registrations reads this set plus auth.users. Cascades with account deletion (docs/spec/16).';

-- One owner per address, however it is capitalized: two members proving the same
-- mailbox would let either read the other''s registrations by that address.
create unique index profile_emails_normalized_uniq
  on public.profile_emails (lower(trim(email)));
create index profile_emails_profile_idx on public.profile_emails (profile_id);

/**
 * An address that IS somebody's login may never become somebody else's proven address
 * (ADR 0017: "linking it would let one account absorb another's identity"). The claim
 * RPC refuses this politely; this trigger is the constraint behind the refusal, so a
 * migration, a seed, or a careless service write meets the same wall.
 *
 * SECURITY DEFINER because it reads auth.users, which the invoking role may not.
 */
create function public.profile_emails_insert_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from auth.users u
    where lower(trim(u.email)) = lower(trim(new.email))
      and u.id <> new.profile_id
  ) then
    raise exception 'this address is another account''s sign-in address'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger profile_emails_guard
  before insert or update on public.profile_emails
  for each row execute function public.profile_emails_insert_guard();

/**
 * Does this address belong to the caller: their sign-in address, or one they have
 * proven. The policy on course_registrations asks this per row.
 *
 * SECURITY DEFINER because it reads auth.users, and per ADR 0017 it must NEVER read
 * auth.jwt() ->> 'email': a claim is a cached copy, the table is the truth (the same
 * rule that gives us caller_is_admin_live()). Both sides are compared as
 * lower(trim(...)), because a stray capital would present as "the app forgot my
 * registration".
 *
 * Answers only about the CALLER's own addresses: passing a stranger's address returns
 * false without revealing whether it exists anywhere.
 */
create function public.email_belongs_to_caller(target text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and lower(trim(target)) in (
      select lower(trim(u.email))
      from auth.users u
      where u.id = (select auth.uid()) and u.email is not null
      union
      select lower(trim(pe.email))
      from public.profile_emails pe
      where pe.profile_id = (select auth.uid())
    );
$$;

comment on function public.email_belongs_to_caller is
  'True when the address is the caller''s sign-in address or one they proved via the claim flow (ADR 0017). Reads auth.users through definer rights, never a JWT claim; compares lower(trim(...)) on both sides.';

revoke all on function public.email_belongs_to_caller(text)
  from public, anon, authenticated, service_role;
grant execute on function public.email_belongs_to_caller(text) to authenticated;

-- --- who may read what -----------------------------------------------------------------

alter table public.profile_emails enable row level security;
alter table public.profile_emails force row level security;

create policy "members read their own proven addresses"
  on public.profile_emails for select
  using (profile_id = (select auth.uid()));

create policy "members remove their own proven addresses"
  on public.profile_emails for delete
  using (profile_id = (select auth.uid()));

create policy "admins read proven addresses"
  on public.profile_emails for select
  using (public.caller_is_admin_live());

-- No client INSERT or UPDATE anywhere: the verify RPC (SECURITY DEFINER) is the only
-- writer, because writing a row here IS the claim being proven (issue #96 posture:
-- start from zero, grant back exactly what is needed).
revoke all on public.profile_emails from anon, authenticated;
grant select, delete on public.profile_emails to authenticated;
