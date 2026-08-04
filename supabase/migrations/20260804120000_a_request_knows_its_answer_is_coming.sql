-- W2.5 · The request can see the testimony that is not public yet.
--
-- The loop's last two screens both ask the same question, and no read path answered it.
--
-- `prayer_has_live_testimony()` (W1.5) counts ANY linked testimony that is not deleted,
-- whatever its status, and that is what refuses "Mark as not answered". `answer_testimony_id`
-- on this view reports only APPROVED ones, because it drives the public reverse link. So
-- between an author writing their testimony and a leader approving it, the two disagree by
-- design, and the app could only see the second one. Two consequences, both on the author's
-- own screen:
--
--   1. PRAYER-DETAIL keeps offering "Write a testimony" for a request that already has one.
--      `testimonies.from_prayer_id` is UNIQUE, so the second attempt is a 23505 the author
--      did nothing to deserve.
--   2. The undo confirm cannot say why it is refused. docs/spec/09 is explicit: "once one
--      exists, undo requires deleting that testimony first, and the confirm sheet says so."
--      A sheet that cannot see the testimony cannot say so, and the author gets the
--      database's refusal as a generic error instead.
--
-- WHY IT MATCHES THE GUARD'S PREDICATE EXACTLY. The obvious tightening is to report only a
-- testimony the CALLER wrote (`and t.author_id = auth.uid()`). That would be wrong here: an
-- admin may link a testimony to somebody's request (`assert_prayer_link_allowed` exempts
-- them), the guard counts that one too, and a screen that did not would offer an undo the
-- database then refuses. This column exists to predict `prayer_has_live_testimony`, so it
-- asks that function's question and no other. What it discloses in that case is one enum
-- value about a testimony written from the caller's own answered request: not the words, not
-- `rejection_reason`, and certainly not `moderation_note`.
--
-- DISCLOSURE, otherwise none. Like `is_mine` and `my_intercession_state`, it answers only
-- about `auth.uid()`: there is no argument and no other caller to ask about. A stranger and a
-- guest both get NULL (`auth.uid()` is null, and `null = uuid` is NULL, which the CASE falls
-- through). It reads the BASE `p.author_id` rather than the stripped alias above it, so the
-- author of an ANONYMOUS request is still handed their own answer back: the same reason
-- `is_mine` does (20260803170000), and the reason the loop works at all for a member who
-- asked for prayer without their name on it.
--
-- Cost: one scalar subquery per row, on `testimonies.from_prayer_id`, which is UNIQUE and so
-- already indexed. `answer_testimony_id` beside it does the same lookup with a status filter.
--
-- Rollback plan: recreate the view from 20260803170000 without the column; PRAYER-DETAIL
-- loses the awaiting-review state and the undo sheet's explanation.

drop view public.prayer_feed;

create view public.prayer_feed
with (security_invoker = false) as
select
  p.id,
  p.branch_id,
  p.body,
  p.language,
  p.is_anonymous,
  p.answered_at,
  p.praying_count,
  p.prayed_count,
  p.created_at,
  p.updated_at,
  -- Anonymity is enforced HERE, server-side. The UI showing "A member" is
  -- presentation; this is the mechanism (docs/spec/02, 09, 20).
  case when p.is_anonymous then null else p.author_id end as author_id,
  case when p.is_anonymous then null else a.display_name end as author_name,
  case when p.is_anonymous then null else a.avatar_url end as author_avatar_url,
  -- Read from the BASE column rather than the stripped one above: anonymity hides the
  -- author from every reader, including from the author, and this is how the author is
  -- still handed their own post back (20260803170000).
  coalesce(p.author_id = (select auth.uid()), false) as is_mine,
  (
    select t.id from public.testimonies t
    where t.from_prayer_id = p.id
      and t.status = 'approved'
      and t.deleted_at is null
  ) as answer_testimony_id,
  -- New in this migration: what the AUTHOR needs to know about a linked testimony that is
  -- not public yet. Same predicate as public.prayer_has_live_testimony(), so the screen and
  -- the guard can never disagree about whether the undo is available.
  case
    when p.author_id = (select auth.uid()) then (
      select t.status from public.testimonies t
      where t.from_prayer_id = p.id
        and t.deleted_at is null
    )
  end as my_answer_testimony_status,
  (
    select i.state from public.prayer_intercessions i
    where i.prayer_id = p.id
      and i.profile_id = (select auth.uid())
  ) as my_intercession_state
from public.prayers p
join public.profiles a on a.id = p.author_id
where p.status = 'approved'
  and p.deleted_at is null
  and not exists (
    select 1 from public.blocked_users b
    where (b.blocker_id = (select auth.uid()) and b.blocked_id = p.author_id)
       or (b.blocked_id = (select auth.uid()) and b.blocker_id = p.author_id)
  );

comment on view public.prayer_feed is
  'The ONLY public read path for prayers (docs/spec/09). Strips author identity when is_anonymous: author_id never leaves the database for an anonymous request. `my_intercession_state`, `is_mine` and `my_answer_testimony_status` answer only about the calling member, so a card carries the two counts, its own commitment state, whose request it is and whether its answer is still in the queue on one row, and they can never disagree (W2.4, W2.6, W2.5).';

grant select on public.prayer_feed to anon, authenticated;
