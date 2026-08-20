// The push receipts sweep (docs/spec/15, `21` §5; W3.3 slice 3). Cron-invoked every 15
// minutes via jobs.invoke_edge_function.
//
// Same order and the same reasoning as moderation-alerts and verse-monitor: lease, read,
// act, record, release. What is different is WHY it exists. Expo push is two-phase, and
// `DeviceNotRegistered` arrives in the receipt rather than at send time, so without this
// job dead tokens accumulate forever and Expo eventually throttles a sender that ignores
// receipts. `15` calls it a launch requirement rather than an optimisation, and that is
// the right reading.
//
// Receipts are cleared by Expo after ~24 hours, so this job is also a deadline: tickets it
// never gets to are unanswerable, and the 7-day retention purge (W3.4) removes them.
//
// IT SWEEPS BOTH LEDGERS (20260820140000). `21` §5 always said so; only `push_tickets` was
// ever built, because `broadcast_deliveries` did not exist when this was written. Until
// then a member whose only pushes were broadcasts never had a dead token pruned, and the
// error-rate alarm could not see the largest sends this project makes.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { isServiceRoleRequest, unauthorized } from '../_shared/auth.ts';
import { resendSender, type EmailSender } from '../_shared/email.ts';
import { optionalEnv, requiredEnv } from '../_shared/env.ts';
import { pingDeadMan } from '../_shared/healthchecks.ts';
import { claimJobLease, releaseJobLease } from '../_shared/jobs.ts';
import { expoReceiptFetcher, type ReceiptFetcher } from '../_shared/push.ts';
import { captureEdgeError } from '../_shared/sentry.ts';
import {
  buildRateAlert,
  planSweep,
  shouldAlarm,
  type RateAlarm,
  type TicketRow,
} from './core.ts';

const JOB = 'push-receipts';
const LEASE = '10 minutes';

/**
 * One tick's bite. Expo accepts 1000 ticket ids per receipts request, and taking exactly
 * one request's worth keeps a backlog draining steadily across ticks instead of making one
 * run unbounded. A backlog bigger than this drains at 4000/hour, well above anything this
 * church will generate.
 */
const BATCH = 1000;

Deno.serve(async (req) => {
  if (!(await isServiceRoleRequest(req))) return unauthorized();

  const healthcheckUrl = optionalEnv('HEALTHCHECK_URL_PUSH_RECEIPTS');
  try {
    const supabase = createClient(
      requiredEnv('SUPABASE_URL'),
      requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    );

    if (!(await claimJobLease(supabase, JOB, LEASE))) {
      // Another instance is mid-sweep. Not a failure: ping success so the dead-man check
      // measures "the job is running", not "this tick did work".
      await pingDeadMan(healthcheckUrl, true);
      return Response.json({ skipped: 'lease held' });
    }

    try {
      return await run(supabase, healthcheckUrl);
    } finally {
      await releaseJobLease(supabase, JOB);
    }
  } catch (error) {
    console.error('push-receipts failed:', error);
    await captureEdgeError('push-receipts', error);
    await pingDeadMan(healthcheckUrl, false);
    return Response.json({ error: 'receipts sweep failed' }, { status: 500 });
  }
});

async function run(
  supabase: SupabaseClient,
  healthcheckUrl: string | null,
): Promise<Response> {
  // ONE read across both ledgers (20260820140000). Two client reads would each take their
  // own thousand, which is more than Expo accepts in a request and would let one table
  // starve while the other drained.
  const { data: ticketRows, error: ticketsError } = await supabase.rpc(
    'unprocessed_push_tickets',
    { batch: BATCH },
  );
  if (ticketsError) throw new Error(`tickets read failed: ${ticketsError.message}`);

  const tickets = (ticketRows ?? []) as TicketRow[];

  // Nothing outstanding is the healthy steady state, not an idle failure.
  if (tickets.length === 0) {
    await pingDeadMan(healthcheckUrl, true);
    return Response.json({ tickets: 0, processed: 0, pruned: 0 });
  }

  const receipts = await fetchReceipts()(tickets.map((t) => t.ticket_id));
  const plan = planSweep(tickets, receipts);

  // Prune first, then stamp. If the run dies between the two, the tickets stay
  // unprocessed and the next tick deletes an already-deleted device, which is a no-op.
  // The other order would mark tickets answered while their dead tokens survived, and
  // nothing would ever look at them again.
  let pruned = 0;
  if (plan.deadDevices.length > 0) {
    const { error, count } = await supabase
      .from('devices')
      .delete({ count: 'exact' })
      .in('id', plan.deadDevices);
    if (error) throw new Error(`device prune failed: ${error.message}`);
    pruned = count ?? 0;
  }

  // Each answer goes back to the ledger it came from. Split here rather than in the plan,
  // so `planSweep` stays a pure decision and this stays the only place that knows about
  // tables.
  let processed = 0;
  const automated = plan.processed.filter((row) => row.source === 'ticket');
  const broadcast = plan.processed.filter((row) => row.source === 'broadcast');

  if (automated.length > 0) {
    const { data, error } = await supabase.rpc('mark_push_tickets_processed', {
      results: automated,
    });
    if (error) throw new Error(`mark processed failed: ${error.message}`);
    processed += (data as number | null) ?? 0;
  }

  if (broadcast.length > 0) {
    const { data, error } = await supabase.rpc('mark_broadcast_receipts', {
      results: broadcast,
    });
    if (error) throw new Error(`mark broadcast receipts failed: ${error.message}`);
    processed += (data as number | null) ?? 0;
  }

  if (plan.credentialsFailures > 0) {
    // Loud on purpose: this one means NOTHING is reaching Android, and it is ours to fix.
    console.error(
      `push-receipts: ${plan.credentialsFailures} receipts blamed our FCM credentials; ` +
        'check the assigned Private Key Id in EAS (docs/runbooks/credentials.md)',
    );
  }

  const alerted = await maybeAlarm(supabase);

  await pingDeadMan(healthcheckUrl, true);
  return Response.json({
    tickets: tickets.length,
    answered: receipts.length,
    processed,
    automated: automated.length,
    broadcast: broadcast.length,
    pruned,
    errored: plan.errored,
    credentialsFailures: plan.credentialsFailures,
    alerted,
  });
}

