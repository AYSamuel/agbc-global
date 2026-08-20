# Deploying W3.5 to production

**DONE on 2026-08-20 09:32 UTC**, except the two healthchecks and their secrets (steps 5 and
6, which are Ayo's). PR #204 merged as `afffc3f`, run `32354255696` applied seven migrations
(`20260819180000` through `20260820160000`) and deployed all sixteen functions. Kept rather
than deleted, because slice 5 and slice 4b will each make this same journey and the order
below is the reusable part. Execution notes are at the bottom.

Written 2026-08-20, when W3.5 slices 1-4 were complete on `feat/w3-5-broadcast-domain` and
production was still running W3.4's schema. It is a checklist rather than a narrative
because every step here has a gate in front of it and the gates are the point.

**Nothing in this file can run before the PR is merged**, and that ordering is not a
formality. `supabase-deploy.yml`'s prod job checks out the ref it is dispatched from, so it
*could* be pointed at a feature branch; doing that would put migrations into production that
no CI run has applied from empty and no review has seen, and if the PR then changed anything
the two histories would disagree with no way back short of a restore. The migrations folder
IS the schema (project CLAUDE.md), and production follows `main`.

## What is waiting to go out

Fourteen migrations from `20260819180000` to `20260820160000`: the broadcast domain and its
state machine, the fan-out, the composer's read/write surface, the event notices, the
receipts sweep's second ledger, and the event status actor.

Two new scheduled jobs, both armed by their own migrations once the vault holds
`project_url` and `secret_key` (ADR 0016, already true in production since Track P Phase 2):

| Job | Schedule | Healthcheck secret |
|---|---|---|
| `broadcast-fanout` | every minute | `HEALTHCHECK_URL_BROADCAST_FANOUT` |
| `event-notices` | every minute | `HEALTHCHECK_URL_EVENT_NOTICES` |

Both edge functions deploy automatically: the prod job runs `supabase functions deploy` with
no slug arguments, so a new function is a directory plus a `config.toml` block and never a
third place to remember. Both blocks are already in `supabase/config.toml`.

## The order

1. **Merge the PR** into `main`, with CI green. The `supabase` job in `pr.yml` applies the
   whole history to an empty database and runs pgTAP against it, which is the evidence that
   `supabase db push` will succeed.
2. **Check `PROD_DEPLOYS_ENABLED`** is still `true` in the repo variables. The workflow
   refuses to run at all otherwise, by design.
3. **Take a dump first.** `backup.yml` runs nightly, but a schema change of this size
   deserves a dump whose age is measured in minutes rather than hours
   (`docs/runbooks/restore-from-backup.md`).
4. **Dispatch `Supabase deploy`** from `main`. It links, `db push`es, and deploys every
   function.
5. **Create the two healthchecks.io checks**, `prod-broadcast-fanout` and
   `prod-event-notices`, taking the number from eleven to **thirteen**. Both are
   every-minute jobs, so use a cron schedule matching the migration rather than a plain
   period, with a grace of a few periods: a one-minute grace on a one-minute job alerts on
   any ordinary hiccup. Do NOT screenshot the checks list; it renders full ping URLs
   (`docs/runbooks/credentials.md` records why that matters).

   **The timezone is UTC, and that is not a formality.** Verified against production on
   2026-08-20: the database runs `UTC` and pg_cron's own `cron.timezone` is `GMT`, which in
   Postgres is a FIXED +00:00 zone rather than `Europe/London`, so it never shifts to BST.
   Every schedule in every migration therefore fires at the same UTC minute all year. A
   check set to Europe/London would drift an hour out of step for half the year and page
   for a job that ran exactly on time. It makes no difference to an every-minute check and
   all the difference to `41 2 * * *`.
6. **Set the two ping URLs as function secrets** on the production project. Until they are
   set, `optionalEnv` returns null and both jobs no-op their pings, which is silent rather
   than broken: the jobs work, nobody is watching them.
7. **Verify from the database, not from the dashboard**: `select jobname, schedule from
   cron.job` should list both, and `select * from public.job_leases` should show a lease
   being taken and released within a minute or two of the deploy.

## What to watch in the first hour

- **`event-notices` will find nothing to do**, and that is correct. The migration marks every
  existing event as already announced (`update public.events set announced_status = status,
  ...`) precisely so nobody wakes up to a notification about an event they have known about
  for weeks. In the event it was more trivial than that: **production holds no events at
  all**, because the events fixtures live in `10-dev-only.sql` and production was seeded
  with `00-common` and `05-courses` only. The first notice this church ever sends will be
  the first event posted from the dashboard.
- **`broadcast-fanout` will find nothing either** until a broadcast is approved.
- **The receipts sweep's denominator changes.** `push_error_rate` now counts broadcast
  pushes as well as automated ones, so the first broadcast will move a number that has only
  ever seen reminders. Above 10% it emails every admin once a day.

## What is NOT in this deploy

- **The event picture** (slice 4b): needs a public-read bucket, so it will carry its own
  storage migration.
- **Branch management and the archive flow** (slice 5).
- **Anything on the app side.** The mobile changes here are notification-centre rendering
  and four locale files, which ship in an EAS build rather than through this workflow. A
  member on the current build who receives an event notice sees the generic line rather
  than the templated one until they update; the row, the deep link and the tap all work.


## Execution notes, 2026-08-20

Steps 1-4 and 7 ran clean, in about eleven minutes end to end.

- **The merge fired the dev deploy job** (14s, the "dev secrets not configured; skipping"
  path). Nothing to do about it; it is the workflow's own no-op.
- **A dump was taken first** by dispatching `backup.yml` (run `32354061142`, 2m), rather
  than relying on the 03:27 nightly. A schema change of this size deserves a backup whose
  age is measured in minutes.
- **Seven migrations, sixteen functions.** `broadcast-fanout` and `event-notices` are both
  in the deployed list; no slug arguments means a new function needs a directory and a
  `config.toml` block and nothing else.
- **Verified from the database, not from a dashboard page.** `cron.job` lists eleven active
  jobs, the two new ones both `* * * * *`; `cron.job_run_details` shows them succeeding;
  and `public.job_leases` carries a lease each, taken and released within seconds of the
  deploy, which is the proof that the FUNCTIONS ran rather than only that pg_net posted.
- **Nothing was owed to anybody at deploy time**: zero events, zero broadcast deliveries,
  zero tickets awaiting receipts, zero notifications of the new types.

**Still open after this deploy:** the two healthchecks and their function secrets. Until
they are set, `optionalEnv` returns null and both jobs no-op their pings, which is silent
rather than broken: the jobs work, nobody is watching them.
