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

// ---------------------------------------------------------------------------

// Every function that takes a job LEASE must also have a cron SCHEDULE.
//
// WHY THIS TEST EXISTS, and it is the same lesson as the one above wearing new
// clothes. `youtube-sync` shipped at W1.3, was deployed, had its config block,
// passed the test above on every push, called itself the "Nightly YouTube sync"
// in its own header and cited `21` §5. Nothing ever invoked it. `grep
// cron.schedule` over the migrations returned thirteen jobs and not that one, and
// production proved it: all 100 sermon rows were written in the same minute on
// 2026-08-19, sixteen days before anyone noticed, so every message the church
// published in between was invisible on the tab a member opens second.
//
// The guard above checks that a function CAN be reached. This one checks that
// something actually reaches it, which is the half that was missing.
//
// THE LEASE IS THE SIGNAL, deliberately, rather than a hand-kept list. A function
// that claims a job lease is by definition one that expects to be invoked
// repeatedly and unattended (ADR 0016), so importing `_shared/jobs.ts` is the
// function declaring its own nature. A list would have to be remembered; this
// cannot be forgotten without also removing the lease.
//
// It reads the migrations rather than `cron.job`, because it must hold on a
// laptop with no database and in CI before any stack is up.

const MIGRATIONS = new URL('../../migrations/', import.meta.url);

/**
 * Every migration's SQL with `--` comments stripped.
 *
 * The comments have to go, and finding that out cost a mutation. The first
 * version of this test searched the raw text for the quoted slug, then deleted
 * the `cron.schedule` call to check the guard bit, and watched it stay green:
 * this migration's own header and its rollback note both name `'youtube-sync'`,
 * so the slug was still "found". A guard a comment can satisfy is not a guard,
 * which is the same failure it was written to catch.
 */
async function migrationsSql(): Promise<string> {
  const parts: string[] = [];
  for await (const entry of Deno.readDir(MIGRATIONS)) {
    if (entry.isFile && entry.name.endsWith('.sql')) {
      const text = await Deno.readTextFile(new URL(entry.name, MIGRATIONS));
      parts.push(
        text
          .split('\n')
          .map((line) => line.replace(/--.*$/, ''))
          .join('\n'),
      );
    }
  }
  return parts.join('\n');
}

/**
 * A real registration: `cron.schedule(` followed by the quoted job name, across
 * the line break the house style puts between them. `cron.unschedule(` cannot
 * match, because the pattern requires the `.` immediately before `schedule`.
 */
function isScheduled(sql: string, slug: string): boolean {
  const escaped = slug.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`cron\\.schedule\\(\\s*'${escaped}'`).test(sql);
}

Deno.test('every function that takes a lease is scheduled by a migration', async () => {
  const sql = await migrationsSql();
  const unscheduled: string[] = [];

  for (const slug of await functionSlugs()) {
    let source: string;
    try {
      source = await Deno.readTextFile(
        new URL(`../${slug}/index.ts`, import.meta.url),
      );
    } catch {
      continue; // no handler: not a deployable job
    }
    if (!source.includes('_shared/jobs.ts')) continue;
    // The schedule is registered by name, and the name is the slug.
    if (!isScheduled(sql, slug)) unscheduled.push(slug);
  }

  assertEquals(
    unscheduled,
    [],
    `these functions take a job lease but no migration schedules them: ${unscheduled.join(', ')}. A job nothing calls is a job that fails by being silent (see youtube-sync, W4.8).`,
  );
});
