-- W2.5 · A deleted testimony gives the prayer link back (found on device, 2026-08-04).
--
-- WHAT WENT WRONG. `testimonies.from_prayer_id` was UNIQUE across the whole table, and every
-- other rule about that link is scoped to LIVE rows:
--
--   * `prayer_has_live_testimony()` counts `deleted_at is null`, so deleting the testimony
--     re-opens "Mark as not answered".
--   * `prayer_feed.my_answer_testimony_status` (20260804120000) matches that predicate, so
--     PRAYER-DETAIL offers "Write a testimony" again.
--   * `answer_testimony_id` and `origin_prayer_id` both filter it out of every read path.
--
-- So after an author deleted their testimony, the app correctly said the prayer had none and
-- correctly offered to write one, and the INSERT was then refused by a constraint pointing
-- at a row that no longer exists anywhere in the product. Walked on a real device: mark
-- answered, write the testimony, delete it, accept the offer again, and Post fails with
-- 23505 and no copy that could explain it. Every unit test passed, because they mock the
-- database, and the pgTAP suite had never deleted a linked testimony and then written
-- another one.
--
-- WHY PARTIAL AND NOT A SECOND COLUMN ON THE VIEW. The constraint exists to stop the link
-- being STOLEN or double-claimed (`02`), and `assert_prayer_link_allowed` already refuses
-- anyone but the prayer's author (or an admin). Nothing about that purpose needs a
-- soft-deleted row to keep holding the link: that row is invisible in every feed, in
-- MY-POSTS, and to the guard that decides whether the prayer stays answered. docs/spec/09
-- is explicit that the testimony prompt is optional and can be taken up later, and "later"
-- must survive a change of mind. Teaching the screen about deleted rows instead would mean
-- the app knows about content the rest of the system has agreed to forget.
--
-- The uniqueness that matters is preserved exactly: at most one LIVE testimony per prayer,
-- which is the invariant every read path already assumes when it selects a single row.
--
-- Lock discipline: `create unique index concurrently` cannot run inside a transaction, and
-- this migration must be one statement per step for the drop to be safe, so it takes the
-- brief ACCESS EXCLUSIVE that dropping a constraint needs. On this table's size (a few
-- thousand rows at launch) that is milliseconds; the lock_timeout below fails fast rather
-- than queueing behind a long read if it ever is not.
--
-- Rollback plan (roll forward): a compensating migration drops the partial index and
-- re-adds the plain constraint. It would fail if any prayer had accumulated two linked
-- testimonies by then, one of them deleted, which is exactly the state this exists to allow.

begin;

set local lock_timeout = '3s';

alter table public.testimonies
  drop constraint testimonies_from_prayer_id_key;

-- Not CONCURRENTLY: this runs inside the same transaction as the drop, so there is never a
-- window where the invariant is unenforced.
create unique index testimonies_one_live_answer_per_prayer
  on public.testimonies (from_prayer_id)
  where deleted_at is null;

comment on index public.testimonies_one_live_answer_per_prayer is
  'At most one LIVE testimony per prayer (docs/spec/02 §the link cannot be stolen). Partial on deleted_at so an author who deletes their testimony can write another one for the same answered prayer, which every other rule about the link already assumed (20260804160000).';

commit;
