/**
 * W4.5 slice 2 (docs/spec/16 §DELETE, `20`, `21` §5, ADR 0016): the schedule that finishes
 * an erasure.
 *
 * `erase_profile()` does everything a transaction can, which after slice 2's correction is
 * everything except object BYTES: the profile is stripped, every personal row is deleted,
 * the sessions are dead, and the auth user's address and identities are gone. What is left
 * is a list of storage paths in `account_erasures`, and this is the tick that carries it out.
 *
 * FIFTEEN MINUTES, not one. The account is already gone by the time a row lands here, so
 * this is not a member-visible delay: what is outstanding is unreachable files (both buckets
 * are private and the read policies hang off rows that no longer exist). Fifteen minutes is
 * comfortably "without undue delay" for an Art. 17 obligation, and it matches `push-receipts`
 * rather than inventing a cadence.
 *
 * ADR 0016's mechanism unchanged: the schedule lives here so it is identical in every
 * environment, `jobs.invoke_edge_function` reads the vault at call time, and an unarmed
 * database no-ops rather than erroring.
 *
 * Rollback plan: `select cron.unschedule('erasure-sweep')`. The rows stay in
 * `account_erasures` and are picked up whenever it is scheduled again, which is the whole
 * point of deriving the work from live state rather than from a queue we wrote.
 */

begin;

set local lock_timeout = '3s';

-- At :07 past each quarter hour, off the grid every other job crowds onto (:00, :01, :11,
-- :15, :16, :26, :30, :31, :46). Nothing here is time-sensitive; the offset is only so a
-- quarter-hour tick does not land on top of the receipts sweep.
select cron.schedule(
  'erasure-sweep',
  '7,22,37,52 * * * *',
  $cron$select jobs.invoke_edge_function('erasure-sweep')$cron$
);

-- `account_erasures` rows are deliberately NOT purged, and that is a decision rather than an
-- omission (~/.claude/standards/database.md asks every table for one).
--
-- A completed row is the PROOF that an Art. 17 request was honoured, and when: the same kind
-- of artefact `privileged_actions` is kept seven years for. It holds two ids, a set of paths
-- to objects that no longer exist, and four timestamps; there is no name, no address and no
-- content in it, so keeping it costs the departed member nothing and losing it would leave
-- the church unable to show that somebody's erasure ever happened.
comment on table public.account_erasures is
  'The out-of-database half of an account deletion (docs/spec/16): the storage objects a sweep must remove. Written by erase_profile() inside the erasure transaction, drained by `erasure-sweep` every 15 minutes. Service-role only: it names an auth user id and the paths of somebody''s photos. Completed rows are KEPT as the record that an Art. 17 request was honoured and when; they carry no name, address or content.';

commit;
