-- The job path moves to the new API keys (ADR 0024, pulled forward; Track P Phase 2).
--
-- ADR 0024 scheduled this migration for after Phase 4, so that changing the
-- authorization mechanism could never be confused with the production move happening
-- around it. Phase 2 execution (2026-08-19) found the legacy path it meant to keep
-- was never verifiable on the new project at all, which dissolves the reason to wait:
--
--   The platform stamps SUPABASE_SERVICE_ROLE_KEY into the functions' env at
--   provisioning and never refreshes it, and on `agbc-production` that copy is a
--   DIFFERENT ISSUANCE of the service-role JWT than the dashboard, the management
--   API and the password manager all show (proved by digest comparison, not
--   assumption: the env digest matches none of them). Both issuances verify at the
--   gateway, but _shared/auth.ts compared bytes, so every cron invocation died 401
--   before the job code ran. Supabase's own docs close the escape routes: legacy
--   keys "can no longer be rotated", and the documented pattern for pg_net callers
--   is exactly the design below. Ayo chose the pull-forward over patching the
--   legacy comparison (same day).
--
-- What changes here: the invoker reads the vault secret `secret_key` (an sb_secret_
-- key now, so the name stops lying) and sends it in the `apikey` header. The new
-- keys are not JWTs and may never travel as Bearer; with that header gone,
-- config.toml turns verify_jwt off and _shared/auth.ts owns the whole gate,
-- comparing against every key in SUPABASE_SECRET_KEYS so a rotation is an overlap
-- rather than a flag-day.
--
-- Arming changes with it: environments now vault `secret_key`, not
-- `service_role_key` (locally `pnpm jobs:arm-local` writes it; hosted arming is the
-- credentials.md checklist). An old `service_role_key` vault row is inert once this
-- applies; delete it at leisure. An unarmed database still no-ops with a NOTICE,
-- exactly as ADR 0016 requires.

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
  select decrypted_secret into key from vault.decrypted_secrets where name = 'secret_key';

  if base is null or key is null then
    raise notice 'jobs: % not invoked (project_url/secret_key absent from the vault)', slug;
    return null;
  end if;

  select net.http_post(
    url := base || '/functions/v1/' || slug,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      -- The sb_secret_ key travels in this header only: it is not a JWT, and the
      -- handlers check it against SUPABASE_SECRET_KEYS (_shared/auth.ts, ADR 0024).
      'apikey', key
    ),
    -- Generous, because it bounds only how long pg_net waits for a reply it does not
    -- read. The function keeps running server-side either way.
    timeout_milliseconds := 30000
  ) into request_id;

  return request_id;
end;
$$;

-- create or replace preserves the ACL set by 20260806120000 (revoked from every
-- client role; pg_cron runs it as the scheduling role), so nothing to re-revoke.

comment on function jobs.invoke_edge_function is
  'POSTs to <project_url>/functions/v1/<slug> with the sb_secret_ key from the vault (`secret_key`) in the apikey header, both read at call time so the same migration is correct in every environment (ADR 0016, ADR 0024). Returns null and raises a NOTICE when the vault is empty.';
