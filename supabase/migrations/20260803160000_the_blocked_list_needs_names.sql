-- W2.6 · Settings > Blocked members can say who is blocked.
--
-- `blocked_users` has always been readable by its blocker ("members read their own block
-- list", W1.5) and that is the whole row: two uuids. The name is on `profiles`, whose
-- SELECT policies are own-row plus leaders-in-their-branch, so a member can read the
-- record of their own block and not one word of who it is about. The BLOCKED-MEMBERS
-- frame draws a name and an Unblock, and without this there is nothing to draw: an
-- unblock list of uuids is a list nobody can act on.
--
-- Same instrument as the feed views (ADR 0013): a SECURITY DEFINER view whose WHERE
-- clause IS the boundary. `blocker_id = auth.uid()` is not a filter the client asks for,
-- it is the only rows the view can produce, so no parameter and no forgotten `.eq()` can
-- widen it. A guest has no uid and gets the empty set.
--
-- Disclosure: exactly the names of the people you blocked, which you read off their post
-- on the way to blocking them. It answers nothing in the other direction: "who blocked
-- me" stays undisclosed, because the view is keyed on blocker_id and there is no way to
-- ask it about blocked_id (asserted in 027).
--
-- Three columns and no more. There is deliberately no `created_at` here even though the
-- table has one: the frame's note says no "blocked on 3 August", because a date invites
-- second-guessing a decision the member already made, and a column that exists is a
-- column somebody renders.
--
-- Rollback plan: drop the view; the Blocked members screen loses its names and nothing
-- else reads it.

create view public.blocked_members
with (security_invoker = false) as
select
  b.blocked_id,
  p.display_name
from public.blocked_users b
join public.profiles p on p.id = b.blocked_id
where b.blocker_id = (select auth.uid())
  -- A deleted account is gone from the app entirely, so its name should not keep
  -- surfacing on a list of people to unblock. The block row itself stays (harmlessly:
  -- there is no longer anyone to hide) until the FK cascade takes it.
  and p.deleted_at is null;

comment on view public.blocked_members is
  'The blocker''s own block list with names (docs/spec/16 "Blocked members"). Security-definer by design: the blocker_id = auth.uid() predicate IS the boundary, and the view cannot be asked about anybody else''s blocks or about who blocked the caller.';

-- Members only. A guest has no block list, and anon holding SELECT on a definer view is
-- exactly the default privilege the family migration exists to revoke.
revoke all on public.blocked_members from anon, authenticated;
grant select on public.blocked_members to authenticated;
grant select on public.blocked_members to service_role;
