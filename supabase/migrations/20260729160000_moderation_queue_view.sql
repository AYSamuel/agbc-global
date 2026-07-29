-- The moderation queue as one shape (docs/spec/17 §1, W2.7 slice 2).
--
-- Testimonies and prayers are separate tables with separate policies, but a moderator
-- works ONE list ordered by age. Merging them in application code would be fine for the
-- dashboard alone; it is not fine for the product, because the same question gets asked
-- from places that cannot call a Next route:
--
--   * the 48h escalation job (slice 5, a scheduled function),
--   * moderation notifications to leaders,
--   * Insights in Phase C.
--
-- Written per-caller, that becomes several definitions of "a pending item" that drift
-- apart. One view is one definition.
--
-- SECURITY INVOKER, deliberately. This view adds NO authority: the caller's own
-- policies on `testimonies` and `prayers` still decide which rows come back, which
-- means public.can_moderate_branch() keeps doing the scoping (leaders see their own
-- branch, admins see every branch, demoted or deleted accounts see nothing, all read
-- from the profiles TABLE rather than a stale JWT claim). Contrast the Family feed
-- views (ADR 0013), which are security DEFINER because they serve the public and had to
-- hide a column RLS cannot hide. Nothing here is public, so that machinery is not
-- needed and would only move the rule somewhere new.
create view public.moderation_queue
with (security_invoker = true)
as
select
  t.id,
  'testimony'::text as kind,
  t.branch_id,
  t.body,
  t.language,
  t.status,
  t.created_at,
  -- Carried so a decision can be compare-and-set against the version reviewed
  -- (docs/spec/02 invariant; the write path lands in slice 3).
  t.updated_at,
  t.image_path,
  t.consent_version,
  t.from_prayer_id is not null as is_answered_prayer,
  -- Testimonies are never anonymous: the author's name is part of the testimony.
  false as is_anonymous,
  t.author_id
from public.testimonies t
where t.status = 'pending'
  and t.deleted_at is null

union all

select
  p.id,
  'prayer'::text as kind,
  p.branch_id,
  p.body,
  p.language,
  p.status,
  p.created_at,
  p.updated_at,
  null::text as image_path,
  p.consent_version,
  false as is_answered_prayer,
  p.is_anonymous,
  -- The anonymity promise reaches the dashboard too (decided 2026-07-29): a moderator
  -- reviewing an anonymous request sees the words, not the person. Nothing about the
  -- decision needs the name.
  --
  -- HONEST LIMIT: this hides the author from the QUEUE, it does not put it out of
  -- reach. `moderators read requests in their branch` grants SELECT on the whole row,
  -- so a leader querying `prayers` directly still sees author_id. Making it truly
  -- unreachable means revoking column access and moving moderation writes behind a
  -- definer function, which is a bigger change than slice 2 and would need its own
  -- decision. Recorded rather than assumed.
  case when p.is_anonymous then null else p.author_id end as author_id
from public.prayers p
where p.status = 'pending'
  and p.deleted_at is null;

-- This view is a SHAPE, not an audience. Because it is security_invoker it inherits
-- every SELECT policy on the base tables, including "authors read their own", so a plain
-- member querying it sees their OWN pending posts (which is what MY-POSTS needs). Nobody
-- may therefore reason "this row came from moderation_queue, so the caller moderates
-- it". The dashboard is safe because authorize() refuses a non-moderator at the door,
-- not because this view filters them out. Asserted in 016.
comment on view public.moderation_queue is
  'Pending testimonies + prayers as one age-ordered shape (docs/spec/17 §1). security_invoker: the base-table policies do the scoping, so authors also see their own rows here. Anonymous prayers expose no author_id.';

-- Both base tables already carry (branch_id, status, created_at desc) indexes from
-- their own migrations, so each branch of the union is index-served; the union sorts a
-- handful of rows per branch.
grant select on public.moderation_queue to authenticated;
