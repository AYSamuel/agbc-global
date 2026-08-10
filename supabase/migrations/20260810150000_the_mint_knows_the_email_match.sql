-- The mint reads the email match (W2.9 slice 3, found on device 2026-08-10).
--
-- mint_course_handoff refused 'already_registered' only for rows LINKED to the
-- caller (profile_id), while the app's own visibility rule has always been wider:
-- a member also sees a registration whose email is their sign-in address or one
-- they proved (ADR 0017 decision 2). The gap was walked in the flesh: a guest
-- tapped Register on a course their email-matched website registration already
-- covers, signed in through the gate, and the replay minted and opened checkout
-- for a place they hold. That is the exact double payment the refusal exists to
-- prevent (ADR 0017 decision 9 names the unique constraint as the last wall,
-- not the first; the constraint cannot see email identity at all, because an
-- unlinked row carries profile_id null).
--
-- The check now mirrors the app's matcher on both axes: the course side matches
-- course_id OR the website slug (prod rows that predate the catalog may carry
-- course_id null after `19`'s ALTER), and the identity side matches the linked
-- profile OR the caller's address set (sign-in address from auth.users, never a
-- JWT claim, plus proven profile_emails), compared lower(trim(...)) on both
-- sides like email_belongs_to_caller.
--
-- Rollback (roll forward): a compensating migration restores the previous body.

create or replace function public.mint_course_handoff(p_profile uuid, p_course_slug text)
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

  -- A live registration the caller can SEE is a place they hold, linked or not:
  -- the refusal must cover everything the app's registered state covers, or the
  -- one screen that missed the fact walks its member into paying twice.
  if exists (
    select 1 from public.course_registrations cr
    where (cr.course_id = course.id or cr.course = course.slug)
      and cr.status <> 'cancelled'
      and (
        cr.profile_id = p_profile
        or lower(trim(cr.email)) in (
          select lower(trim(u.email))
          from auth.users u
          where u.id = p_profile and u.email is not null
          union
          select lower(trim(pe.email))
          from public.profile_emails pe
          where pe.profile_id = p_profile
        )
      )
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
  'Mints the single-use handoff token for (caller, course) (ADR 0017 decision 7). Refuses upcoming courses and members already actively registered, where "registered" matches everything the member can see: linked rows AND rows carrying their sign-in or proven address (20260810150000). The raw token is returned once and stored only as a hash.';
