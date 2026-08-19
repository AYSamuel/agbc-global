// The broadcast fan-out (docs/spec/15, `17` §2, `21` §5; W3.5 slice 2). Cron-invoked every
// minute via jobs.invoke_edge_function.
//
// Same order as every other job here: lease, read, act, record, release. What is different
// is that this one is INTERRUPTIBLE by design. `17` §2 asks for "a halt control that stops
// an in-flight fan-out mid-delivery", so the loop re-reads the broadcast's status between
// pages and stops when a human has pulled the brake. Everything still pending stays pending,
// which is both the record of what was never sent and the reason a halt cannot be undone by
// simply running the job again: `halted` is terminal, and the dashboard duplicates rather
// than resumes.
//
// THE RUN HOLDS NOTHING IT COULD LOSE. Every page is: read pending rows, send, record. A
// crash anywhere leaves the database saying exactly what is still owed, because the delivery
// rows ARE the cursor (20260819200000). The lease stops two runs overlapping; the pending
// status stops a resumed run re-sending; the unique index stops a re-prepare double-writing.
// Three different mechanisms, because each covers a different failure.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { isServiceRoleRequest, unauthorized } from '../_shared/auth.ts';
import { optionalEnv, requiredEnv } from '../_shared/env.ts';
import { pingDeadMan } from '../_shared/healthchecks.ts';
import { claimJobLease, releaseJobLease } from '../_shared/jobs.ts';
import { pushSenderFromEnv } from '../_shared/notify.ts';
import { captureEdgeError } from '../_shared/sentry.ts';
import { buildFanoutTargets, planFanout, type ChunkRow } from './core.ts';

const JOB = 'broadcast-fanout';

/** Longer than the one-minute tick: a large fan-out legitimately outlives its own schedule. */
const LEASE = '10 minutes';

/** Expo accepts 100 messages per request (`_shared/push.ts`), so a page is a request. */
const PAGE = 100;

/** A guard against one broadcast starving the rest of the queue in a single run. */
const MAX_PAGES_PER_RUN = 20;

interface InFlightRow {
  id: string;
  attempts: number;
}

Deno.serve(async (req) => {
  if (!(await isServiceRoleRequest(req))) return unauthorized();

  const healthcheckUrl = optionalEnv('HEALTHCHECK_URL_BROADCAST_FANOUT');
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
    console.error('broadcast-fanout failed:', error);
    await captureEdgeError('broadcast-fanout', error);
    await pingDeadMan(healthcheckUrl, false);
    return Response.json({ error: 'fan-out run failed' }, { status: 500 });
  }
});

async function run(
  supabase: SupabaseClient,
  healthcheckUrl: string | null,
): Promise<Response> {
  const { data, error } = await supabase.rpc('broadcasts_in_flight');
  if (error) throw new Error(`in-flight read failed: ${error.message}`);

  const inFlight = (data ?? []) as InFlightRow[];
  if (inFlight.length === 0) {
    // Almost every minute of almost every day. Success, not idleness.
    await pingDeadMan(healthcheckUrl, true);
    return Response.json({ broadcasts: 0 });
  }

  const send = pushSenderFromEnv();
  const outcomes: Array<Record<string, unknown>> = [];
  let clean = true;

  for (const broadcast of inFlight) {
    try {
      outcomes.push(await deliver(supabase, broadcast.id, send));
    } catch (broadcastError) {
      // One broadcast's failure must not abandon the others: they are separate promises to
      // separate congregations. The row keeps its pending deliveries and its attempt count,
      // so the next tick resumes it, and the run reports itself unhealthy.
      clean = false;
      console.error(
        `broadcast-fanout: ${broadcast.id} failed:`,
        broadcastError instanceof Error ? broadcastError.message : 'unknown',
      );
    }
  }

  await pingDeadMan(healthcheckUrl, clean);
  return Response.json({ broadcasts: inFlight.length, outcomes });
}

async function deliver(
  supabase: SupabaseClient,
  broadcastId: string,
  send: ReturnType<typeof pushSenderFromEnv>,
): Promise<Record<string, unknown>> {
  // Counted BEFORE the work: an attempt that dies without reaching the end must still count
  // against the give-up budget, or a broadcast that crashes the function every time would be
  // retried for ever.
  const { error: attemptError } = await supabase.rpc('count_broadcast_attempt', {
    broadcast: broadcastId,
  });
  if (attemptError) throw new Error(`attempt count failed: ${attemptError.message}`);

  const { data: prepared, error: prepareError } = await supabase.rpc(
    'broadcast_prepare_deliveries',
    { broadcast: broadcastId },
  );
  if (prepareError) throw new Error(`prepare failed: ${prepareError.message}`);

  let sent = 0;
  let failed = 0;
  let pruned = 0;
  let pages = 0;
  let halted = false;

  while (pages < MAX_PAGES_PER_RUN) {
    // The halt check, between pages rather than between messages: a page is one Expo request
    // and cannot be taken back once made, so the honest granularity of "stop" is a page.
    if (await isHalted(supabase, broadcastId)) {
      halted = true;
      break;
    }

    const { data: chunk, error: chunkError } = await supabase.rpc(
      'broadcast_next_push_chunk',
      { broadcast: broadcastId, chunk_size: PAGE },
    );
    if (chunkError) throw new Error(`chunk read failed: ${chunkError.message}`);

    const rows = (chunk ?? []) as ChunkRow[];
    if (rows.length === 0) break;

    pages += 1;
    const targets = buildFanoutTargets(rows);
    const tickets = await send(targets.map((target) => target.message));
    const plan = planFanout(targets, tickets);

    if (plan.results.length > 0) {
      const { error: markError } = await supabase.rpc('mark_broadcast_deliveries', {
        results: plan.results,
      });
      if (markError) throw new Error(`mark failed: ${markError.message}`);
      sent += plan.results.filter((result) => result.error === null).length;
      failed += plan.results.filter((result) => result.error !== null).length;
    }

    if (plan.dead.length > 0) {
      const { error: pruneError, count } = await supabase
        .from('devices')
        .delete({ count: 'exact' })
        .in('id', plan.dead);
      if (pruneError) throw new Error(`device prune failed: ${pruneError.message}`);
      pruned += count ?? 0;
    }
  }

  const { data: status, error: finishError } = await supabase.rpc('finish_broadcast', {
    broadcast: broadcastId,
  });
  if (finishError) throw new Error(`finish failed: ${finishError.message}`);

  // Counts and a status, never a title and never a recipient (docs/spec/20).
  return {
    broadcast: broadcastId,
    prepared: (prepared as number | null) ?? 0,
    sent,
    failed,
    pruned,
    pages,
    halted,
    status,
  };
}

/** Cheap, and read fresh every page: the whole point is that a human can change it mid-run. */
async function isHalted(
  supabase: SupabaseClient,
  broadcastId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('broadcasts')
    .select('status')
    .eq('id', broadcastId)
    .single();
  if (error) throw new Error(`status read failed: ${error.message}`);
  return (data as { status: string }).status !== 'sending';
}
