-- W3.2 cut (decided 2026-08-15 with Ayo; ADR 0021): the app does not carry LIVE.
--
-- The decision is a product one and it is simple: members are not to join a live stream
-- from inside the app. That removes the whole real-time layer, not merely the screen. No
-- live flag on a sermon, no staleness bound protecting that flag, no detection job setting
-- it, no watching-now count, no attendance credited for watching one.
--
-- WHAT THIS DOES NOT TOUCH, deliberately, because the names are close enough to invite a
-- careless sweep:
--
--   * `sermons.kind = 'live_replay'`. That is the channel TAB a row was synced from, not a
--     live state, and it feeds Watch's "Recent live streams" rail. Those rows are recorded
--     messages and are a large part of the catalogue; removing them would delete content,
--     which is the opposite of this change.
--   * `public.caller_profile_is_live()`. Unrelated: it asks whether a PROFILE is still
--     active (not deleted) and it gates devices, notification prefs and blocks. A grep for
--     "is_live" hits it, and dropping it would break sign-in surfaces.
--
-- Rollback plan: re-add both columns with their defaults (no data to restore, since
-- nothing but the detection job ever wrote them), and re-emit the sync's live handling.

begin;

-- Same lock discipline as every ALTER on this table: `sermons` is read by every Watch
-- surface, so three seconds then failing beats queueing every query behind a waiting
-- ALTER (~/.claude/standards/database.md §Migrations).
set local lock_timeout = '3s';

-- No index or constraint references either column (checked: `sermons` has only the
-- youtube_id partial unique, branch_id, the kind/published_at read path, and W3.1's two
-- partial media-path indexes), so these drop cleanly.
alter table public.sermons
  drop column is_live,
  drop column live_checked_at;

comment on table public.sermons is
  'Cache/index of YouTube + self-hosted audio; nightly sync populates from the channel, manual rows for audio-only (docs/spec/02, 08). Vanished videos go unavailable, never deleted. Carries no live state: the app does not join live streams (ADR 0021).';

-- ---------------------------------------------------------------------------
-- `attendance_source.live_watch` is RETIRED IN PLACE, not dropped
-- ---------------------------------------------------------------------------
-- Postgres has no `ALTER TYPE ... DROP VALUE`. Removing it means creating a new enum,
-- rewriting every column that uses it and dropping the old type, which takes an ACCESS
-- EXCLUSIVE lock on `attendance` to delete a value that NOTHING has ever written: the
-- credit-on-open write was W3.2's to build and W3.2 is cut, so there are no rows and no
-- writer. A type rewrite to tidy an unused label is cost with no benefit.
--
-- So the value stays and says why. The app-side code paths that rendered it go in this
-- same change, which is what actually matters: a label nobody can produce is inert, while
-- a UI branch for an impossible state is a lie about what the product does.
comment on type public.attendance_source is
  'How an attendance row was created. `here_button` is the only value the product can produce. `live_watch` is RETIRED (ADR 0021, 2026-08-15): it belonged to the cut LIVE screen''s credit-on-open rule, was never written by anything, and is kept only because Postgres cannot drop an enum value without a full type rewrite. Do not write it; do not build on it.';

commit;
