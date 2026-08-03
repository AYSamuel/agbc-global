-- The private moderation note stops being readable by the author (found 2026-08-03,
-- surveying W2.6; the column arrived in 20260729180000, W2.7 slice 3).
--
-- WHAT WAS WRONG. `moderation_note` exists so a leader can record why something was
-- removed WITHOUT handing that reason back: the removals that most need a record are the
-- safeguarding ones (`17` §1, `20`), where the true reason is exactly what must not be
-- disclosed, and is sometimes unsafe to disclose. Its own migration says the note "never
-- leaves the moderation surface".
--
-- It left. Measured against the local stack, through the role PostgREST connects as:
--
--   set local role authenticated;                       -- claims: the AUTHOR's own id
--   select moderation_note from public.testimonies where id = <their own row>;
--    -> SAFEGUARDING: routed to the branch lead pastor
--
-- The policy "authors read their own testimonies" grants the ROW, and `authenticated`
-- held table-level SELECT, so which COLUMNS come back was never the policy's to decide.
-- `017` asserted the column is absent from the two feed views, which is true, and is a
-- different question: the feeds are how strangers read, and this is how the author reads.
--
-- WHY A GRANT AND NOT A NEW TABLE. The project convention says a private column on a row
-- someone else may read needs a different home rather than a cleverer policy, and the
-- point of that rule is that RLS cannot express "this column, not that one". Column
-- privileges can, and they are the Postgres feature for precisely this. Moving the note
-- to its own table would also split the moderation write into two statements: today the
-- decision and its note are one UPDATE carrying the compare-and-set, and a note that can
-- fail separately from the removal it explains is worse than the problem being fixed.
--
-- A table-level grant cannot be partially revoked (`revoke select (col)` leaves the
-- table-level grant in force), so SELECT is revoked and re-granted column by column. The
-- cost is that a column added later is invisible until it is named here. That is the
-- right way round: a forgotten column breaks a read loudly in tests, where the old shape
-- leaked a safeguarding note silently. `017` asserts the whole inventory so the decision
-- cannot be skipped by accident.
--
-- `moderated_by` STAYS READABLE, and the reason is worth writing down because it was
-- tried the other way first. It names WHICH leader decided, so on ADR 0015's reasoning
-- (the member is told the outcome, never who decided) it looks like it belongs on the
-- private side of the line. It cannot go there with a grant: every human on this system
-- is the same database role, so revoking it from `authenticated` takes it from the
-- moderators too, and `017` already asserts that a leader can read who decided. Denying
-- an author by denying the ministry its own audit trail is not a trade this migration
-- gets to make on its own. Moving it needs a moderator-only read path (a definer view or
-- RPC), which is a design decision and is flagged rather than smuggled in here.
--
-- `moderated_at` stays for a simpler reason: a timestamp discloses nobody, and MY-POSTS
-- (W2.6) may well want it.
--
-- Rollback (roll forward): a compensating migration re-grants table-level SELECT. Nothing
-- is dropped and no data moves, so there is nothing to restore.

begin;

set local lock_timeout = '3s';

-- --- testimonies ------------------------------------------------------------------

revoke select on public.testimonies from authenticated;

grant select (
  id, author_id, branch_id, body, language, category_id, image_path, from_prayer_id,
  status, rejection_reason, consent_version, consented_at, moderated_by, moderated_at,
  glory_count, deleted_at, created_at, updated_at
) on public.testimonies to authenticated;

-- --- prayers ----------------------------------------------------------------------

revoke select on public.prayers from authenticated;

grant select (
  id, author_id, branch_id, body, language, is_anonymous, status, rejection_reason,
  consent_version, consented_at, answered_at, praying_count, prayed_count, moderated_by,
  moderated_at, deleted_at, created_at, updated_at
) on public.prayers to authenticated;

-- UPDATE is deliberately untouched. A moderator still writes the note in the same
-- statement as the decision it belongs to, and column privileges are checked against the
-- columns a statement NAMES: the trigger that stamps `moderated_by` is unaffected, and so
-- is `... returning id`.
--
-- `anon` is untouched for a different reason: it holds no grant on either table at all.
-- Guests read the feeds, which are views owned by postgres with security_invoker off.

comment on column public.testimonies.moderation_note is
  'Private moderator note (docs/spec/17 §1). NEVER shown to the author: not by the feed views, and not by the author''s own read either, which is a column privilege rather than a policy (20260803140000). Contrast rejection_reason, which is author-facing.';
comment on column public.prayers.moderation_note is
  'Private moderator note (docs/spec/17 §1). NEVER shown to the author: not by the feed views, and not by the author''s own read either, which is a column privilege rather than a policy (20260803140000). Contrast rejection_reason, which is author-facing.';
comment on column public.testimonies.moderated_by is
  'Which moderator decided. Readable by the author as well, because every human here is the same database role and taking it from them takes it from the moderators too; making it moderator-only needs a definer read path (flagged 2026-08-03, 20260803140000).';
comment on column public.prayers.moderated_by is
  'Which moderator decided. Readable by the author as well, because every human here is the same database role and taking it from them takes it from the moderators too; making it moderator-only needs a definer read path (flagged 2026-08-03, 20260803140000).';

commit;
