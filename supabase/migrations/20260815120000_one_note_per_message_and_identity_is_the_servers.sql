-- W3.1 slice 4 opens with the locks, because this slice is the FIRST thing to
-- write `saved_items` or `sermon_notes` from the app (the tables are W1.3's, and
-- have sat read-only-in-practice since). Three changes, two of them precedents
-- this repo has not set before, so the reasoning lives here rather than in a
-- conversation.
--
-- 1. `sermon_notes` gains `unique (profile_id, sermon_id)`. "One document per
--    member per message" has been a comment since W1.3 ("enforced client-side",
--    which is to say not enforced): an autosaving editor on two devices would
--    split a member's notes across two rows with one silently winning whichever
--    read came last. The constraint makes the shape the app is about to build
--    (upsert on conflict) possible at all, and it is also PostgREST's arbiter
--    for that upsert.
--
-- 2. `profile_id` DEFAULTS to `auth.uid()` on both tables, and the INSERT grant
--    below excludes the column, so a client cannot even NAME it. This is a new
--    pattern here, chosen deliberately over the two existing ones:
--      - RLS alone (the W1.3 posture, proven in 005) refuses a forged row, but
--        only after letting the client claim an identity and checking the claim.
--      - The `rsvps` guard trigger overwrites profile_id with auth.uid()
--        whatever the client sent; right there, because that trigger also
--        forces status and the reminder schedule.
--    These tables have NOTHING else to force, so a trigger would exist only to
--    assign one column; a default assigns it for free, and the grant turns
--    "your forgery is refused" into "identity is not an input". Trusted paths
--    (service role, seeds, pgTAP setup) always name profile_id explicitly and
--    are unaffected; a trusted INSERT that forgot it now fails not-null rather
--    than inventing an owner, which is the right failure.
--
-- 3. Issue #96's "while you are in there" moment: these tables still carry the
--    blanket default privileges, so `anon` holds INSERT/UPDATE/DELETE/TRUNCATE
--    today (RLS denies every one, so nothing is reachable; the point is
--    fragility, exactly as CLAUDE.md describes for course_registrations). The
--    blanket grants are revoked and re-granted per column, the same mechanism as
--    `20260803140000` on the SELECT side and the first INSERT-side use:
--      - sermon_notes: INSERT (sermon_id, body), UPDATE (sermon_id, body),
--        DELETE. `sermon_id` stays in the UPDATE grant because PostgREST's
--        merge-duplicates upsert SETs every payload column, so the conflict
--        target's own column rides in the SET (a no-op there: excluded equals
--        existing on the arbiter). A member moving their own note between
--        messages is within their rights over their own words.
--      - saved_items: INSERT (sermon_id), DELETE, and NO UPDATE at all: a saved
--        item has no mutable column, it exists or it does not. `created_at`
--        orders My List and is excluded from INSERT on both tables so list
--        order cannot be forged.
--    `anon` keeps SELECT only (RLS yields zero rows), preserving W1.3's
--    local/CI parity reasoning. `playback_positions` is deliberately NOT
--    touched: it is not this slice's table, and its blanket grants stay #96's
--    to fix in one sweep.
--
-- Rollback (roll forward): a compensating migration can re-grant table-level
-- privileges and drop the constraint; no data moves.

begin;

set local lock_timeout = '3s';

-- --- 1. One document per member per message --------------------------------

-- Defensive: nothing in the app has ever written this table, but a dev database
-- that picked up strays (device experiments, aborted tooling) must not refuse
-- the constraint. Newest updated_at survives, matching the autosave's own
-- last-write-wins semantics.
with ranked as (
  select id,
         row_number() over (
           partition by profile_id, sermon_id
           order by updated_at desc, id
         ) as rn
  from public.sermon_notes
)
delete from public.sermon_notes n
  using ranked r
  where n.id = r.id and r.rn > 1;

alter table public.sermon_notes
  add constraint sermon_notes_profile_sermon_key unique (profile_id, sermon_id);

-- The unique index now serves every read the plain one did.
drop index public.sermon_notes_profile_sermon_idx;

-- --- 2. Identity is the server's -------------------------------------------

alter table public.sermon_notes
  alter column profile_id set default auth.uid();
alter table public.saved_items
  alter column profile_id set default auth.uid();

-- --- 3. The grants say what a client may even ask --------------------------

revoke all on public.sermon_notes from anon, authenticated;
revoke all on public.saved_items from anon, authenticated;

grant select on public.sermon_notes, public.saved_items to anon, authenticated;

grant insert (sermon_id, body), update (sermon_id, body)
  on public.sermon_notes to authenticated;
grant delete on public.sermon_notes to authenticated;

grant insert (sermon_id) on public.saved_items to authenticated;
grant delete on public.saved_items to authenticated;

comment on column public.sermon_notes.profile_id is
  'Server-assigned (default auth.uid()); the INSERT grant excludes this column so a client cannot name it (20260815120000). Trusted paths set it explicitly.';
comment on column public.saved_items.profile_id is
  'Server-assigned (default auth.uid()); the INSERT grant excludes this column so a client cannot name it (20260815120000). Trusted paths set it explicitly.';
comment on constraint sermon_notes_profile_sermon_key on public.sermon_notes is
  'One autosaved document per member per message (docs/spec/08, W3.1 slice 4 decision 1). Also the PostgREST upsert arbiter.';

commit;
