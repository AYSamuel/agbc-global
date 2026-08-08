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
import { readFileSync } from 'node:fs';

/**
 * `supabase db reset` STOPS the edge runtime and does not bring it back: a
 * following `supabase start` sees a running stack and returns in two seconds
 * without noticing the corpse. Kong then answers every function call with
 * 503 "name resolution failed", which reads like a DNS fault and is really a
 * container that is not there, so the sermon sync silently stopped working and
 * Watch stayed empty on every device (found 2026-08-08, W2.8).
 *
 * Starting a container that is already running is a no-op, so this just runs.
 */
function wakeEdgeRuntime() {
  let projectId = 'agbc-global';
  try {
    projectId =
      /^project_id\s*=\s*"([^"]+)"/m.exec(
        readFileSync('supabase/config.toml', 'utf8'),
      )?.[1] ?? projectId;
  } catch {
    // Not at the repo root: fall through and let the request report the truth.
  }
  try {
    execSync(`docker start supabase_edge_runtime_${projectId}`, {
      stdio: 'ignore',
    });
  } catch {
    // No Docker, a different container name, a stack that is genuinely down:
    // none of those are worth failing on here. The fetch below says what is
    // actually wrong, with the status code attached.
  }
}

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

wakeEdgeRuntime();

// A just-woken runtime needs a moment before Kong can route to it, so a 503 is
// retried rather than reported. Anything else (a 401, a function that threw) is
// an answer, and answers are not worth waiting on.
const ATTEMPTS = 6;
let res;
let body = '';
for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
  res = await fetch('http://127.0.0.1:55321/functions/v1/youtube-sync', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
  });
  body = await res.text();
  if (res.ok || res.status !== 503) break;
  if (attempt < ATTEMPTS) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

if (!res?.ok) {
  console.error(`youtube-sync failed: HTTP ${res?.status ?? '?'} ${body}`);
  process.exit(1);
}
console.log(`sermons synced: ${body}`);
