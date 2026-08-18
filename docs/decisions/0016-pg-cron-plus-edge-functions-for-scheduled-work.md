# 0016 · Scheduled work runs on pg_cron, invoked through pg_net, configured from the vault

- Status: accepted
- Date: 2026-08-06
- Spec: `docs/spec/21-OPERATIONS.md` §5, `17-ADMIN-DASHBOARD.md` §1, `09-FEATURE-Family.md`
- Supersedes: the "cron registration is owned by Track P" note in `21` §5 (2026-07-25)

## Context

W2.7 slice 5 needed the first scheduled job in the project. `grep cron.schedule` over
`supabase/migrations` returned nothing before it: the edge functions from Phase 1
(`youtube-sync`, `live-detection`) ship built and tested but nothing has ever run them
on a clock. Everything scheduled in `21` §5 is still ahead of us, so the shape chosen
here is inherited by W2.8's streak safety net, W3.4's six reminder jobs, W3.3's push
receipts sweep, and Track P's nightly dump.

Three constraints shaped it.

1. **GitHub Actions minutes are a shared pool** across all of Ayo's private repos, and
   the CI budget rule in `CLAUDE.md` says workflows must cost zero when idle. A
   scheduled workflow bills on every tick whether or not there is work, and it needs
   credentials handed to a runner to reach the database at all.
2. **`21` §5 recorded cron registration as Track P's**, because "the schedule is
   environment-specific (function URLs + a cron-invocation secret differ per env)".
   That is true of the VALUES; it is not true of the schedule.
3. **`23` §3a: the migrations folder IS the schema.** A migration that hard-codes a
   function URL is a migration that must differ per environment, which means a history
   that differs per environment, which is the thing that rule exists to prevent.

## Decision

**pg_cron ticks, pg_net calls the edge function, and both environment-specific values
come out of Supabase Vault at call time.**

```
cron.schedule('moderation-alerts', '7 * * * *',
  $$select jobs.invoke_edge_function('moderation-alerts')$$)
      -> jobs.invoke_edge_function reads project_url + secret_key from the vault
      -> net.http_post(<project_url>/functions/v1/<slug>, apikey: <secret_key>)
      -> the function does the work and pings its healthchecks.io dead-man check
```

*(As written in 2026-08-06 the second secret was `service_role_key`, sent as
`Authorization: Bearer`. ADR 0024 (landed 2026-08-19, migration `20260819100000`)
moved the vault to the `sb_secret_` key under the name `secret_key`, sent as
`apikey`; the mechanism above is otherwise unchanged.)*

Four rules come with it, and they are the actual content of this decision:

- **The schedule lives in a migration; the values live in the vault.** The same history
  applies to a laptop, to dev and to prod. Each environment holds two secrets,
  `project_url` and `secret_key` (ADR 0024), which are a runbook step rather than a code
  change. An environment with an empty vault raises a NOTICE and does nothing, so a
  fresh `supabase db reset` and every CI run are silent rather than failing.
- **The database decides, the function delivers.** Who to tell and what about is a SQL
  function with pgTAP over it; the edge function renders and sends. It keeps the rules
  testable without a network and keeps one definition of "a pending item" (the job reads
  `moderation_queue`, the same view the dashboard reads).
- **Every job takes a lease** (`public.claim_job_lease`), gives it back when it finishes,
  and the lease expires on its own if the run dies holding it. `21` §5 already assumed
  this for the streak recompute. Advisory locks cannot do the job: the functions reach
  the database through PostgREST, so every statement is a different pooled session.
- **Every job ends with its dead-man ping** (`21` §5/§6), and a job that cannot deliver
  pings FAILURE rather than returning quietly. `21` §5 names "reminders silently stop"
  as the canonical failure of this whole family, so a run that finds email unconfigured
  is a failed run, not a successful no-op.

## Consequences

- Track P no longer owns cron registration. What it still owns is per-environment: the
  two vault secrets, the healthchecks.io checks, and the prod cleanup of the six cron
  jobs belonging to the retired app (`prod-audit-2026-07-30`). `21` §5's note is
  corrected in the same PR as this ADR.
- The service-role key sits in the vault of every environment that runs jobs. It is
  already the key the functions require (`_shared/auth.ts`), the vault is encrypted at
  rest, and `jobs.invoke_edge_function` is granted to no role at all: pg_cron runs it as
  the role that scheduled it. The alternative, a separate per-function cron secret, adds
  a secret to rotate and does not reduce what a database compromise reaches.
- Locally the jobs are armed by `pnpm db:reset` (or `pnpm jobs:arm-local`), which reads
  the machine's own keys from the CLI. Nothing is committed: local keys are regenerated
  per machine.
- A job's timing is now a one-line migration, which makes cadence a reviewable decision
  rather than a dashboard setting nobody can see in the repo.

## Alternatives considered

- **GitHub Actions cron.** Rejected on the CI budget rule: it bills the shared pool on
  every tick, and it needs database credentials in a runner.
- **Supabase's dashboard cron UI.** Same mechanism underneath, but the schedule would
  live outside the repo, differ per environment by accident rather than by decision, and
  be invisible in review.
- **Doing the whole job in plpgsql with pg_net posting straight to Resend.** Fewer moving
  parts, and it puts email templating in SQL with no unit tests and an asynchronous
  response nobody reads, so "did it send?" becomes unanswerable. The database already
  decides everything that needs testing; rendering is the part that belongs in TypeScript.
- **An outbox table written by a trigger** on `testimonies`/`prayers`/`reports`. It is
  the project's usual instinct (`privileged_actions` works that way) and it is wrong for
  this job: a trigger that fails to fire is silence, and silence is the exact failure the
  freshness safeguard exists to prevent. A scan re-derives the work from the queue every
  hour, so a missed tick, a restored backup and a re-pended post all come out right.
