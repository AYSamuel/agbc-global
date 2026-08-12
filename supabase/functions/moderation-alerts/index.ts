// The hourly moderation digest and the 48h escalation (docs/spec/09 §Freshness safeguard,
// `17` §1, `21` §5; W2.7 slice 5). Cron-invoked via jobs.invoke_edge_function.
//
// The database decides WHO and WHAT (moderation_alert_batch); this decides nothing except
// how to say it and in what order to do things. Thin handler, decisions in core.ts.
//
// ORDER MATTERS, and it is: lease, prune, read, send, record, release.
//   * lease   so an overrunning run and the next tick cannot both mail the same leader.
//   * prune   before the read, so a post that was approved and then edited back into the
//             queue is announced again rather than silenced by last week's ledger row.
//   * record  AFTER the send, never before. At-least-once is the right failure mode here: a
//             duplicate nudge is a nuisance, a swallowed safeguarding report is not.
//
// NO RETRIES, deliberately. The next tick is the retry, and because the work is derived from
// the queue rather than from a queue of its own, a failed run costs an hour and nothing else.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { isServiceRoleRequest, unauthorized } from '../_shared/auth.ts';
import { resendSender, type EmailSender } from '../_shared/email.ts';
import { optionalEnv, requiredEnv } from '../_shared/env.ts';
import { pingDeadMan } from '../_shared/healthchecks.ts';
import { claimJobLease, releaseJobLease } from '../_shared/jobs.ts';
import { captureEdgeError } from '../_shared/sentry.ts';
import { buildDigests, type AlertRow, type LedgerEntry } from './core.ts';

const JOB = 'moderation-alerts';

/** The crash net only: a finished run gives the lease back immediately. */
const LEASE = '15 minutes';

Deno.serve(async (req) => {
  if (!(await isServiceRoleRequest(req))) return unauthorized();

  const healthcheckUrl = optionalEnv('HEALTHCHECK_URL_MODERATION_ALERTS');
  try {
    const supabase = createClient(
      requiredEnv('SUPABASE_URL'),
      requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    );

    if (!(await claimJobLease(supabase, JOB, LEASE))) {
      // Not a failure: another instance is doing exactly this work right now.
      await pingDeadMan(healthcheckUrl, true);
      return Response.json({ skipped: 'lease held' });
    }

    try {
      return await run(supabase, healthcheckUrl);
    } finally {
      await releaseJobLease(supabase, JOB);
    }
  } catch (error) {
    console.error('moderation-alerts failed:', error);
    await captureEdgeError('moderation-alerts', error);
    await pingDeadMan(healthcheckUrl, false);
    // Generic outward error; detail stays in the function logs, which carry no addresses.
    return Response.json({ error: 'alert run failed' }, { status: 500 });
  }
});

async function run(
  supabase: SupabaseClient,
  healthcheckUrl: string | null,
): Promise<Response> {
  const { error: pruneError } = await supabase.rpc('prune_job_alerts');
  if (pruneError) throw new Error(`prune failed: ${pruneError.message}`);

  const { data: batch, error: batchError } = await supabase.rpc(
    'moderation_alert_batch',
  );
  if (batchError) throw new Error(`batch failed: ${batchError.message}`);
  const rows = (batch ?? []) as AlertRow[];

  // Escalation needs somewhere to escalate TO. With no admin account there is no such place,
  // and the batch cannot say so because it would simply return no rows: exactly the silence
  // this whole slice exists to prevent, so it is checked and it fails the run.
  const { count: admins, error: adminError } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'admin')
    .is('deleted_at', null);
  if (adminError) throw new Error(`admin count failed: ${adminError.message}`);
  const hasAdmin = (admins ?? 0) > 0;
  if (!hasAdmin) {
    console.error(
      'moderation-alerts: no live admin account exists, so nothing can escalate',
    );
  }

  if (rows.length === 0) {
    await pingDeadMan(healthcheckUrl, hasAdmin);
    return Response.json({ digests: 0, alerts: 0, recorded: 0, admins });
  }

  const send = sender();
  if (!send) {
    // Undeliverable notifications must never look like quiet success: `21` §5 names
    // "reminders silently stop" as the canonical failure of this whole family of jobs.
    console.error(
      'moderation-alerts: email is not configured; nothing was sent or recorded',
    );
    await pingDeadMan(healthcheckUrl, false);
    return Response.json({ error: 'email not configured' }, { status: 503 });
  }

  const digests = buildDigests(rows, {
    from: requiredEnv('ALERTS_FROM_EMAIL'),
    dashboardUrl: optionalEnv('DASHBOARD_URL'),
    now: new Date(),
  });

  const delivered: LedgerEntry[] = [];
  let failed = 0;
  for (const digest of digests) {
    try {
      await send(digest.email);
      delivered.push(...digest.entries);
    } catch (error) {
      // Per recipient: one leader's bounced address must not cost the others their digest,
      // and must not mark their alerts as said. Never the address itself.
      failed += 1;
      console.error(
        `moderation-alerts: send failed for recipient ${digest.recipientId}:`,
        error instanceof Error ? error.message : 'unknown',
      );
    }
  }

  let recorded = 0;
  if (delivered.length > 0) {
    const { data, error } = await supabase.rpc('record_job_alerts', {
      alerts: delivered,
    });
    if (error) throw new Error(`record failed: ${error.message}`);
    recorded = (data as number | null) ?? 0;
  }

  await pingDeadMan(healthcheckUrl, failed === 0 && hasAdmin);
  return Response.json({
    digests: digests.length,
    alerts: rows.length,
    recorded,
    failed,
    admins,
  });
}

/** Null when this environment has no Resend key yet (docs/spec/24 §1 rows 11-12). */
function sender(): EmailSender | null {
  const apiKey = optionalEnv('RESEND_API_KEY');
  if (!apiKey || !optionalEnv('ALERTS_FROM_EMAIL')) return null;
  const endpoint = optionalEnv('RESEND_API_URL');
  return endpoint ? resendSender(apiKey, endpoint) : resendSender(apiKey);
}
