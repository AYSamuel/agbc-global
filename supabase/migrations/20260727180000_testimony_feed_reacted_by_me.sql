-- W2.4 · One row per card: the feed says whether YOU reacted.
--
-- Until now a testimony card assembled itself from two independent client queries:
-- `testimony_feed` for the count, and a separate read of `glory_reactions` for "have I
-- already said Glory to this". They refetch separately and land at different moments, so
-- for a frame the card could believe the member had reacted while still holding the old
-- count (showing 1, then 0, then 1), or the reverse (overshooting to 2). Reported on
-- device 2026-07-27; the arithmetic was right and its two inputs were simply never
-- guaranteed to agree.
--
-- The fix is to stop deriving one card's state from two sources. `reacted_by_me` travels
-- on the same row as the count it belongs to, so the two cannot disagree, and the client
-- query that fetched reactions separately goes away entirely.
--
-- Disclosure: none. The view is already SECURITY DEFINER (`security_invoker = false`)
-- because its WHERE clause IS the public-visibility boundary, and this column answers
-- only about `auth.uid()`. A guest has no uid, so it is false for everyone browsing;
-- a member learns exactly one thing they already knew, which is what they themselves did.
-- Nobody can ask the view about anybody else.
--
-- Cost: one correlated EXISTS per row, served by the unique index that already backs
-- `glory_reactions (testimony_id, profile_id)`.
--
-- Rollback plan: recreate the view from 20260727120000 without the column, and restore
-- the client's separate reactions query.

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
  -- The ribbon is a LINK only while the origin prayer is itself publicly visible;
  -- otherwise the app degrades it to a static label (docs/spec/09).
  (
    select p.id from public.prayers p
    where p.id = t.from_prayer_id
      and p.status = 'approved'
      and p.deleted_at is null
  ) as origin_prayer_id,
  -- New in this migration. Always false for a guest: auth.uid() is null, so the
  -- comparison never matches, and the gate is what turns a tap into an account.
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
  'The ONLY public read path for testimonies (docs/spec/09). Security-definer by design: this WHERE clause is the public-visibility boundary. `reacted_by_me` answers only about the calling member, so a card carries its count and its own reaction state on one row and the two can never disagree (W2.4).';

grant select on public.testimony_feed to anon, authenticated;