/**
 * Raise the day's error-rate alarm, at most once per admin per day.
 *
 * Deliberately AFTER the sweep's own work and never in front of it: a failure to alert
 * must not stop tokens being pruned, which is the job's actual duty.
 */
async function maybeAlarm(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase.rpc('push_error_rate', { window_hours: 24 });
  if (error) throw new Error(`rate read failed: ${error.message}`);

  const row = (data as Array<{ sent: number; errored: number; error_ratio: number }> | null)
    ?.[0];
  const rate: RateAlarm | null = row
    ? { sent: Number(row.sent), errored: Number(row.errored), ratio: Number(row.error_ratio) }
    : null;
  if (!shouldAlarm(rate) || !rate) return 0;

  const send = sender();
  if (!send) {
    // Not a job failure: an environment without Resend (local, a fresh dev project) has
    // nobody to tell, and the console line is the record.
    console.error(
      `push-receipts: ${(rate.ratio * 100).toFixed(1)}% failures and email is not configured`,
    );
    return 0;
  }

  const { data: admins, error: adminsError } = await supabase
    .from('profiles')
    .select('id, email')
    .eq('role', 'admin')
    .is('deleted_at', null);
  if (adminsError) throw new Error(`admins read failed: ${adminsError.message}`);

  const alert = buildRateAlert(rate, optionalEnv('DASHBOARD_URL'));
  const from = optionalEnv('ALERTS_FROM_EMAIL');
  if (!from) return 0;

  // The subject is the DATE, so the ledger's unique index caps this at one per admin per
  // day however often the sweep runs.
  const today = new Date().toISOString().slice(0, 10);
  const delivered: Array<{ recipient_id: string; kind: string; subject: string }> = [];

  for (const admin of (admins ?? []) as Array<{ id: string; email: string | null }>) {
    if (!admin.email) continue;
    // Already told today? The ledger answers, and it answers per admin.
    const { count, error: seenError } = await supabase
      .from('job_alerts')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_id', admin.id)
      .eq('kind', 'push_error_rate')
      .eq('subject', today);
    if (seenError) throw new Error(`ledger read failed: ${seenError.message}`);
    if ((count ?? 0) > 0) continue;

    try {
      await send({
        from,
        to: admin.email,
        subject: alert.subject,
        text: alert.text,
      });
      delivered.push({
        recipient_id: admin.id,
        kind: 'push_error_rate',
        subject: today,
      });
    } catch (sendError) {
      // No address in the log (docs/spec/20).
      console.error(
        `push-receipts: alert send failed for admin ${admin.id}:`,
        sendError instanceof Error ? sendError.message : 'unknown',
      );
    }
  }

  if (delivered.length > 0) {
    // Recorded only AFTER sending, so a crash re-sends rather than silences (ADR 0016).
    const { error: recordError } = await supabase.rpc('record_job_alerts', {
      alerts: delivered,
    });
    if (recordError) throw new Error(`record failed: ${recordError.message}`);
  }
  return delivered.length;
}

/** `EXPO_ACCESS_TOKEN` is optional; it is only required if push security is enabled. */
function fetchReceipts(): ReceiptFetcher {
  const endpoint = optionalEnv('EXPO_PUSH_RECEIPTS_URL');
  const token = optionalEnv('EXPO_ACCESS_TOKEN');
  return endpoint ? expoReceiptFetcher(token, endpoint) : expoReceiptFetcher(token);
}

/** Null when this environment has no Resend key yet (docs/spec/24 §1 rows 11-12). */
function sender(): EmailSender | null {
  const apiKey = optionalEnv('RESEND_API_KEY');
  if (!apiKey || !optionalEnv('ALERTS_FROM_EMAIL')) return null;
  const endpoint = optionalEnv('RESEND_API_URL');
  return endpoint ? resendSender(apiKey, endpoint) : resendSender(apiKey);
}
