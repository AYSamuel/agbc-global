-- The branch-request queue as one shape (ADR 0015, W2.7 people slice, docs/spec/17 §People).
--
-- WHY THIS EXISTS, when `022` already built the table and its policies: a leader being asked
-- to accept somebody cannot READ that somebody. The requester is still in the branch they are
-- leaving, and `profiles` is branch-scoped ("leaders read profiles in their branch"), so a
-- Berlin leader selecting their queue joins to zero rows and the screen offers a decision
-- about a person it cannot name.
--
-- MEASURED, not inferred (2026-07-31, live local stack): a Glasgow leader selecting an Emmen
-- member's profile gets 0 rows. `023`'s own comments already note that "profiles is
-- branch-scoped"; what was missing was the read path for the one name a decider needs.
--
-- WHY A DEFINER VIEW AND NOT A WIDER POLICY ON `profiles`. The alternative was a SELECT policy
-- letting a leader read anyone holding a pending request into their branch. That widens a
-- table every surface in this app reads, to serve one screen, and it would need a second
-- clause for the source branch's history. It is also the shape ADR 0015 warns about in
-- capitals: a column on a row the subject can read is disclosed to the subject, and the answer
-- is a narrower object, never a cleverer policy. This view is that narrower object: it names
-- the columns it discloses, and its WHERE clause is the whole boundary.
--
-- WHAT IT DISCLOSES, exactly, and to whom:
--
--   * the DESTINATION's moderator (its leader, or any admin) sees every request INTO that
--     branch, at every status, with the requester's display name;
--   * the SOURCE's moderator sees requests OUT of that branch ONLY once approved. Not
--     pending ones: "tried to leave you and did not" is a different disclosure and is worst
--     in the safeguarding cases (decision 14, pinned on the base table by `022` test 21, and
--     pinned here again because a view that bypassed it would be a way around that policy);
--   * an admin is a moderator of every branch, so both clauses answer true for them. There is
--     deliberately no third `caller_is_admin_live()` clause: it would add nothing, and a
--     redundant term in a security predicate is one more thing to reason about.
--
-- WHAT IT DELIBERATELY DOES NOT CARRY: no email, no note, no decider. The note and the actor
-- live in `privileged_actions` (admin-read-only) for the reasons in `022`'s header, and
-- nothing here may become the route around that. `024` asserts the column list exactly, so a
-- column added later fails a test rather than quietly disclosing itself.
--
-- WHAT IT IS NOT: the member's read path. A member reads their own request from the base
-- table under "members read their own requests"; `can_moderate_branch()` answers false for
-- them, so this view shows them nothing at all. Two readers, two paths, and the staff one
-- carries a name the member's does not need.
--
-- IT DOES NOT FILTER CLOSED ACCOUNTS, matching the base table. A soft-deleted member with a
-- pending request still appears. Filtering here would put a second definition of "actionable"
-- in a second place, and the decision rules belong to `decide_branch_request`. Noted rather
-- than silently handled, because it is the kind of row that will look odd before it looks
-- wrong.
--
-- COST, named as `database.md` asks. `can_moderate_branch()` is STABLE and takes each row's
-- branch, so the planner cannot hoist it: it runs once per candidate row, each time a primary
-- key lookup on `profiles`. Measured plan (2026-07-31): the pending predicate is served by
-- `branch_change_requests_one_open_idx`, the requester by `profiles_pkey`, and `branches` is
-- four rows. That is right for a queue of a handful of rows per branch, which is what a year
-- of this ministry's moves looks like. Revisit if a caller ever selects the whole table
-- unfiltered, which is the shape that would turn one lookup per row into a real cost.
--
-- Rollback (roll forward): a compensating migration drops the view. Nothing depends on it in
-- the database; the dashboard surface reading it is the same change that adds it.

create view public.branch_request_queue
with (security_invoker = false) as
select
  r.id,
  r.status,
  r.created_at,
  r.decided_at,
  -- The one new disclosure, and the reason the view exists.
  p.display_name,
  r.from_branch_id,
  source.name as from_branch_name,
  r.to_branch_id,
  destination.name as to_branch_name
from public.branch_change_requests r
join public.profiles p on p.id = r.profile_id
join public.branches source on source.id = r.from_branch_id
join public.branches destination on destination.id = r.to_branch_id
where
  -- The destination decides, so the destination sees the whole story of its own queue.
  public.can_moderate_branch(r.to_branch_id)
  -- The source is TOLD, after the fact. Approved only.
  or (r.status = 'approved' and public.can_moderate_branch(r.from_branch_id));

comment on view public.branch_request_queue is
  'Staff read path for branch-change requests (ADR 0015). Security-definer by design: this WHERE clause is the whole boundary, and it carries the requester''s display name, which `profiles` cannot disclose to the destination branch because the requester is not in it yet. The destination''s moderator sees its queue at every status; the source''s sees approved moves out only; a member sees nothing here and reads their own request from the base table. No email, no note, no decider.';

-- Supabase's ALTER DEFAULT PRIVILEGES grants ALL on new objects in `public` to every API
-- role, views included, so "we granted nothing" means "everything was granted for us" (issue
-- #96, `015` test 4, and the function-level twin found in `020`). Start from zero and hand
-- back exactly one privilege to exactly one role.
--
-- `anon` gets nothing: this is staff data and no guest surface reads it. `service_role` gets
-- nothing either, because no job reads it yet and a leaked key should not be able to
-- enumerate who is moving between branches.
revoke all on public.branch_request_queue from anon, authenticated, service_role;
grant select on public.branch_request_queue to authenticated;
