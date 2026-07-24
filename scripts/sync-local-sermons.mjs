// Repopulates the LOCAL sermons catalog. Sermons are synced from YouTube
// (docs/spec/08, 21 §5), never seeded, so a bare `supabase db reset` leaves the
// Watch tab empty and the app looks broken on device. `pnpm db:reset` runs this
// automatically; run it alone via `pnpm db:sync-sermons`.
//
// Invokes the youtube-sync edge function on the running local stack with the
// local service-role key (the function requires it, _shared/auth.ts). The edge
// runtime loads supabase/functions/.env, so with YOUTUBE_API_KEY present it
// syncs in API mode; without it the function falls back to keyless RSS.
import { execSync } from 'node:child_process';

let statusEnv = '';
try {
  statusEnv = execSync('supabase status -o env', { encoding: 'utf8' });
} catch {
  console.error(
    'Could not read `supabase status`. Is the local stack running? (supabase start)',
  );
  process.exit(1);
}

// Prefer the legacy JWT (SERVICE_ROLE_KEY): the functions gateway and the
// function's own service-role check both expect it. Newer CLIs also emit
// SECRET_KEY (sb_secret_...), which the local functions route rejects; it is
// only a last-resort fallback for CLI versions that drop the legacy name.
const key =
  statusEnv.match(/^SERVICE_ROLE_KEY="?([^"\r\n]+)"?$/m)?.[1] ??
  statusEnv.match(/^SECRET_KEY="?([^"\r\n]+)"?$/m)?.[1];
if (!key) {
  console.error(
    'No service key in `supabase status -o env` output; cannot invoke the sync.',
  );
  process.exit(1);
}

const res = await fetch('http://127.0.0.1:55321/functions/v1/youtube-sync', {
  method: 'POST',
  headers: { Authorization: `Bearer ${key}` },
});
const body = await res.text();
if (!res.ok) {
  console.error(`youtube-sync failed: HTTP ${res.status} ${body}`);
  process.exit(1);
}
console.log(`sermons synced: ${body}`);
