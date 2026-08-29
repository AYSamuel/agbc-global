// Every function directory must have a `[functions.<slug>]` block in supabase/config.toml.
//
// WHY THIS TEST EXISTS. W3.6 slice 2 added `activity-notices` and no config block, and the
// job then fired every minute into nothing for an hour: pg_cron invoked it, pg_net recorded
// `404 Function not found` 49 times, `cron.job_run_details` said "succeeded" because the
// POST itself worked, and not one notification was written. Nothing in the suite noticed,
// because every layer was individually green.
//
// The two environments fail differently and both fail silently, which is the point:
//   * LOCALLY the edge runtime does not serve a function it has no block for, so the call
//     404s;
//   * HOSTED, the missing block means `verify_jwt` defaults to true, and since ADR 0024 the
//     project runs on `sb_secret_`/`sb_publishable_` keys that are not JWTs at all, so the
//     platform gate refuses the call before the function runs.
// Either way the job is a no-op and the only symptom is an absence, which is exactly the
// "reminders silently stop" failure `21` §5 names at the top of its own job table.
//
// This is the cheapest possible guard on it: the directory listing and the config file are
// both right here, and a new function now has to be declared on purpose.

import { assertEquals } from 'jsr:@std/assert@1';

const FUNCTIONS_DIR = new URL('../', import.meta.url);
const CONFIG = new URL('../../config.toml', import.meta.url);

/** Directories that are not deployable functions. */
const NOT_A_FUNCTION = new Set(['_shared']);

async function functionSlugs(): Promise<string[]> {
  const slugs: string[] = [];
  for await (const entry of Deno.readDir(FUNCTIONS_DIR)) {
    if (entry.isDirectory && !NOT_A_FUNCTION.has(entry.name)) slugs.push(entry.name);
  }
  return slugs.sort();
}

Deno.test('every function directory is declared in config.toml', async () => {
  const config = await Deno.readTextFile(CONFIG);
  const missing = (await functionSlugs()).filter(
    (slug) => !config.includes(`[functions.${slug}]`),
  );

  assertEquals(
    missing,
    [],
    `no [functions.<slug>] block for: ${missing.join(', ')}. Locally the edge runtime ` +
      `will answer 404 and hosted the platform gate will refuse the call, in both cases ` +
      `silently (see this file's header).`,
  );
});

Deno.test('and every declared block still has a directory behind it', async () => {
  const config = await Deno.readTextFile(CONFIG);
  const declared = [...config.matchAll(/^\[functions\.([a-z0-9-]+)\]/gm)].map((m) => m[1]);
  const slugs = new Set(await functionSlugs());

  // The other direction, which goes wrong when a function is deleted rather than added:
  // ADR 0021 removed `live-detection` and left its healthcheck behind in `21` §6.2 for two
  // weeks. A block with no directory is the same shape of leftover.
  assertEquals(
    declared.filter((slug) => !slugs.has(slug)),
    [],
    'config.toml declares a function that no longer exists',
  );
});
