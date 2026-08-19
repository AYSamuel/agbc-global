// Service reminders (docs/spec/15, `21` §5; W3.4 slice 1). Cron-invoked every 15 minutes
// via jobs.invoke_edge_function.
//
// Same order and the same reasoning as moderation-alerts, verse-monitor and push-receipts:
// lease, read, act, record, release. What is different is the stakes. `21` §5 names
// "reminders silently stop" as the canonical failure of its whole job table, and this is
// the job it means: a member who trusted the app to tell them church is starting finds out
// it did not by missing church.
//
// So three things are deliberate here:
//   * the window is decided in SQL, anchored to the tick grid, so a late run scans the same
//     window an on-time run would have (20260819120000);
//   * an empty window is a SUCCESS, because most ticks have nothing to do and a dead-man
//     check must measure "the job is running", not "this tick had work";
//   * a push that could not be delivered pings FAILURE even though the notification rows
//     were written, because NC-only is a degradation and we should hear about it.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { isServiceRoleRequest, unauthorized } from '../_shared/auth.ts';
import { optionalEnv, requiredEnv } from '../_shared/env.ts';
import { pingDeadMan } from '../_shared/healthchecks.ts';
import { claimJobLease, releaseJobLease } from '../_shared/jobs.ts';
import { deliverNotifications, pushSenderFromEnv } from '../_shared/notify.ts';
import { captureEdgeError } from '../_shared/sentry.ts';
import { buildEntries, type ServiceDueRow } from './core.ts';

const JOB = 'service-reminders';

/**
 * Shorter than the 15-minute tick, so a run that dies holding the lease cannot cost more
 * than one window. The lease is given back when the run ends either way; this is only the
 * net (ADR 0016).
 */
const LEASE = '10 minutes';

Deno.serve(async (req) => {
  if (!(await isServiceRoleRequest(req))) return unauthorized();

  const healthcheckUrl = optionalEnv('HEALTHCHECK_URL_SERVICE_REMINDERS');
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
    console.error('service-reminders failed:', error);
    await captureEdgeError('service-reminders', error);
    await pingDeadMan(healthcheckUrl, false);
    return Response.json({ error: 'reminder run failed' }, { status: 500 });
  }
});

async function run(
  supabase: SupabaseClient,
  healthcheckUrl: string | null,
): Promise<Response> {
  const { data, error } = await supabase.rpc('service_reminder_batch');
  if (error) throw new Error(`batch failed: ${error.message}`);

  const due = (data ?? []) as ServiceDueRow[];
  if (due.length === 0) {
    // The common case: most of the 96 ticks in a day have no service an hour away.
    await pingDeadMan(healthcheckUrl, true);
    return Response.json({ due: 0, created: 0 });
  }

  const outcome = await deliverNotifications(
    supabase,
    buildEntries(due),
    pushSenderFromEnv(),
  );

  await pingDeadMan(healthcheckUrl, !outcome.pushRejected);
  // Counts, never a member (docs/spec/20): this log says how much work there was and
  // nothing about whose Sunday it is.
  return Response.json({ due: due.length, ...outcome });
}
