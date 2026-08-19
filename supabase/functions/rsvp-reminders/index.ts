// Event RSVP reminders (docs/spec/11, `15`, `21` §5; W3.4 slice 2). Cron-invoked hourly via
// jobs.invoke_edge_function.
//
// Same order as its siblings: lease, read, act, record, release. `21` §5 puts the blast
// radius plainly, and it is a promise rather than a nicety: "promised reminders (`11`) never
// fire". A member who taps Going has been told the app will remind them.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { isServiceRoleRequest, unauthorized } from '../_shared/auth.ts';
import { optionalEnv, requiredEnv } from '../_shared/env.ts';
import { pingDeadMan } from '../_shared/healthchecks.ts';
import { claimJobLease, releaseJobLease } from '../_shared/jobs.ts';
import { deliverNotifications, pushSenderFromEnv } from '../_shared/notify.ts';
import { captureEdgeError } from '../_shared/sentry.ts';
import { buildEntries, type RsvpDueRow } from './core.ts';

const JOB = 'rsvp-reminders';

/** Well inside the hourly tick, so a run that dies costs at most one window. */
const LEASE = '15 minutes';

Deno.serve(async (req) => {
  if (!(await isServiceRoleRequest(req))) return unauthorized();

  const healthcheckUrl = optionalEnv('HEALTHCHECK_URL_RSVP_REMINDERS');
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
    console.error('rsvp-reminders failed:', error);
    await captureEdgeError('rsvp-reminders', error);
    await pingDeadMan(healthcheckUrl, false);
    return Response.json({ error: 'reminder run failed' }, { status: 500 });
  }
});

async function run(
  supabase: SupabaseClient,
  healthcheckUrl: string | null,
): Promise<Response> {
  const { data, error } = await supabase.rpc('rsvp_reminder_batch');
  if (error) throw new Error(`batch failed: ${error.message}`);

  const due = (data ?? []) as RsvpDueRow[];
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
  // Counts, never a member and never an event title (docs/spec/20).
  return Response.json({ due: due.length, ...outcome });
}
