// The monthly retention purge (docs/spec/20 retention schedule, `21` §5; W3.4 slice 3).
// Cron-invoked on the 1st via jobs.invoke_edge_function.
//
// NO core.ts, same as counter-reconcile and streak-recompute: the decisions are the
// retention periods, and those live in `run_retention_purges()` with pgTAP `042` over them,
// because a period is a promise made in `20` and belongs where it can be asserted rather
// than in TypeScript that runs once a month.
//
// This is the only job in the project that DELETES member data, so two habits from the rest
// of the family are worth restating here. It takes a lease like everything else, which
// matters more than usual: two overlapping runs deleting the same rows is harmless, but two
// overlapping runs is also how a monthly job becomes an unnoticed hourly one. And it says
// what it removed, in counts only, because "GDPR retention drift" is the failure `21` §5
// names and the evidence that it is not happening is a number in a log.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { isServiceRoleRequest, unauthorized } from '../_shared/auth.ts';
import { optionalEnv, requiredEnv } from '../_shared/env.ts';
import { pingDeadMan } from '../_shared/healthchecks.ts';
import { claimJobLease, releaseJobLease } from '../_shared/jobs.ts';
import { captureEdgeError } from '../_shared/sentry.ts';

const JOB = 'retention-purge';

/** Generous: a purge that has been missed for months has a year of rows to walk. */
const LEASE = '30 minutes';

interface PurgeRow {
  item: string;
  removed: number;
  kept: number;
}

Deno.serve(async (req) => {
  if (!(await isServiceRoleRequest(req))) return unauthorized();

  const healthcheckUrl = optionalEnv('HEALTHCHECK_URL_RETENTION_PURGE');
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
    console.error('retention-purge failed:', error);
    await captureEdgeError('retention-purge', error);
    await pingDeadMan(healthcheckUrl, false);
    return Response.json({ error: 'purge run failed' }, { status: 500 });
  }
});

async function run(
  supabase: SupabaseClient,
  healthcheckUrl: string | null,
): Promise<Response> {
  const { data, error } = await supabase.rpc('run_retention_purges');
  if (error) throw new Error(`purge failed: ${error.message}`);

  const items = (data ?? []) as PurgeRow[];
  const removed = items.reduce((total, row) => total + Number(row.removed), 0);
  const kept = items.reduce((total, row) => total + Number(row.kept), 0);

  console.log(
    `retention-purge: removed ${removed} rows ` +
      `(${items.map((i) => `${i.item}=${i.removed}`).join(', ')})`,
  );

  if (kept > 0) {
    // The one thing this job refuses to delete. An open report past its 24-month window is
    // a moderation task nobody closed, and it must reach a person rather than a statement
    // (see the migration header, and `20`'s safeguarding-evidence row).
    console.error(
      `retention-purge: ${kept} report(s) are past their retention window and still OPEN; ` +
        'they were kept, and somebody needs to action or resolve them',
    );
  }

  await pingDeadMan(healthcheckUrl, true);
  return Response.json({ removed, kept, items });
}
