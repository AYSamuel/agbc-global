// Event notices (docs/spec/11, `15`, `17` §3, `21` §5; W3.5 slice 4). Cron-invoked every
// minute via jobs.invoke_edge_function.
//
// Same order as its siblings: lease, read, act, record, release. What is particular to this
// one is that a single tick can owe two very different sends: "there is a new event", which
// reaches a branch or the whole family and is pref-gated, and "the plan you said yes to has
// changed", which reaches the people holding an RSVP and is gated on nothing. Both are
// derived in SQL (20260820120000); this loop only pages and delivers.
//
// PAGING WITHOUT A CURSOR. `event_notice_recipients` returns members who do not yet hold
// this notice's dedupe key, and `deliver_notifications` claims a send by writing that row
// (ADR 0022). So the work list shrinks as the run proceeds and a crash resumes by asking the
// same question again. There is no page number to persist and nothing to reset.
//
// WHY THE ANNOUNCEMENT IS RECORDED LAST. `mark_event_announced` only stops the job
// re-asking a settled question; the dedupe keys are what stop a double-send. Losing the mark
// costs one extra query on the next tick. Writing it EARLY would cost a whole audience.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { isServiceRoleRequest, unauthorized } from '../_shared/auth.ts';
import { optionalEnv, requiredEnv } from '../_shared/env.ts';
import { pingDeadMan } from '../_shared/healthchecks.ts';
import { claimJobLease, releaseJobLease } from '../_shared/jobs.ts';
import { deliverNotifications, pushSenderFromEnv } from '../_shared/notify.ts';
import { captureEdgeError } from '../_shared/sentry.ts';
import { buildEntries, type DueEventRow } from './core.ts';

const JOB = 'event-notices';

/** Longer than the minute tick: a ministry-wide posting legitimately outlives its schedule. */
const LEASE = '10 minutes';

/** Members per round trip. The push sender chunks to Expo's 100 on its own (`push.ts`). */
const PAGE = 500;

/** One event must not starve the rest of the queue in a single run. */
const MAX_PAGES_PER_EVENT = 20;

Deno.serve(async (req) => {
  if (!(await isServiceRoleRequest(req))) return unauthorized();

  const healthcheckUrl = optionalEnv('HEALTHCHECK_URL_EVENT_NOTICES');
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
    console.error('event-notices failed:', error);
    await captureEdgeError('event-notices', error);
    await pingDeadMan(healthcheckUrl, false);
    return Response.json({ error: 'notice run failed' }, { status: 500 });
  }
});

async function run(
  supabase: SupabaseClient,
  healthcheckUrl: string | null,
): Promise<Response> {
  const { data, error } = await supabase.rpc('due_event_notices');
  if (error) throw new Error(`due read failed: ${error.message}`);

  const due = (data ?? []) as DueEventRow[];
  if (due.length === 0) {
    // Almost every minute of almost every day. Success, not idleness.
    await pingDeadMan(healthcheckUrl, true);
    return Response.json({ events: 0 });
  }

  const send = pushSenderFromEnv();
  const outcomes: Array<Record<string, unknown>> = [];
  let clean = true;

  for (const row of due) {
    try {
      const outcome = await announce(supabase, row, send);
      outcomes.push(outcome);
      // A push the transport refused is not a crash: the notification rows stand and the
      // members find them in the centre (`15`). The run still says so out loud, because
      // `21` §5 counts an undeliverable notification as a failed run rather than a quiet one.
      if (outcome.pushRejected) clean = false;
    } catch (eventError) {
      // One event's failure must not abandon the others: a cancellation nobody hears about
      // is the failure this job exists to prevent. The row keeps its unannounced revision,
      // so the next tick retries it, and the run reports itself unhealthy.
      clean = false;
      console.error(
        `event-notices: ${row.event_id} failed:`,
        eventError instanceof Error ? eventError.message : 'unknown',
      );
    }
  }

  await pingDeadMan(healthcheckUrl, clean);
  return Response.json({ events: due.length, outcomes });
}

async function announce(
  supabase: SupabaseClient,
  row: DueEventRow,
  send: ReturnType<typeof pushSenderFromEnv>,
): Promise<{
  event: string;
  kind: string;
  created: number;
  sent: number;
  pages: number;
  drained: boolean;
  pushRejected: boolean;
}> {
  let created = 0;
  let sent = 0;
  let pages = 0;
  let pushRejected = false;
  // Only a run that reached the END of the audience may record the announcement. A run that
  // stopped early has told SOME of them, and marking it done would drop the rest silently,
  // which is the one failure this job cannot be allowed to have (`21` §5).
  let drained = false;

  while (pages < MAX_PAGES_PER_EVENT) {
    const { data, error } = await supabase.rpc('event_notice_recipients', {
      event: row.event_id,
      chunk_size: PAGE,
    });
    if (error) throw new Error(`recipients read failed: ${error.message}`);

    const page = (data ?? []) as Array<{ profile_id: string }>;
    if (page.length === 0) {
      drained = true;
      break;
    }

    pages += 1;
    const outcome = await deliverNotifications(
      supabase,
      buildEntries(
        row,
        page.map((recipient) => recipient.profile_id),
      ),
      send,
    );
    created += outcome.created;
    sent += outcome.sent;
    pushRejected = pushRejected || outcome.pushRejected;

    // A page that wrote nothing means every member on it was already holding this notice,
    // which the anti-join should have filtered: another run is working the same event. Stop
    // WITHOUT marking it done and let the next tick see what is really left, rather than
    // spinning twenty pages out on somebody else's work.
    if (outcome.created === 0) break;
  }

  if (!drained) {
    // Never silent (`21` §5, and the "no silent caps" rule): the event stays due, the next
    // tick continues from the same anti-join, and this line says a run was cut short.
    console.warn(
      `event-notices: ${row.event_id} not drained after ${pages} pages; it stays due`,
    );
  } else {
    // Only now, and only for the plan this run actually worked on: a plan edited while the
    // pages were going out leaves the row due, and the next tick announces the newer one.
    const { error: markError } = await supabase.rpc('mark_event_announced', {
      event: row.event_id,
      announced_status: row.status,
      announced_starts_at_local: row.starts_at_local,
      announced_location: row.location,
    });
    if (markError) throw new Error(`mark failed: ${markError.message}`);
  }

  // Counts and a kind, never a member and never a branch's size (docs/spec/20).
  return {
    event: row.event_id,
    kind: row.kind,
    created,
    sent,
    pages,
    drained,
    pushRejected,
  };
}
