-- The handoff (W2.9 slice 2; ADR 0017 decision 7): tapping Register in the app mints a
-- short-lived, single-use token bound to (profile, course), and the website resolves it
-- server-side, so an app-started registration is born linked and needs no matching
-- afterwards.
--
-- The token is OPAQUE and carries no personal data, because a query string ends up in
-- browser history and server logs; profile_id is never in a URL and never trusted from
-- a client. Stored hashed: the raw token exists only in the member's own handoff URL.
--
-- Two callers, both with the service key:
-- * the course-handoff edge function mints (the member's identity comes from their JWT,
--   resolved by the function, never from the request body);
-- * the WEBSITE redeems, in two steps that match its own flow: a PEEK at page render to
--   prefill the form (consumes nothing), then a CONSUME when it creates the Stripe
--   Checkout session, from which point profile_id rides in the session metadata and the
--   token is done. A shared or replayed link can therefore prefill a form for its
--   30 minutes but can produce at most ONE linked checkout.
--
-- Until the website's flag flips (ADR 0017 decision 8 sequencing: Track P P1, the prod
-- ALTER, then the deploy), tokens go unread and expire unused; the app hands off
-- without one and the email match does the linking. Nothing here assumes the handoff
-- is live.
--
-- Retention: rows expire in 30 minutes; every mint sweeps the day-old dead. Cascades
-- with both profile and course deletion.
--
-- Rollback (roll forward): a compensating migration drops the two RPCs and the table.

create table public.course_handoff_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.course_handoff_tokens is
  'Single-use handoff tokens binding (profile, course) for the website registration page (ADR 0017 decision 7). Hashed at rest, 30-minute expiry, consumed at Checkout creation. No client role touches this table; the two RPCs are the only doors.';

create index course_handoff_tokens_profile_idx
  on public.course_handoff_tokens (profile_id);
create index course_handoff_tokens_course_idx
  on public.course_handoff_tokens (course_id);

alter table public.course_handoff_tokens enable row level security;
alter table public.course_handoff_tokens force row level security;

revoke all on public.course_handoff_tokens from anon, authenticated, service_role;

-- --- minting ---------------------------------------------------------------------------

/**
 * Mint a token for (member, course). Returns the raw token exactly once; the row keeps
 * the hash. 256 bits of entropy, so unlike the claim codes no salt is needed.
 *
 * Outcomes: minted | unknown_course | not_open | already_registered | refused.
 *
 * 'already_registered' is the refusal that guards the double-booking unique at the
 * layer where it is still a kindness: the app shows "you're registered" instead of
 * walking a member into paying twice, and the webhook's insert never has to face the
 * constraint for a row Stripe already took money for (ADR 0017 decision 9 names the
 * constraint as the last wall, not the first).
 */
create function public.mint_course_handoff(p_profile uuid, p_course_slug text)
returns table (outcome text, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  course public.courses%rowtype;
  raw text;
  valid_until timestamptz;
begin
  -- Sweep the dead (retention): expired tokens have nothing left to say.
  delete from public.course_handoff_tokens t where t.expires_at < now() - interval '1 day';

  select * into course from public.courses c where c.slug = p_course_slug;
  if not found then
    return query select 'unknown_course'::text, null::text, null::timestamptz;
    return;
  end if;

  if course.upcoming then
    return query select 'not_open'::text, null::text, null::timestamptz;
    return;
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = p_profile and p.deleted_at is null and p.onboarded_at is not null
  ) then
    return query select 'refused'::text, null::text, null::timestamptz;
    return;
  end if;

  if exists (
    select 1 from public.course_registrations cr
    where cr.course_id = course.id
      and cr.profile_id = p_profile
      and cr.status <> 'cancelled'
  ) then
    return query select 'already_registered'::text, null::text, null::timestamptz;
    return;
  end if;

  -- One live token per (member, course): a re-tap supersedes rather than accumulates.
  delete from public.course_handoff_tokens t
  where t.profile_id = p_profile and t.course_id = course.id and t.used_at is null;

  raw := encode(extensions.gen_random_bytes(32), 'hex');
  valid_until := now() + interval '30 minutes';

  insert into public.course_handoff_tokens (profile_id, course_id, token_hash, expires_at)
  values (p_profile, course.id, encode(extensions.digest(raw, 'sha256'), 'hex'), valid_until);

  return query select 'minted'::text, raw, valid_until;
end;
$$;

comment on function public.mint_course_handoff is
  'Mints the single-use handoff token for (caller, course) (ADR 0017 decision 7). Refuses upcoming courses and members already actively registered. The raw token is returned once and stored only as a hash.';

-- --- redeeming -------------------------------------------------------------------------

/**
 * Resolve a token for the website. p_consume=false is the page-render PEEK (prefill);
 * p_consume=true is the Checkout-creation CONSUME. Bound to one course: a token minted
 * for Reset says nothing on the Masterclass page (ADR 0017: "bound to one course so it
 * cannot be replayed against another").
 *
 * Outcomes: ok | invalid | used | expired | wrong_course. The identity columns are
 * null on everything but 'ok'.
 */
create function public.redeem_course_handoff(
  p_token text,
  p_course_slug text,
  p_consume boolean default true
)
returns table (outcome text, profile_id uuid, full_name text, email text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_found record;
begin
  select t.id, t.profile_id, t.course_id, t.expires_at, t.used_at,
         c.slug as course_slug,
         p.display_name,
         u.email as login_email
  into row_found
  from public.course_handoff_tokens t
  join public.courses c on c.id = t.course_id
  join public.profiles p on p.id = t.profile_id
  join auth.users u on u.id = t.profile_id
  where t.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  for update of t;

  if not found then
    return query select 'invalid'::text, null::uuid, null::text, null::text;
    return;
  end if;

  if row_found.used_at is not null then
    return query select 'used'::text, null::uuid, null::text, null::text;
    return;
  end if;

  if row_found.expires_at < now() then
    return query select 'expired'::text, null::uuid, null::text, null::text;
    return;
  end if;

  if row_found.course_slug is distinct from p_course_slug then
    return query select 'wrong_course'::text, null::uuid, null::text, null::text;
    return;
  end if;

  if p_consume then
    update public.course_handoff_tokens t
    set used_at = now()
    where t.id = row_found.id;
  end if;

  -- auth.users.email is varchar; the cast keeps RETURN QUERY's structure honest.
  return query select 'ok'::text, row_found.profile_id, row_found.display_name::text,
                      row_found.login_email::text;
end;
$$;

comment on function public.redeem_course_handoff is
  'Resolves a handoff token for the website (ADR 0017 decision 8): peek (p_consume=false) prefills the form, consume (p_consume=true) happens at Checkout creation so exactly one linked checkout can come from one token. The token is the only input; a caller-supplied profile_id is never trusted.';

-- Service-role only, both directions.
revoke all on function public.mint_course_handoff(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.redeem_course_handoff(text, text, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.mint_course_handoff(uuid, text) to service_role;
grant execute on function public.redeem_course_handoff(text, text, boolean) to service_role;
