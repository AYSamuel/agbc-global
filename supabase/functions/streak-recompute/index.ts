// The weekly streak safety net (docs/spec/21 §5, `02` recompute spec; W2.8). Cron-invoked
// via jobs.invoke_edge_function, Monday morning after the weekend's services have landed.
//
// The on-write trigger is the primary path and gets it right for every ordinary tap, including
// a late offline replay (the recompute is total, so a bridging row retro-corrects). This exists
// for what a trigger cannot see: a restored backup, a repaired row, attendance removed by the
// deletion job. It is idempotent by construction, because it recomputes from immutable rows.
//
// NO core.ts, and that is deliberate rather than an omission. Every other function in this repo
// splits its decisions into a tested pure module; this one makes no decisions. What to compute
// is `recompute_all_streaks()`, whose behaviour and idempotence are asserted in pgTAP `030`,
// where the maths actually lives. A core module here would exist only to be tested, and a test
// that proves a number was passed through is the kind of coverage the QA standard warns about.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { isServiceRoleRequest, unauthorized } from '../_shared/auth.ts';
import { optionalEnv, requiredEnv } from '../_shared/env.ts';
import { pingDeadMan } from '../_shared/healthchecks.ts';
import { claimJobLease, releaseJobLease } from '../_shared/jobs.ts';
import { captureEdgeError } from '../_shared/sentry.ts';

const JOB = 'streak-recompute';

/** Generous: this walks every member with attendance, and it runs once a week. */
const LEASE = '30 minutes';

Deno.serve(async (req) => {
  if (!(await isServiceRoleRequest(req))) return unauthorized();

  const healthcheckUrl = optionalEnv('HEALTHCHECK_URL_STREAK_RECOMPUTE');
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
    console.error('streak-recompute failed:', error);
    await captureEdgeError('streak-recompute', error);
    await pingDeadMan(healthcheckUrl, false);
    return Response.json({ error: 'recompute run failed' }, { status: 500 });
  }
});

async function run(
  supabase: SupabaseClient,
  healthcheckUrl: string | null,
): Promise<Response> {
  const { data, error } = await supabase.rpc('recompute_all_streaks');
  if (error) throw new Error(`recompute failed: ${error.message}`);

  await pingDeadMan(healthcheckUrl, true);
  // A count, never a member: this job's logs say how much work there was and nothing about
  // whose rhythm it was (docs/spec/20).
  return Response.json({ members: (data as number | null) ?? 0 });
}
