// The lease dance every scheduled job does (docs/spec/21 §5, ADR 0016): take it, do the work,
// give it back. Shared rather than copied because W3.4 adds five more jobs to this pattern,
// and a job that forgets the release is a job that refuses its own next run.

import type { SupabaseClient } from '@supabase/supabase-js';

/** False when another instance is already doing this work. */
export async function claimJobLease(
  supabase: SupabaseClient,
  job: string,
  lease: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('claim_job_lease', {
    job_name: job,
    lease,
  });
  if (error) throw new Error(`lease failed: ${error.message}`);
  return data === true;
}

/**
 * Never throws. A failed release costs at most one skipped tick (the lease expires on its
 * own), and turning that into a job failure would replace a small problem with a louder one
 * in the path that runs when something has ALREADY gone wrong.
 */
export async function releaseJobLease(
  supabase: SupabaseClient,
  job: string,
): Promise<void> {
  const { error } = await supabase.rpc('release_job_lease', { job_name: job });
  if (error) console.error(`${job}: lease release failed: ${error.message}`);
}
