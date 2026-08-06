// Arms the scheduled jobs on the LOCAL stack (docs/spec/21 §5, ADR 0016).
//
// `20260806120000_scheduled_jobs.sql` registers the schedules in every environment and reads
// the two values it needs (project_url, service_role_key) out of the vault at call time, so a
// database that has never been armed simply no-ops. That is right for CI and for a laptop
// that only runs pgTAP; it is not right for `pnpm db:reset`, after which Ayo expects the local
// stack to behave like the real thing.
//
// The keys are NOT committed anywhere: they are regenerated per machine, so they are asked of
// the CLI here exactly as the dashboard's tests do (apps/dashboard/src/test/localStack.ts).
//
// The URL is the one the DATABASE can reach, which is not the one a browser uses: pg_net runs
// inside the postgres container, where the API gateway resolves as `kong:8000` rather than
// 127.0.0.1:55321.
import { execSync } from 'node:child_process';

const CONTAINER = 'supabase_db_agbc-global';
const INTERNAL_API_URL = 'http://kong:8000';

let statusEnv = '';
try {
  statusEnv = execSync('supabase status -o env', { encoding: 'utf8' });
} catch {
  console.error(
    'Could not read `supabase status`. Is the local stack running? (supabase start)',
  );
  process.exit(1);
}

// The legacy JWT, for the same reason sync-local-sermons.mjs prefers it: the local functions
// gateway and the functions' own service-role check both expect it.
const key =
  statusEnv.match(/^SERVICE_ROLE_KEY="?([^"\r\n]+)"?$/m)?.[1] ??
  statusEnv.match(/^SECRET_KEY="?([^"\r\n]+)"?$/m)?.[1];
if (!key) {
  console.error(
    'No service key in `supabase status -o env` output; cannot arm the jobs.',
  );
  process.exit(1);
}

// Re-armable: vault.create_secret refuses a duplicate name, so an existing secret is updated
// rather than added. Values are piped in on stdin, never passed as arguments, so they do not
// land in a process list.
const sql = `
do $$
declare
  existing uuid;
begin
  select id into existing from vault.secrets where name = 'project_url';
  if existing is null then
    perform vault.create_secret($v$${INTERNAL_API_URL}$v$, 'project_url', 'local stack');
  else
    perform vault.update_secret(existing, $v$${INTERNAL_API_URL}$v$);
  end if;

  select id into existing from vault.secrets where name = 'service_role_key';
  if existing is null then
    perform vault.create_secret($v$${key}$v$, 'service_role_key', 'local stack');
  else
    perform vault.update_secret(existing, $v$${key}$v$);
  end if;
end
$$;
`;

try {
  execSync(
    `docker exec -i ${CONTAINER} psql -U postgres -d postgres -q -v ON_ERROR_STOP=1`,
    { input: sql, encoding: 'utf8', stdio: ['pipe', 'ignore', 'pipe'] },
  );
} catch (error) {
  console.error('Could not write the vault secrets:', error.stderr ?? error);
  process.exit(1);
}

console.log(
  `scheduled jobs armed: pg_cron will reach the edge runtime at ${INTERNAL_API_URL}`,
);
