-- W2.6 · The `...` menu asks "is this mine?", and the row answers.
--
-- The post-actions menu is two different menus (docs/spec/09): the author gets Edit and
-- Delete, everyone else gets Report and Block. Deciding which one to open needs one fact
-- the client did not have.
--
-- For a testimony it could have been derived: `author_id` is on the row, so the app could
-- hold its own user id and compare. FOR AN ANONYMOUS PRAYER IT COULD NOT. `prayer_feed`
-- strips author_id when `is_anonymous`, deliberately and unconditionally (ADR 0013, and
-- 010 asserts "not even to the author themselves"), so the one member who should get Edit
-- and Delete is precisely the one the row refuses to name. Without this column the author
-- of an anonymous request is offered "Report post" and "Block this member" about their own
-- words, and blocking themselves is refused by a CHECK constraint they never should have
-- been able to reach.
--
-- So the view answers instead, the way `reacted_by_me` (20260727180000) and
-- `my_intercession_state` (20260727210000) already do. Both views get it, not just
-- prayers: one rule for the app ("the row says whose it is") beats two, and the second
-- rule would be the one that starts trusting a client-held identity.
--
-- Disclosure: none. It is computed from the base column, so an anonymous request still
-- yields the author nothing but `true` about a row they wrote. It answers only about
-- auth.uid(): there is no argument, no other caller to ask about, and a guest gets false
-- everywhere (auth.uid() is null, hence the coalesce: `null = uuid` is NULL, not false,
-- and a null in a boolean column is a third state the app should never have to read).
--
-- Cost: a column comparison per row. No subquery, no index needed.
--
-- Rollback plan: recreate both views from 20260727180000 / 20260727210000 without the
-- column; the `...` menu loses its own-post branch and offers Report to everyone.

drop view public.testimony_feed;

create view public.testimony_feed
with (security_invoker = false) as
select
  t.id,
  t.branch_id,
  t.body,
  t.language,
  t.category_id,
  c.key as category_key,
  t.image_path,
  t.from_prayer_id,
  t.glory_count,
  t.created_at,
  t.updated_at,
  t.author_id,
  a.display_name as author_name,
  a.avatar_url as author_avatar_url,
  -- New in this migration: whose post this is, from the caller's point of view.
  coalesce(t.author_id = (select auth.uid()), false) as is_mine,
  -- The ribbon is a LINK only while the origin prayer is itself publicly visible;
  -- otherwise the app degrades it to a static label (docs/spec/09).
  (
    select p.id from public.prayers p
    where p.id = t.from_prayer_id
      and p.status = 'approved'
      and p.deleted_at is null
  ) as origin_prayer_id,
  exists (
    select 1 from public.glory_reactions g
    where g.testimony_id = t.id
      and g.profile_id = (select auth.uid())
  ) as reacted_by_me
from public.testimonies t
join public.profiles a on a.id = t.author_id
left join public.testimony_categories c on c.id = t.category_id
where t.status = 'approved'
  and t.deleted_at is null
  -- Two-way block filter, inlined (see the note in the W1.5 migration). A guest has no
  -- auth.uid(), so blocks nobody and is blocked by nobody.
  and not exists (
    select 1 from public.blocked_users b
    where (b.blocker_id = (select auth.uid()) and b.blocked_id = t.author_id)
       or (b.blocked_id = (select auth.uid()) and b.blocker_id = t.author_id)
  );

comment on view public.testimony_feed is
  'The ONLY public read path for testimonies (docs/spec/09). Security-definer by design: this WHERE clause is the public-visibility boundary. `reacted_by_me` and `is_mine` answer only about the calling member, so a card carries its count, its own reaction state and whose post it is on one row and they can never disagree (W2.4, W2.6).';

grant select on public.testimony_feed to anon, authenticated;

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
  -- New in this migration, and read from the BASE column rather than the stripped one
  -- above: anonymity hides the author from every reader, including from the author, and
  -- this is how the author is still handed their own post back.
  coalesce(p.author_id = (select auth.uid()), false) as is_mine,
  (
    select t.id from public.testimonies t
    where t.from_prayer_id = p.id
      and t.status = 'approved'
      and t.deleted_at is null
  ) as answer_testimony_id,
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
  'The ONLY public read path for prayers (docs/spec/09). Strips author identity when is_anonymous: author_id never leaves the database for an anonymous request. `my_intercession_state` and `is_mine` answer only about the calling member, so a card carries the two counts, its own commitment state and whose request it is on one row and they can never disagree (W2.4, W2.6).';

grant select on public.prayer_feed to anon, authenticated;
