// The lease dance every scheduled job does (docs/spec/21 §5, ADR 0016): take it, do the work,
// give it back. Shared rather than copied because W3.4 adds five more jobs to this pattern,
// and a job that forgets the release is a job that refuses its own next run.

import type { SupabaseClient } from '@supabase/supabase-js';

import { retryTransient } from './retry.ts';

/**
 * False when another instance is already doing this work.
 *
 * Both calls here ride `retryTransient` (2026-09-08: five of that day's seventeen gateway
 * timeouts landed on this very upsert). The claim is safe to repeat because it is keyed on
 * the job: if the gateway dropped an answer that Postgres had already committed, the retry
 * finds the lease held by this run and reports false, the job says "lease held" and pings
 * success, and one tick is skipped rather than doubled.
 */
export async function claimJobLease(
  supabase: SupabaseClient,
  job: string,
  lease: string,
): Promise<boolean> {
  const { data, error } = await retryTransient(
    () => supabase.rpc('claim_job_lease', { job_name: job, lease }),
    { label: `${job}: lease claim` },
  );
  if (error) throw new Error(`lease failed: ${error.message}`);
  return data === true;
}

/**
 * Never throws. A failed release costs skipped ticks until the lease expires on its own
 * (up to ten of them for a per-minute job with a ten-minute lease, which is why the release
 * is retried too), and turning that into a job failure would replace a small problem with a
 * louder one in the path that runs when something has ALREADY gone wrong.
 */
export async function releaseJobLease(
  supabase: SupabaseClient,
  job: string,
): Promise<void> {
  const { error } = await retryTransient(
    () => supabase.rpc('release_job_lease', { job_name: job }),
    { label: `${job}: lease release` },
  );
  if (error) console.error(`${job}: lease release failed: ${error.message}`);
}
