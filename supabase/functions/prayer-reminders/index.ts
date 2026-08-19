// Prayer commitment reminders (docs/spec/09 §Prayer commitment, `15`, `21` §5; W3.4 slice
// 2). Cron-invoked hourly via jobs.invoke_edge_function.
//
// Same order as its siblings, with one extra step at the end: the cadence has to move on.
// That step runs for EVERY commitment the batch returned rather than for every notification
// created, which is what makes a half-finished run recover. The reasoning is in core.ts and
// in the migration; the short version is that the dedupe key already refuses the second
// send, so advancing twice is safe and advancing never is not.
//
// This job sends the app's most sensitive category and carries none of it: the payload has
// no params at all (core.ts), and nothing here logs a member, a request or an author.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { isServiceRoleRequest, unauthorized } from '../_shared/auth.ts';
import { optionalEnv, requiredEnv } from '../_shared/env.ts';
import { pingDeadMan } from '../_shared/healthchecks.ts';
import { claimJobLease, releaseJobLease } from '../_shared/jobs.ts';
import { deliverNotifications, pushSenderFromEnv } from '../_shared/notify.ts';
import { captureEdgeError } from '../_shared/sentry.ts';
import { advancingIds, buildEntries, type PrayerDueRow } from './core.ts';

const JOB = 'prayer-reminders';

const LEASE = '15 minutes';

Deno.serve(async (req) => {
  if (!(await isServiceRoleRequest(req))) return unauthorized();

  const healthcheckUrl = optionalEnv('HEALTHCHECK_URL_PRAYER_REMINDERS');
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
    console.error('prayer-reminders failed:', error);
    await captureEdgeError('prayer-reminders', error);
    await pingDeadMan(healthcheckUrl, false);
    return Response.json({ error: 'reminder run failed' }, { status: 500 });
  }
});

async function run(
  supabase: SupabaseClient,
  healthcheckUrl: string | null,
): Promise<Response> {
  const { data, error } = await supabase.rpc('prayer_reminder_batch');
  if (error) throw new Error(`batch failed: ${error.message}`);

  const due = (data ?? []) as PrayerDueRow[];
  if (due.length === 0) {
    // The ordinary state of this job: most hours nobody is due, and outside 08:00-21:00
    // local nobody can be.
    await pingDeadMan(healthcheckUrl, true);
    return Response.json({ due: 0, created: 0, advanced: 0 });
  }

  const outcome = await deliverNotifications(
    supabase,
    buildEntries(due),
    pushSenderFromEnv(),
  );

  // After the send, never before (ADR 0016). A crash before this line repeats one rung and
  // is refused by the dedupe key; a crash after it has already delivered.
  const { data: advanced, error: advanceError } = await supabase.rpc(
    'advance_prayer_reminders',
    { ids: advancingIds(due) },
  );
  if (advanceError) throw new Error(`advance failed: ${advanceError.message}`);

  await pingDeadMan(healthcheckUrl, !outcome.pushRejected);
  return Response.json({
    due: due.length,
    ...outcome,
    advanced: (advanced as number | null) ?? 0,
  });
}
