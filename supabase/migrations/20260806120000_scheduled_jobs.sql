-- Scheduled work, the pattern (W2.7 slice 5, docs/spec/21 §5, ADR 0016).
--
-- This is the first schedule in the project: `grep cron.schedule` over this folder returned
-- nothing before it. So the shape chosen here is the one W2.8's streak safety net, W3.4's
-- whole reminder family and Track P's nightly dump inherit, and it is worth stating why it
-- is shaped this way.
--
-- WHY pg_cron AND NOT GITHUB ACTIONS. Actions minutes are a shared pool across all of Ayo's
-- private repos and workflows must cost zero when idle (CLAUDE.md, `21` §9). A scheduled
-- workflow costs minutes on every tick whether or not there is work, and it puts the
-- ministry's cadence on a runner that has to be given credentials to reach the database.
-- pg_cron ticks inside the database that already holds the answer.
--
-- WHY THE URL AND THE KEY COME FROM VAULT. `21` §5 recorded the cron registration as Track
-- P's, on the reasoning that "the schedule is environment-specific (function URLs + a
-- cron-invocation secret differ per env)". That is true of the VALUES and not of the
-- SCHEDULE: read them at call time and the same migration is correct on a laptop, on dev and
-- on prod, with each environment holding its own two secrets. The alternative, a migration
-- per environment, is a migration history that differs per environment, which `23` §3a
-- forbids for good reason. `21` §5 is corrected in this PR.
--
-- WHY AN UNCONFIGURED STACK IS A NOTICE AND NOT AN ERROR. A fresh `supabase db reset` has an
-- empty vault, and every tick would otherwise write a failure into cron.job_run_details for
-- a machine that was never meant to send anything. A job that genuinely stops running is
-- caught by its healthchecks.io dead-man check (`21` §5/§6), which is the mechanism that
-- exists precisely so silence is noticed. Locally, `pnpm jobs:arm-local` fills the vault.
--
-- NOTE FOR TRACK P. The shared prod project already has pg_cron installed and six active
-- cron jobs belonging to the RETIRED app (CLAUDE.md, prod-audit-2026-07-30). `if not exists`
-- adds nothing to them and touches none of them; they stay Track P's to drop, and the two
-- jobs registered here are named for this app.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- A schema for machinery that no client may reach. `config.toml` exposes `public` and
-- `graphql_public` to PostgREST and nothing else, so anything in here is unreachable through
-- the API by construction rather than by a policy someone has to maintain.
create schema if not exists jobs;
revoke all on schema jobs from public, anon, authenticated, service_role;

comment on schema jobs is
  'Scheduling machinery (docs/spec/21 §5, ADR 0016). Not exposed to PostgREST. Job LOGIC lives in public functions the edge functions call; only the invocation plumbing lives here.';

/**
 * Invoke one edge function from the database.
 *
 * SECURITY INVOKER, deliberately: pg_cron runs a job as the role that scheduled it, which is
 * `postgres`, and nothing else is granted EXECUTE. A definer function would hand whoever was
 * granted it the vault's contents through an argument, and there is no caller here that
 * needs it.
 *
 * Fire-and-forget by design: pg_net returns a request id and the response lands in
 * `net._http_response` later. What the job DID is not judged here (the function owns its own
 * outcome and its own dead-man ping); this only starts it.
 */
create or replace function jobs.invoke_edge_function(slug text)
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  base text;
  key text;
  request_id bigint;
begin
  select decrypted_secret into base from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into key from vault.decrypted_secrets where name = 'service_role_key';

  if base is null or key is null then
    raise notice 'jobs: % not invoked (project_url/service_role_key absent from the vault)', slug;
    return null;
  end if;

  select net.http_post(
    url := base || '/functions/v1/' || slug,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      -- The functions require the service-role key in the handler itself, not merely a
      -- valid project JWT (supabase/functions/_shared/auth.ts).
      'Authorization', 'Bearer ' || key
    ),
    -- Generous, because it bounds only how long pg_net waits for a reply it does not read.
    -- The function keeps running server-side either way.
    timeout_milliseconds := 30000
  ) into request_id;

  return request_id;
end;
$$;

revoke all on function jobs.invoke_edge_function(text)
  from public, anon, authenticated, service_role;

