// The daily verse-queue monitor (docs/spec/21 §5, `22` §1; W2.7 slice 5, whose Done criteria
// name this job by name). Cron-invoked via jobs.invoke_edge_function.
//
// Same order and the same reasoning as moderation-alerts: lease, read, send, record, release.
// It does not prune the ledger; the hourly job does that for both, so this one has one job.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { isServiceRoleRequest, unauthorized } from '../_shared/auth.ts';
import { resendSender, type EmailSender } from '../_shared/email.ts';
import { optionalEnv, requiredEnv } from '../_shared/env.ts';
import { pingDeadMan } from '../_shared/healthchecks.ts';
import { claimJobLease, releaseJobLease } from '../_shared/jobs.ts';
import { buildVerseAlerts, type DepthRow, type LedgerEntry } from './core.ts';

const JOB = 'verse-monitor';
const LEASE = '10 minutes';

/** `21` §5: alert when fewer than 14 days are queued. Mirrors DEPTH_FLOOR in the dashboard. */
const FLOOR_DAYS = 14;

Deno.serve(async (req) => {
  if (!(await isServiceRoleRequest(req))) return unauthorized();

  const healthcheckUrl = optionalEnv('HEALTHCHECK_URL_VERSE_MONITOR');
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
    console.error('verse-monitor failed:', error);
    await pingDeadMan(healthcheckUrl, false);
    return Response.json({ error: 'monitor run failed' }, { status: 500 });
  }
});

async function run(
  supabase: SupabaseClient,
  healthcheckUrl: string | null,
): Promise<Response> {
  const { data: batch, error: batchError } = await supabase.rpc(
    'verse_alert_batch',
    { floor_days: FLOOR_DAYS },
  );
  if (batchError) throw new Error(`batch failed: ${batchError.message}`);
  const rows = (batch ?? []) as DepthRow[];

  if (rows.length === 0) {
    // The healthy case, and the common one: every language is stocked past the floor.
    await pingDeadMan(healthcheckUrl, true);
    return Response.json({ alerts: 0, recorded: 0 });
  }

  const send = sender();
  if (!send) {
    console.error(
      'verse-monitor: email is not configured; the queue is low and nobody was told',
    );
    await pingDeadMan(healthcheckUrl, false);
    return Response.json({ error: 'email not configured' }, { status: 503 });
  }

  const alerts = buildVerseAlerts(rows, {
    from: requiredEnv('ALERTS_FROM_EMAIL'),
    dashboardUrl: optionalEnv('DASHBOARD_URL'),
  });

  const delivered: LedgerEntry[] = [];
  let failed = 0;
  for (const alert of alerts) {
    try {
      await send(alert.email);
      delivered.push(alert.entry);
    } catch (error) {
      failed += 1;
      console.error(
        `verse-monitor: send failed for recipient ${alert.recipientId}:`,
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

  await pingDeadMan(healthcheckUrl, failed === 0);
  return Response.json({
    alerts: alerts.length,
    languages: rows.length,
    recorded,
    failed,
  });
}

/** Null when this environment has no Resend key yet (docs/spec/24 §1 rows 11-12). */
function sender(): EmailSender | null {
  const apiKey = optionalEnv('RESEND_API_KEY');
  if (!apiKey || !optionalEnv('ALERTS_FROM_EMAIL')) return null;
  const endpoint = optionalEnv('RESEND_API_URL');
  return endpoint ? resendSender(apiKey, endpoint) : resendSender(apiKey);
}
