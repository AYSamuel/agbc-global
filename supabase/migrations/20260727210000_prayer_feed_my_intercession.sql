-- W2.4 · The prayer card carries its own commitment state, before anything reads it.
--
-- Companion to 20260727180000, which put `reacted_by_me` on `testimony_feed` after a
-- card assembled from two independent client queries flickered on device: the two
-- refetched separately, so for a frame the card believed one and not the other. The
-- prayer two-step (W2.4 slice 3) is the same shape one step more complicated, because
-- its state has three values rather than two, and `PrayerCard` already renders all
-- three from a prop nothing supplies yet.
--
-- Landing the column now means that slice starts from the fixed architecture instead of
-- rediscovering the bug. Nothing reads it yet; that is the point.
--
-- Disclosure: none. The view is already SECURITY DEFINER (`security_invoker = false`)
-- because its WHERE clause and its anonymity stripping ARE the public boundary, and this
-- column answers only about `auth.uid()`. A guest has no uid and always gets null. It
-- reports nothing about who else is praying: the counts already do that, in aggregate,
-- which is exactly how docs/spec/09 wants intercession surfaced.
--
-- Cost: one correlated lookup per row, served by the unique index already backing
-- `prayer_intercessions (prayer_id, profile_id)`.
--
-- Rollback plan: recreate the view from 20260720220000 without the column.

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
  (
    select t.id from public.testimonies t
    where t.from_prayer_id = p.id
      and t.status = 'approved'
      and t.deleted_at is null
  ) as answer_testimony_id,
  -- New in this migration. NULL means "not committed", which is the guest answer
  -- and the answer for any member who has not tapped "I will pray" yet; the two
  -- are indistinguishable on purpose, because neither has a commitment to show.
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
  'The ONLY public read path for prayers (docs/spec/09). Strips author identity when is_anonymous: author_id never leaves the database for an anonymous request. `my_intercession_state` answers only about the calling member, so a card carries the two counts and its own commitment state on one row and they can never disagree (W2.4).';

grant select on public.prayer_feed to anon, authenticated;
