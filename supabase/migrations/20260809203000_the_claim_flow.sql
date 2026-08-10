-- The claim flow (W2.9 slice 2; ADR 0017 decision 3): a member proves a second address
-- by entering a code sent to it, and their website registrations by that address become
-- theirs.
--
-- NOT Supabase auth, deliberately: signInWithOtp on the second address would sign them
-- in AS that address, and updateUser({email}) would REPLACE their login. Neither is
-- what "also mine" means. This is its own small ledger plus two SECURITY DEFINER RPCs,
-- called only by the email-claim edge function with the service key; the function owns
-- transport (Resend, rate limiting per caller and per target), the RPCs own every
-- decision, so pgTAP can hold the whole decision surface still.
--
-- Two refusals matter more than the happy path (ADR 0017): an address that is another
-- account's sign-in address is REFUSED ("sign in with that address instead"), and
-- nothing before verification reveals whether an address has registrations. Note what
-- request_email_claim never looks at: course_registrations.
--
-- Codes are hashed at rest (salted: a six-digit space is nothing against a rainbow
-- table), single use, short lived (15 minutes), attempt-capped (5), and bounded in the
-- DATABASE per caller and per target address, because the edge function's in-memory
-- limiter only bounds one warm instance.
--
-- Retention: rows expire in minutes and carry an address, so every request pass sweeps
-- claims older than a day; the profile FK cascades with account deletion.
--
-- Rollback (roll forward): a compensating migration drops the two RPCs, the trigger,
-- the table. profile_emails and the linking survive it.

create extension if not exists pgcrypto with schema extensions;