comment on function jobs.invoke_edge_function is
  'POSTs to <project_url>/functions/v1/<slug> with the service-role key, both read from the vault at call time so the same migration is correct in every environment. Returns null and raises a NOTICE when the vault is empty (docs/spec/21 §5, ADR 0016).';

-- --- leases ---------------------------------------------------------------------------------
--
-- `21` §5 already assumes this ("streak recompute ... lease-locked"), and the backend standard
-- asks for it outright: scheduled work takes a lease so two instances cannot double-run. Here
-- that matters because the jobs SEND things. A run that overruns its tick and meets the next
-- one would mail the same leader twice, and once W3.4 puts push behind this pattern the same
-- overlap would reach members' phones.
--
-- An advisory lock would be the usual answer and cannot work here: the jobs reach the database
-- through PostgREST, so every statement is a different pooled session and a session-scoped lock
-- is released before the work starts. A row with an expiry is the shape that survives that.

create table public.job_leases (
  job text primary key,
  leased_until timestamptz not null
);

alter table public.job_leases enable row level security;
alter table public.job_leases force row level security;

-- Revoked by name: Supabase's bootstrap grants ALL on new tables to anon and authenticated
-- directly, so revoking from PUBLIC alone would look like a fence and be none (issue #96).
revoke all on public.job_leases from anon, authenticated;

comment on table public.job_leases is
  'One row per scheduled job, holding the instant its current lease expires (docs/spec/21 §5). Bookkeeping, not an inbox: no policies, no client access.';

/**
 * Take the lease for a job, or find out that somebody else holds it.
 *
 * ONE statement, deliberately. `insert ... on conflict do update ... where` takes the row lock
 * and evaluates the predicate under it, so two runs racing on the same tick cannot both come
 * back true. A read-then-write would be exactly the check-then-act the database standard warns
 * against.
 *
 * The lease EXPIRES rather than being released: a job that dies mid-run holds nothing longer
 * than the window it asked for, so a crash costs one tick and never a stuck job.
 */
create function public.claim_job_lease(job_name text, lease interval default '10 minutes')
returns boolean
language plpgsql
as $function$
declare
  claimed boolean;
begin
  -- `<=`, not `<`: release_job_lease() below ends a lease by stamping it `now()`, and a lease
  -- whose expiry has arrived is free. With a strict `<` the released lease is unclaimable for
  -- as long as the two clocks read the same instant, which inside one transaction is forever
  -- (now() is the transaction's timestamp, so it does not advance). Caught by 029.
  insert into public.job_leases (job, leased_until)
  values (job_name, now() + lease)
  on conflict (job) do update
    set leased_until = excluded.leased_until
    where public.job_leases.leased_until <= now()
  returning true into claimed;

  -- A held lease conflicts and updates nothing, so RETURNING yields no row at all. Answering
  -- false here rather than null keeps that from becoming every caller's problem.
  return coalesce(claimed, false);
end;
$function$;

/**
 * Give the lease back when the run is over.
 *
 * The expiry above is the crash net, not the mechanism: a job that finishes in two seconds
 * should not hold its lease for the rest of the window. Without this, a manual re-run inside
 * the window is refused, which is confusing on a laptop and wrong during an incident, when
 * "run it again now" is exactly what an operator needs (measured on the first live run,
 * 2026-08-06). Released on failure too: the lease exists to stop two runs overlapping, not to
 * rate-limit retries.
 */
create function public.release_job_lease(job_name text)
returns void
language sql
volatile
as $function$
  update public.job_leases set leased_until = now() where job = job_name;
$function$;

revoke all on function public.claim_job_lease(text, interval)
  from public, anon, authenticated, service_role;
revoke all on function public.release_job_lease(text)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_job_lease(text, interval) to service_role;
grant execute on function public.release_job_lease(text) to service_role;

comment on function public.claim_job_lease is
  'True when this run may proceed, false when another instance already holds the lease (docs/spec/21 §5). The lease is given back by release_job_lease() when the run ends; its expiry is the net for a run that dies holding it.';

comment on function public.release_job_lease is
  'Ends a job''s lease so the next run may start (docs/spec/21 §5). Safe to call for a job that holds none.';
