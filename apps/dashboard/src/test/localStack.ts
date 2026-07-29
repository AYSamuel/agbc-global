import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * Connection details for the LOCAL Supabase stack, for tests that need real tokens.
 *
 * Read from the environment when it is already populated (CI exports them once for the
 * whole job), otherwise asked of the Supabase CLI. Nothing is committed: local keys are
 * regenerated per machine, and hard-coding them would rot the moment one did.
 */
export interface LocalStack {
  url: string;
  /** Publishable key: the one a browser would carry. RLS is the boundary. */
  publishableKey: string;
  /** Secret key: service-role. Tests use it ONLY to mint and clean up users. */
  secretKey: string;
}

let cached: LocalStack | undefined;

export function localStack(): LocalStack {
  cached ??= fromEnvironment() ?? fromCli();
  return cached;
}

function fromEnvironment(): LocalStack | undefined {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !publishableKey || !secretKey) return undefined;
  return { url, publishableKey, secretKey };
}

function fromCli(): LocalStack {
  let raw: string;
  try {
    // Through a shell, and not execFileSync: on Windows the CLI is installed through
    // npm, so `supabase` on PATH is a .cmd/.ps1 shim rather than an executable and a
    // direct spawn fails with ENOENT. The command is a fixed literal with nothing
    // interpolated into it.
    raw = execSync('supabase status -o env', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      // Run from the repo root, where supabase/config.toml lives.
      cwd: fileURLToPath(new URL('../../../..', import.meta.url)),
    });
  } catch {
    // Deliberately loud. A skipped test here would quietly turn "a leader cannot touch
    // another branch, proven by tests" back into an assertion with no mechanism.
    throw new Error(
      'These tests run against the local Supabase stack, and it is not reachable.\n' +
        'Start it with `supabase start` from the repo root, or export ' +
        'NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_KEY and SUPABASE_SECRET_KEY.',
    );
  }

  const values = new Map<string, string>();
  for (const line of raw.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)="(.*)"$/.exec(line.trim());
    if (match) values.set(match[1], match[2]);
  }

  const url = values.get('API_URL');
  const publishableKey = values.get('PUBLISHABLE_KEY');
  const secretKey = values.get('SECRET_KEY');
  if (!url || !publishableKey || !secretKey) {
    throw new Error(
      '`supabase status -o env` did not report API_URL, PUBLISHABLE_KEY and SECRET_KEY. ' +
        'Is the stack running (`supabase start`)?',
    );
  }

  return { url, publishableKey, secretKey };
}
