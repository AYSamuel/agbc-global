-- An avatar path is a path (docs/spec/02 §Storage, `16` §DELETE).
-- ---------------------------------------------------------------------------
-- `20260902120000` created the bucket and left a note that `profiles.avatar_url` should be
-- renamed to a path column one day, because its name predates the W2.3 rule that a row holds
-- a PATH rather than a URL. That note was describing a real hazard and proposing the weaker
-- half of the fix.
--
-- THE HAZARD IS NOT THE NAME, IT IS WHAT THE COLUMN CAN HOLD. `erase_profile` records this
-- value for `erasure-sweep`, and the sweep skips anything URL-shaped rather than guessing a
-- bucket out of a hostname. So a URL in this column means an erasure that reports success
-- while the member's face stays in storage for ever: a quiet, permanent GDPR miss, arrived at
-- by a future colleague doing the obvious thing with a column called `avatar_url`.
--
-- Renaming it would document the contract. This ENFORCES it, in two lines, with no view to
-- recreate, no generated type to regenerate and no app query to touch. The rename is still
-- worth doing the day somebody builds the uploader and is already editing all of those; it is
-- cosmetics once the value cannot be wrong.
--
-- The sweep's own URL skip stays where it is, as the belt to this braces: it is what protects
-- against a value written by a trusted path (a seed, the service role) that never meets this
-- guard at all, since the guard returns early when there is no member acting.

create or replace function public.assert_avatar_path_owned(target text)
returns void
language plpgsql
stable
as $$
declare
  actor uuid := (select auth.uid());
begin
  -- Null target = no picture. Null actor = service role, seeds, jobs: already trusted.
  if target is null or actor is null then
    return;
  end if;
  -- A URL is refused rather than tolerated. Previously this returned early on one, which
  -- let the value through to a sweep that would skip it, which is the silent failure.
  if pg_catalog.strpos(target, '://') > 0 then
    raise exception 'an avatar is stored as a path inside the avatars bucket, not as a URL'
      using errcode = 'check_violation';
  end if;
  if pg_catalog.split_part(target, '/', 1) <> actor::text then
    raise exception 'an avatar must live in its owner''s own folder'
      using errcode = 'check_violation';
  end if;
end;
$$;

comment on function public.assert_avatar_path_owned(text) is
  'Refuses an avatar value that is a URL, or a path outside the caller''s own storage folder. The first stops an erasure reporting success while the face stays in storage (the sweep skips URL-shaped values); the second stops a member pointing at a stranger''s object and having their own erasure delete it. See docs/spec/16, W4.5.';
