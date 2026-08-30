# Deploying to production

**Started life as the W3.5 deploy checklist and is now the general procedure.** It has been
run twice: 2026-08-20 (W3.5 slices 1-4) and 2026-08-29 (the W3.5 tail plus W3.6). The
ordered steps below are the reusable part; execution notes for both runs are at the bottom,
and the second run's notes carry the lesson that a function missing its `config.toml` block
is a job that no-ops silently.

**Run 1, 2026-08-20 09:32 UTC:** PR #204 merged as `afffc3f`, run `32354255696` applied
seven migrations (`20260819180000` through `20260820160000`) and deployed all sixteen
functions. Its two healthchecks stayed open for nine days.

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

---

## Execution notes, 2026-08-29 (W3.5 tail + W3.6)

**This is the journey the file above predicted, and it is now complete.** The header kept
this runbook because "slice 5 and slice 4b will each make this same journey"; both did, in
one deploy, together with W3.6. Treat the ordered checklist as the general
production-deploy procedure rather than a W3.5 artefact.

Six migrations, not one, because production had been left at `20260820160000` while five
more merged:

| Migration | What |
|---|---|
| `20260820180000` | a branch that stops meeting (slice 5a) |
| `20260820200000` | grants are the table boundary (PR #207, closed issue #96) |
| `20260821120000` | one headquarters, and who moves it (slice 5b) |
| `20260821140000` | a closed branch takes no attendance |
| `20260822120000` | an event gets a picture (slice 4b, creates `event-images`) |
| `20260829120000` | W3.6 slice 2, the only one adding a cron schedule |

`db push` is all-or-nothing, so the choice was these six or nothing. **Check what is
actually pending before dispatching**, rather than assuming the deploy matches the work item
you have in your head; `list_migrations` against production answers it in one call.

- **Backup dispatched first** (run `33253447396`, success 12:51 UTC), minutes rather than
  hours old, exactly as step 3 asks.
- **Deploy run `33253597950`, success.** Seventeen functions.
- **Production was empty of everything the six migrations touch**, which made this the
  safest possible moment for a privilege revocation and a new public-read bucket: 0 events,
  0 testimonies, 0 prayers, 0 glory reactions, 0 intercessions, 4 branches with exactly 1
  HQ (so the one-HQ rule could not fail on existing data), 2 profiles.
- **Verified from the database**: 12 active cron jobs with `activity-notices` at
  `* * * * *`; `net._http_response` showing `200 {"due":0,"created":0}` and **no 404s**;
  a lease in `public.job_leases` taken and already released.
- **The healthcheck and its secret were done the same day**, which is the one thing the
  2026-08-20 notes left open. `prod-activity-notices`, cron `* * * * *`, UTC, 5 minutes
  grace. Fourteen checks against the free tier's twenty.

### The lesson this deploy paid for

**A function without a `[functions.<slug>]` block in `supabase/config.toml` is a job that
no-ops silently, and every test can be green while it happens.** `activity-notices` shipped
in PR #211 without one. Locally it had been firing every minute into `404 Function not
found` (49 times) while `cron.job_run_details` recorded "succeeded", because the POST worked.
Hosted it would have failed differently and just as quietly: no block means `verify_jwt`
defaults to true, and since ADR 0024 this project's keys are not JWTs, so the platform gate
refuses `pg_cron`'s call before the function runs.

Caught while reading this runbook's own line that "a new function is a directory plus a
`config.toml` block", fixed in PR #212 before the deploy, and now guarded by
`supabase/functions/_shared/configBlocks_test.ts`, which asserts both directions: every
directory has a block, and every block still has a directory.

### One thing to know before the next app-side session

**`devices` is 0 in production.** No push token is registered, so nothing can be
push-tested until a build is installed and signed into. `testimonies`, `prayers` and
`glory_reactions` are also 0, so `activity-notices` correctly finds nothing: its first real
send will be the first time somebody reacts to something.
