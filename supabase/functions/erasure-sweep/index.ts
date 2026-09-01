// The last half of an account deletion (docs/spec/16 §DELETE, `20`, `21` §5; W4.5 slice 2).
// Cron-invoked every 15 minutes via jobs.invoke_edge_function.
//
// WHY THERE IS A JOB HERE AT ALL, when `erase_profile()` does the rest in one transaction:
// object BYTES live outside Postgres, and nothing that reaches over a network can join a
// transaction. Everything that could be atomic already is, the auth user's address and
// identities included, so what is left is exactly one thing and it is idempotent: delete
// these paths from these buckets.
//
// THE SEAM IS CHOSEN SO THAT FAILING HERE IS SAFE. By the time a row exists in
// `account_erasures` the account is already gone: the profile is stripped, every personal
// row is deleted, the sessions are dead and the address is free. A sweep that fails leaves
// orphaned FILES, which are unreachable anyway (`book-files` and `testimony-photos` are
// private, and the read policies hang off rows that no longer exist), and it will try again
// in fifteen minutes. The opposite seam, doing the storage first, would have meant a member
// whose photos were gone and whose account was not.
//
// NO core.ts, like retention-purge: there is no decision in here to unit-test. What to
// delete was decided inside the erasure transaction, by the routine that could still read
// the rows; this only carries it out.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { isServiceRoleRequest, unauthorized } from '../_shared/auth.ts';
import { optionalEnv, requiredEnv } from '../_shared/env.ts';
import { pingDeadMan } from '../_shared/healthchecks.ts';
import { claimJobLease, releaseJobLease } from '../_shared/jobs.ts';
import { captureEdgeError } from '../_shared/sentry.ts';

const JOB = 'erasure-sweep';

/** Short: the work is a handful of object deletes, and a stuck run should free itself fast. */
const LEASE = '5 minutes';

/**
 * How many erasures one pass finishes. Deliberately small: this is a rare event (a church of
 * this size will see a few a year), so a run that finds more than a handful is either a
 * backlog after an outage or something wrong, and either way the next tick is 15 minutes
 * away and the anti-join means it resumes exactly where it stopped.
 */
const BATCH = 25;

/** After this many failed passes the row is left alone and shouted about instead. */
const MAX_ATTEMPTS = 5;

interface ErasureRow {
  id: string;
  profile_id: string;
  storage_paths: Record<string, string[]> | null;
  attempts: number;
}

Deno.serve(async (req) => {
  if (!(await isServiceRoleRequest(req))) return unauthorized();

  const healthcheckUrl = optionalEnv('HEALTHCHECK_URL_ERASURE_SWEEP');
  try {
    const supabase = createClient(
      requiredEnv('SUPABASE_URL'),
      requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    );

    if (!(await claimJobLease(supabase, JOB, LEASE))) {
      await pingDeadMan(healthcheckUrl, true);
      return Response.json({ skipped: 'lease held' });
    }

    try {
      return await run(supabase, healthcheckUrl);
    } finally {
      await releaseJobLease(supabase, JOB);
    }
  } catch (error) {
    console.error('erasure-sweep failed:', error);
    await captureEdgeError('erasure-sweep', error);
    await pingDeadMan(healthcheckUrl, false);
    return Response.json({ error: 'sweep run failed' }, { status: 500 });
  }
});

async function run(
  supabase: SupabaseClient,
  healthcheckUrl: string | null,
): Promise<Response> {
  const { data, error } = await supabase
    .from('account_erasures')
    .select('id, profile_id, storage_paths, attempts')
    .is('completed_at', null)
    .lt('attempts', MAX_ATTEMPTS)
    .order('requested_at', { ascending: true })
    .limit(BATCH);

  if (error) throw new Error(`erasure read failed: ${error.message}`);

  const rows = (data ?? []) as ErasureRow[];
  let finished = 0;
  let objects = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      objects += await removeObjects(supabase, row);
      const { error: doneError } = await supabase
        .from('account_erasures')
        .update({
          storage_done_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        })
        .eq('id', row.id);
      if (doneError) throw new Error(doneError.message);
      finished += 1;
    } catch (rowError) {
      // One member's files failing must not stop another member's erasure, so the loop
      // records and carries on. The row keeps its place in the queue and the count is what
      // the next pass backs off against.
      failed += 1;
      console.error(`erasure-sweep: ${row.id} failed:`, rowError);
      await supabase
        .from('account_erasures')
        .update({
          attempts: row.attempts + 1,
          last_error: String(rowError).slice(0, 500),
        })
        .eq('id', row.id);
    }
  }

  // An erasure that has failed five times is not going to succeed on the sixth, and it is a
  // GDPR obligation sitting unfinished, so it stops being a retry and becomes a person's
  // problem. Counted separately from this pass's failures, because the whole point is that
  // it is no longer being attempted.
  const { count: stuck } = await supabase
    .from('account_erasures')
    .select('id', { count: 'exact', head: true })
    .is('completed_at', null)
    .gte('attempts', MAX_ATTEMPTS);

  if (stuck && stuck > 0) {
    console.error(
      `erasure-sweep: ${String(stuck)} erasure(s) have failed ${String(MAX_ATTEMPTS)} times ` +
        'and are no longer being retried; their files are still in storage and somebody ' +
        'needs to remove them by hand',
    );
  }

  console.log(
    `erasure-sweep: finished ${String(finished)}, ${String(objects)} object(s) removed, ` +
      `${String(failed)} deferred`,
  );

  // FAILURE when this pass could not finish something it tried, or when anything has given
  // up entirely: ADR 0016's rule read at its word, since "the erasure quietly stopped" is
  // exactly the silence a dead-man check exists to break.
  await pingDeadMan(healthcheckUrl, failed === 0 && !stuck);
  return Response.json({ finished, objects, failed, stuck: stuck ?? 0 });
}

/**
 * Remove every object the erasure recorded, bucket by bucket.
 *
 * Storage's `remove()` is idempotent for our purposes: a path that is already gone is not an
 * error, which is what lets the whole pass be retried without bookkeeping per object. That
 * matters because the alternative, a per-object done-flag, would be a second ledger to keep
 * correct for a job that runs a handful of times a year.
 */
async function removeObjects(
  supabase: SupabaseClient,
  row: ErasureRow,
): Promise<number> {
  const buckets = row.storage_paths ?? {};
  let removed = 0;

  for (const [bucket, paths] of Object.entries(buckets)) {
    // `avatar_url`'s shape is unsettled (nothing writes it yet and its name predates the
    // rule that a row holds a PATH), so a value that is plainly a URL is skipped rather
    // than guessed at: deleting the wrong object is worse than leaving one behind, and the
    // column is renamed the day an uploader is built.
    const usable = paths.filter((path) => path.length > 0 && !path.includes('://'));
    if (usable.length === 0) continue;

    const { error } = await supabase.storage.from(bucket).remove(usable);
    if (error) throw new Error(`${bucket}: ${error.message}`);
    removed += usable.length;
  }

  return removed;
}
