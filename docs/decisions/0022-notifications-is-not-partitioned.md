# 0022 · `notifications` is not partitioned

Date: 2026-08-16 · Status: accepted · Decider: Ayo

## Context

`02` specified `notifications` as **monthly-partitioned**, so the 12-month retention purge
`20` requires would be a partition drop rather than a large DELETE. The same table carries
two uniqueness rules, and both exist to stop a member being notified twice about one thing:

- `unique(profile_id, broadcast_id)` so a fan-out re-run never double-writes.
- partial unique `(profile_id, dedupe_key) where dedupe_key is not null` so an automated job
  that re-runs never double-sends, with keys that embed the occurrence they announce
  (`service_reminder:<branch_id>:<service_date>`).

W2.7 slice 5 discovered (2026-08-06) that these cannot all hold as written, and recorded it
in `02` as an open conflict for W3.3 to resolve deliberately: **Postgres requires every
unique constraint on a partitioned table to include the partition key.** Neither key does.
Enforced per partition instead, both guarantees lapse exactly at a month boundary. That is
also why W2.7's staff alerts were given their own small `job_alerts` ledger rather than this
table: those recipients are staff whose surface is email and the dashboard, so nothing was
gained by answering this question in a hurry.

The three options `02` named were a partition-key-inclusive key, an unpartitioned side table
holding the dedupe keys, or dropping partitioning and paying for retention with batched
deletes.

## Decision

**Drop the partitioning.** `notifications` is a plain table, both unique constraints exist as
`02` writes them, and retention is a monthly batched DELETE.

## Why

**A partition-key-inclusive key is not the guarantee.** Adding `created_at` to the key makes
it unique-per-instant, which is to say unique per attempt: a fan-out retried a minute later
mints a new `created_at` and inserts a second row for every recipient. It satisfies the
DDL and defeats the purpose.

**The side table works and costs more than it returns.** Partitions plus an unpartitioned
`(profile_id, dedupe_key)` table would preserve both guarantees across month boundaries.
It is strictly more machinery for the same result: two writes per notification, a
partition-creation job, and a second retention clock on the side table, whose own retention
is subtle (the key must outlive the window in which a re-run is possible, which is not the
same window as the notification's 12 months).

**Partitioning was buying retention, and at this volume retention is cheap.** Ceiling
estimate: ~2,000 members × ~12 notifications a month ≈ 24k rows a month, so ~290k rows
standing under the 12-month retention. A monthly `DELETE ... WHERE created_at < now() -
interval '12 months'` over that is sub-second, and `purge_old_notifications()` batches it
anyway so it never takes a long lock.

**The failure modes are asymmetric, and that is what decides it.** A retention job that
fails leaves stale rows: a privacy drift, visible in the next audit, fixed by running it.
A partition-maintenance job that fails stops INSERTs at midnight on the 1st, which for this
table means reminders silently stop, the canonical failure `21` §5 names at the top of its
own job table. Partitioning would have bought a cheaper purge at the price of a new way for
the whole notification system to go dark on a date known in advance.

## Consequences

- Both unique constraints exist and hold globally. A fan-out re-run across midnight on the
  1st, and a rescheduled reminder that straddles it, are both deduped.
- Retention is `purge_old_notifications(older_than, batch_size)`, shipped with the table so
  the decision is executable rather than promised, and asserted in pgTAP. **It is not
  scheduled here**: W3.4 owns the retention-purge job and schedules this function alongside
  the other purges, following ADR 0016.
- `02`'s open-conflict note and its partitioning line are corrected in the same PR, as is
  `21` §5's retention row ("notifications = drop old partitions").
- `push_tickets` was never partitioned and is unaffected; its 7-day purge is the same job.
- **Revisit if the table passes a few million rows.** The trigger is not time but volume,
  and the migration path then is real partitioning with the dedupe keys moved to a side
  table, which is option 2 above arriving when it is actually worth its machinery.

## This deviates from the database standard, deliberately

`~/.claude/standards/database.md` (Data lifecycle) says: *"Unbounded-growth tables (events,
logs, history) are partitioned by time so retention is DROP/DETACH PARTITION (instant), not
DELETE (vacuum debt for days)."* That rule is right, and this table is exactly the shape it
describes. The deviation is recorded here rather than taken quietly, per the standards-library
rule.

Two things put this table outside the rule's assumption. The standard's cost model is vacuum
debt at scale, and ~24k rows a month does not reach it. More importantly, the rule does not
account for the interaction that actually decides the case: **partitioning by time forecloses
every unique constraint that does not include the partition key**, and this table's two dedupe
keys are load-bearing correctness, not indexes. Partitioning here would not have been a slower
purge traded for a faster one; it would have been dedupe traded for a faster purge.

**The standard was amended rather than merely deviated from** (2026-08-16, with Ayo). A new
bullet after that one now records both preconditions this case exposed: that a partitioned
table's unique constraints must include the partition key (and that "fixing" a dedupe key by
adding the partition column yields unique-per-attempt, which is not dedupe), and that partition
creation is a scheduled job whose failure stops INSERTs on a date known in advance. It closes
with the framing that would have settled this in one reading: partitioning is a scale tool,
adopted on measured volume rather than on a table's shape.

So this ADR is no longer a deviation from the standard; it is an instance of it.

## Alternatives considered

| Option | Verdict |
|---|---|
| Partition + key including `created_at` | Rejected: unique-per-attempt is not dedupe |
| Partition + unpartitioned dedupe side table | Rejected for now: same guarantee, more moving parts, second retention clock. The path back if volume ever justifies it |
| Partition + accept dedupe lapsing per month | Rejected: a fan-out retried across a month boundary double-notifies every recipient |
| No partitioning + batched delete | **Chosen** |
