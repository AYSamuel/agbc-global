// Activity notices (docs/spec/09 §Notifications, `15`, `21` §5; W3.6 slice 2). Cron-invoked
// every minute via jobs.invoke_edge_function.
//
// The three notifications a member earns from their own posts: someone prayed for a request,
// Glory collapsed per testimony per hour, and a leader's decision. Until this slice every
// piece of all three existed except a caller, so two of the five switches on NOTIF-PREFS
// gated nothing at all (see the migration header for the full account).
//
// Same order and the same reasoning as every job before it: lease, read, act, record,
// release. What is particular to this one:
//   * the window and the settle are decided in SQL, and the clock is an argument, so a late
//     tick behaves like an on-time one (20260829120000);
//   * an empty batch is a SUCCESS, because most of the 1440 ticks in a day have nothing to
//     do and a dead-man check must measure "the job is running", not "this tick had work";
//   * a push that could not be delivered pings FAILURE even though the notification rows
//     were written, because notification-centre-only is a degradation and we should hear
//     about it. That degradation is exactly what `15` already promises a member whose push
//     is off, which is why it is a degradation rather than a loss.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { isServiceRoleRequest, unauthorized } from '../_shared/auth.ts';
import { optionalEnv, requiredEnv } from '../_shared/env.ts';
import { pingDeadMan } from '../_shared/healthchecks.ts';
import { claimJobLease, releaseJobLease } from '../_shared/jobs.ts';
import { deliverNotifications, pushSenderFromEnv } from '../_shared/notify.ts';
import { captureEdgeError } from '../_shared/sentry.ts';
import { buildEntries, type ActivityDueRow } from './core.ts';

const JOB = 'activity-notices';

/**
 * Longer than the minute between ticks, matching `event-notices` and `broadcast-fanout`.
 * The lease is given back when the run ends either way; this is only the net under a run
 * that died holding it (ADR 0016). A tick that finds the lease held pings SUCCESS and
 * leaves: the job IS running, which is what the dead-man check is measuring.
 */
const LEASE = '10 minutes';

Deno.serve(async (req) => {
  if (!(await isServiceRoleRequest(req))) return unauthorized();

  const healthcheckUrl = optionalEnv('HEALTHCHECK_URL_ACTIVITY_NOTICES');
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
    console.error('activity-notices failed:', error);
    await captureEdgeError('activity-notices', error);
    await pingDeadMan(healthcheckUrl, false);
    return Response.json({ error: 'activity notice run failed' }, { status: 500 });
  }
});

async function run(
  supabase: SupabaseClient,
  healthcheckUrl: string | null,
): Promise<Response> {
  // No arguments: the defaults (now(), a 15-minute settle, a 7-day lookback) are the
  // production values and live in one place, on the function. pgTAP drives the other
  // clocks.
  const { data, error } = await supabase.rpc('activity_notice_batch');
  if (error) throw new Error(`batch failed: ${error.message}`);

  const due = (data ?? []) as ActivityDueRow[];
  if (due.length === 0) {
    await pingDeadMan(healthcheckUrl, true);
    return Response.json({ due: 0, created: 0 });
  }

  const outcome = await deliverNotifications(
    supabase,
    buildEntries(due),
    pushSenderFromEnv(),
  );

  await pingDeadMan(healthcheckUrl, !outcome.pushRejected);
  // Counts, never a member and never a post (docs/spec/20): this log says how much work
  // there was and nothing about whose testimony it was.
  return Response.json({ due: due.length, ...outcome });
}
