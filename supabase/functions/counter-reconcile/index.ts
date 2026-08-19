// The nightly counter reconciliation (docs/spec/02, `21` §5; W3.4 slice 3). Cron-invoked
// via jobs.invoke_edge_function.
//
// NO core.ts, deliberately, and for exactly the reason streak-recompute gives: this
// function makes no decisions. What to recount is `reconcile_content_counters()`, whose
// arithmetic and idempotence are asserted in pgTAP `042`, where the maths actually lives. A
// core module here would exist only to be tested, and a test that proves a number was
// passed through is the kind of coverage the QA standard warns about.
//
// The one judgement in the file is the log line: a night that corrects nothing is the
// healthy answer and says so quietly, while a night that corrects something is worth a
// louder line, because `02` names account-deletion cascades as the known drift source and a
// standing non-zero count means something else is wrong.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { isServiceRoleRequest, unauthorized } from '../_shared/auth.ts';
import { optionalEnv, requiredEnv } from '../_shared/env.ts';
import { pingDeadMan } from '../_shared/healthchecks.ts';
import { claimJobLease, releaseJobLease } from '../_shared/jobs.ts';
import { captureEdgeError } from '../_shared/sentry.ts';

const JOB = 'counter-reconcile';

/** Generous: this walks every testimony and every prayer, and it runs once a night. */
const LEASE = '30 minutes';

interface MetricRow {
  metric: string;
  corrected: number;
}

Deno.serve(async (req) => {
  if (!(await isServiceRoleRequest(req))) return unauthorized();

  const healthcheckUrl = optionalEnv('HEALTHCHECK_URL_COUNTER_RECONCILE');
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
    console.error('counter-reconcile failed:', error);
    await captureEdgeError('counter-reconcile', error);
    await pingDeadMan(healthcheckUrl, false);
    return Response.json({ error: 'reconcile run failed' }, { status: 500 });
  }
});

async function run(
  supabase: SupabaseClient,
  healthcheckUrl: string | null,
): Promise<Response> {
  const { data, error } = await supabase.rpc('reconcile_content_counters');
  if (error) throw new Error(`reconcile failed: ${error.message}`);

  const metrics = (data ?? []) as MetricRow[];
  const corrected = metrics.reduce((total, row) => total + Number(row.corrected), 0);

  if (corrected > 0) {
    // Counts of ROWS, never which rows and never whose (docs/spec/20). Loud because a
    // recurring non-zero here means a write path is losing count somewhere.
    console.error(
      `counter-reconcile: corrected ${corrected} rows ` +
        `(${metrics.map((m) => `${m.metric}=${m.corrected}`).join(', ')})`,
    );
  }

  await pingDeadMan(healthcheckUrl, true);
  return Response.json({ corrected, metrics });
}
