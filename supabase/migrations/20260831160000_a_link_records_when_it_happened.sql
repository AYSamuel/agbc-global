-- #164 follow-up: the "when" of the link trio, on the one path that never wrote it.
--
-- FOUND BY OPENING W4.0 IN PRODUCTION, minutes after the deploy, which is the only place it
-- was visible. The whole suite is green on it, because every fixture that inserts an attached
-- registration names `linked_at` itself; production's single handoff row is the only one that
-- has ever arrived the way the website actually sends them.
--
-- WHAT WAS WRONG. `20260809202000` calls `linked_by` / `linked_at` / `link_method` "the link
-- trio: who attached this row to a member, when, and by what proof", and the website's INSERT
-- writes two thirds of it. A handoff checkout arrives already carrying `profile_id` and
-- `link_method = 'handoff'` (the profile rides in the Checkout session metadata, ADR 0017
-- decision 8), and nothing sets `linked_at`, because the only writers that column has ever
-- had are the claim flow cut on 2026-08-11 and W4.0's own leader routines. So a handoff row
-- is attached to a member and cannot say when.
--
-- TWO THINGS IT BREAKS, both quiet enough to survive a review.
--   * The Linked view orders on `linked_at desc nulls last`, so every handoff row sinks
--     below every hand-linked row for ever, whatever the dates, under a heading that reads
--     MOST RECENT FIRST.
--   * The card and the unlink screen fall back to `created_at` when `linked_at` is null while
--     the surrounding word stays "linked", so the unlink header offers the registration date
--     as the link date. For a handoff those are usually the same day, which is exactly why
--     nobody would catch it by looking; for one redeemed later they are not.
--
-- WHY THE INSERT GUARD IS THE HOME. It already exists to fill in what the website's insert
-- cannot: it resolves `course_id` from the slug for precisely the same reason, so the app has
-- one column to query. This is one more derived column beside that one, not a new mechanism.
-- The alternative, asking `Desktop/agbc` to send it, would put a column this repo owns on the
-- far side of a release schedule we do not control, and add a twelfth name to the shared
-- column contract for no gain.
--
-- ON INSERT ONLY, deliberately. `link_registration` and `unlink_registration` already set
-- `linked_at` explicitly, to `now()` and to null, and no client role may UPDATE `profile_id`
-- at all, so INSERT is the only door through which a row can arrive attached with the column
-- unset. A trigger that also fired on UPDATE would be a second owner of a value those
-- routines already own, and would have to be taught to leave the unlink's deliberate null
-- alone. One visible fact, one owner.
--
-- THE BACKFILL IS EXACT RATHER THAN A GUESS. Any row holding a `profile_id` with no
-- `linked_at` received that `profile_id` at INSERT, because the only UPDATE path that sets
-- one is `link_registration`, which writes `linked_at` in the same statement. So `created_at`
-- IS the moment those rows were linked. The audit trigger stays silent through it: it fires
-- on a change of `profile_id`, and this changes only `linked_at`, so the backfill writes no
-- `privileged_actions` row attributing anything to nobody.
--
-- WHY NOT A CHECK CONSTRAINT, which is what the database standard would otherwise ask for
-- ("constraints live in the database"). The invariant this creates is real: `linked_at` is
-- non-null exactly when `profile_id` is. But `profile_id` is a column THE WEBSITE SENDS, so
-- a CHECK over it is a constraint that can refuse a live Stripe webhook insert, and
-- `20260817120000`'s header already settled that argument for both shared tables: no value
-- CHECKs on the website's columns, deliberately and against this repo's usual habit, because
-- a refused insert there is not a validation message anybody sees, it is a member charged
-- with no record of it and no confirmation. If the trigger were ever dropped, a CHECK would
-- convert a missing timestamp into a failed payment. The invariant is asserted in pgTAP
-- (`032`) instead, where being wrong costs a red build rather than a donation.
--
-- Rollback (roll forward, per the database standard): a compensating migration restores the
-- previous guard body. The backfilled values are correct either way and want no undoing.

begin;

set local lock_timeout = '3s';

-- Reproduced from `20260809202000` unchanged except for the new block and this note, so a
-- diff of the two files shows exactly what moved. `create or replace` keeps the ownership and
-- the ACL that migration set.
create or replace function public.course_registrations_insert_guard()
returns trigger
language plpgsql
as $$
begin
  if (select auth.uid()) is not null then
    raise exception 'registrations are written by the website, never from the app'
      using errcode = 'insufficient_privilege';
  end if;

  if new.course_id is null and new.course <> '' then
    select c.id into new.course_id
    from public.courses c
    where c.slug = new.course;
  end if;

  -- A row born attached to a member is a row linked at birth, and this trigger is the only
  -- place that fact is known. `20260809202000`'s audit comment already reasons from it ("a
  -- handoff row born linked is the member's own act"); this writes the timestamp that
  -- sentence assumes exists.
  --
  -- NEVER AN OVERWRITE. A trusted writer that names the column (seeds, pgTAP fixtures, a
  -- future importer restating history) keeps the value it chose, so this can only ever add
  -- a "when" that was going to be missing.
  if new.profile_id is not null and new.linked_at is null then
    new.linked_at := now();
  end if;

  return new;
end;
$$;

comment on function public.course_registrations_insert_guard is
  'Fills in what the website''s insert cannot: course_id from the course slug, and linked_at for a row that arrives already carrying a member (#164 follow-up, so the link trio is never two thirds written). Refuses any insert made with a user context, because the app never writes a registration (ADR 0017 decision 6).';

comment on column public.course_registrations.linked_at is
  'When this row was attached to a member, written by both paths that attach one: this table''s insert guard for a row born attached (link_method handoff), and link_registration for a hand-link (leader). The other two link_method values, self and email_auto, are enum members with no producer today; whatever writes them writes this too. Non-null exactly when profile_id is, maintained by the trigger rather than by a CHECK, for the reason in this migration''s header.';

-- The backfill, exact for the reason in the header. One statement rather than the standard's
-- bounded batches, because only rows attached at birth can qualify and the whole table is
-- three figures at most: one row on production (the 2026-08-19 handoff test), zero
-- everywhere else, since every fixture and seed names the column itself.
update public.course_registrations
   set linked_at = created_at
 where profile_id is not null
   and linked_at is null;

commit;