create table public.email_claims (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  -- Normalized (lower/trim) by the request RPC before insert.
  email text not null,
  code_salt text not null,
  code_hash text not null,
  attempts integer not null default 0,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.email_claims is
  'Pending proofs for the claim flow (ADR 0017). Codes salted+hashed, 15-minute expiry, 5 attempts, single use. No client role touches this table at all; the two RPCs are the only doors. Swept after a day.';

create index email_claims_profile_idx
  on public.email_claims (profile_id, created_at desc);
create index email_claims_email_idx
  on public.email_claims (email, created_at desc);

alter table public.email_claims enable row level security;
alter table public.email_claims force row level security;

-- Zero policies and zero grants for every API role, service_role included: the RPCs
-- run as their owner and need none of them (privileged_actions posture).
revoke all on public.email_claims from anon, authenticated, service_role;

-- --- requesting a code ------------------------------------------------------------------

/**
 * Start a claim: decide whether this address may be claimed by this member, and if so
 * mint a code for the edge function to email. Returns the outcome and, only when one
 * was created, the raw code; the row keeps the salted hash.
 *
 * Outcomes: created | already_verified | address_in_use | rate_limited | refused.
 * 'address_in_use' covers BOTH another account's sign-in address and another member's
 * proven address, indistinguishably: one refusal, one message, nothing to enumerate.
 */
create function public.request_email_claim(p_profile uuid, p_email text)
returns table (outcome text, code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized text := lower(trim(p_email));
  minted text;
  salt text;
begin
  -- The sweep (retention): expired claims carry addresses and earn nothing by staying.
  delete from public.email_claims ec where ec.expires_at < now() - interval '1 day';

  if normalized is null or position('@' in normalized) < 2 then
    return query select 'refused'::text, null::text;
    return;
  end if;

  -- Claims come from onboarded, undeleted members only.
  if not exists (
    select 1 from public.profiles p
    where p.id = p_profile and p.deleted_at is null and p.onboarded_at is not null
  ) then
    return query select 'refused'::text, null::text;
    return;
  end if;

  -- Their own sign-in address needs no claim; it already matches.
  if exists (
    select 1 from auth.users u
    where u.id = p_profile and lower(trim(u.email)) = normalized
  ) then
    return query select 'already_verified'::text, null::text;
    return;
  end if;

  if exists (
    select 1 from public.profile_emails pe
    where pe.profile_id = p_profile and lower(trim(pe.email)) = normalized
  ) then
    return query select 'already_verified'::text, null::text;
    return;
  end if;

  -- The refusal that matters (ADR 0017): an address that already belongs to a
  -- different account, as sign-in or as proof, is refused rather than absorbed.
  if exists (
    select 1 from auth.users u
    where lower(trim(u.email)) = normalized and u.id <> p_profile
  ) or exists (
    select 1 from public.profile_emails pe
    where lower(trim(pe.email)) = normalized and pe.profile_id <> p_profile
  ) then
    return query select 'address_in_use'::text, null::text;
    return;
  end if;

  -- Bounded in the database, per caller AND per target address: the claim flow sends
  -- mail to an address the caller names, which is abuse surface (ADR 0017).
  if (
    select count(*) from public.email_claims ec
    where ec.profile_id = p_profile and ec.created_at > now() - interval '1 hour'
  ) >= 5 or (
    select count(*) from public.email_claims ec
    where ec.email = normalized and ec.created_at > now() - interval '1 hour'
  ) >= 5 then
    return query select 'rate_limited'::text, null::text;
    return;
  end if;

  -- A fresh code supersedes any outstanding one for this pair: exactly one claim can
  -- be live, so "which code was that" has one answer. Superseded claims are CONSUMED,
  -- not deleted: the rate bound above counts rows, and a delete here would reset the
  -- count for the one pair a mail-bomber would hammer (the daily sweep is the eraser).
  update public.email_claims ec
  set consumed_at = now()
  where ec.profile_id = p_profile and ec.email = normalized and ec.consumed_at is null;

  salt := encode(extensions.gen_random_bytes(8), 'hex');
  minted := lpad(
    (
      (('x' || lpad(encode(extensions.gen_random_bytes(4), 'hex'), 16, '0'))::bit(64)::bigint)
      % 1000000
    )::text,
    6, '0');

  insert into public.email_claims (profile_id, email, code_salt, code_hash, expires_at)
  values (
    p_profile,
    normalized,
    salt,
    encode(extensions.digest(salt || ':' || minted, 'sha256'), 'hex'),
    now() + interval '15 minutes'
  );

  return query select 'created'::text, minted;
end;
$$;

comment on function public.request_email_claim is
  'Mints a claim code for a second address (ADR 0017). Refuses addresses owned by another account, bounds requests per caller and per target in the database, and never reads course_registrations: nothing before verification reveals whether an address has any.';

-- --- entering the code ------------------------------------------------------------------

/**
 * Finish a claim: check the code, and on success store the proven address and link
 * every unlinked registration carrying it (link_method 'self', ADR 0017: the member
 * did this themselves, so linked_by is them too).
 *
 * Outcomes: verified | invalid_code | expired | too_many_attempts | no_claim |
 * address_in_use (the race where the address became someone's sign-in address between
 * request and verify).
 *
 * A registration whose linking would collide with the double-booking unique (the
 * member already holds a live registration for that course) is SKIPPED, not failed:
 * it stays unlinked for an admin to untangle, and the claims that can land, land.
 */
create function public.verify_email_claim(p_profile uuid, p_email text, p_code text)
returns table (outcome text, linked_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized text := lower(trim(p_email));
  claim public.email_claims%rowtype;
  reg record;
  linked integer := 0;
begin
  select * into claim
  from public.email_claims ec
  where ec.profile_id = p_profile
    and ec.email = normalized
    and ec.consumed_at is null
  order by ec.created_at desc
  limit 1
  for update;

  if not found then
    return query select 'no_claim'::text, 0;
    return;
  end if;

  if claim.expires_at < now() then
    return query select 'expired'::text, 0;
    return;
  end if;

  if claim.attempts >= 5 then
    return query select 'too_many_attempts'::text, 0;
    return;
  end if;

  update public.email_claims ec
  set attempts = ec.attempts + 1
  where ec.id = claim.id;

  if encode(extensions.digest(claim.code_salt || ':' || p_code, 'sha256'), 'hex')
     is distinct from claim.code_hash then
    return query select 'invalid_code'::text, 0;
    return;
  end if;

  -- Single use: the proof is spent the moment it succeeds.
  update public.email_claims ec
  set consumed_at = now()
  where ec.id = claim.id;

  -- The request refused an address owned elsewhere, but fifteen minutes have passed;
  -- re-check before storing, and let the unique index catch the last sliver of race.
  if exists (
    select 1 from auth.users u
    where lower(trim(u.email)) = normalized and u.id <> p_profile
  ) or exists (
    select 1 from public.profile_emails pe
    where lower(trim(pe.email)) = normalized and pe.profile_id <> p_profile
  ) then
    return query select 'address_in_use'::text, 0;
    return;
  end if;

  insert into public.profile_emails (profile_id, email)
  values (p_profile, normalized)
  on conflict do nothing;

  -- The linking pass (ADR 0017: "their website registrations link"). Row by row so a
  -- double-booking collision skips ONE row instead of aborting the claim.
  for reg in
    select cr.id
    from public.course_registrations cr
    where cr.profile_id is null
      and lower(trim(cr.email)) = normalized
  loop
    begin
      update public.course_registrations cr
      set profile_id = p_profile,
          linked_by = p_profile,
          linked_at = now(),
          link_method = 'self'
      where cr.id = reg.id;
      linked := linked + 1;
    exception when unique_violation then
      null; -- already actively registered for that course; an admin untangles this one
    end;
  end loop;

  return query select 'verified'::text, linked;
end;
$$;

comment on function public.verify_email_claim is
  'Verifies a claim code and, on success, stores the proven address and links unlinked registrations by it with link_method self (ADR 0017). Attempt-capped, expiring, single use; the audit trigger on course_registrations records every link it makes.';

-- Service-role only: these run for the edge function, never for a client directly.
revoke all on function public.request_email_claim(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.verify_email_claim(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.request_email_claim(uuid, text) to service_role;
grant execute on function public.verify_email_claim(uuid, text, text) to service_role;
