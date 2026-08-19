// The delivery seam every scheduled reminder goes through (docs/spec/15, `21` §5; W3.4).
//
// W3.3 built the pieces and no caller: a transport (`push.ts`), a catalogue
// (`pushTemplates.ts`), a routing table (`pushChannels.ts`) and a log with two unique
// indexes (`notifications`). This module is where they meet, and it exists once rather than
// three times because the ORDER of these steps is the whole guarantee, and an order copied
// into three jobs is an order that will be got wrong in one of them.
//
// THE ORDER, and why it is this way round:
//
//   1. `deliver_notifications` inserts the rows and returns only the ones it created. The
//      insert IS the claim on the send (ADR 0022's partial unique on
//      `(profile_id, dedupe_key)`), so two runs racing on one tick, a crash mid-run, or a
//      re-run by an operator all converge on one row per member per occurrence.
//   2. Only then is anything pushed. A push that fails leaves the row standing, so the
//      member finds it in the notification centre on next open, which is exactly the
//      degradation `15` specifies for push being off entirely. The other order,
//      push-then-record, double-pushes on any crash between the two and there is no index
//      that can catch it.
//   3. Tickets are recorded AFTER the send returns, never before (ADR 0016), and the
//      receipts sweep takes it from there.
//
// WHAT THIS MODULE DELIBERATELY DOES NOT DO:
//
//   * It does not check `notification_prefs`. The pref gate lives in each job's batch SQL,
//     on the column `15` names for that tier, because ADR 0016 puts the "who" in the
//     database. A second gate here would be a second owner of one fact, and the two would
//     disagree today: `pushChannels.ROUTING` sends the `prayer` channel to
//     `prayer_activity` (one control writes both columns), while `15`'s tier table gates
//     prayer reminders on `prayer_reminders`.
//   * It does not retry a send. `push.ts` explains why: Expo has no idempotency key, so a
//     retry after a timeout can deliver twice with no way to tell a lost request from a
//     lost response.

import type { SupabaseClient } from '@supabase/supabase-js';

import { routeFor } from './pushChannels.ts';
import { renderTemplate, type TemplateParams } from './pushTemplates.ts';
import { optionalEnv } from './env.ts';
import {
  expoPushSender,
  isDeadToken,
  type PushMessage,
  type PushSender,
} from './push.ts';

/** One notification to write. The WORDS are not here: `15` stores a key and renders late. */
export interface NotificationEntry {
  profile_id: string;
  /** A value from `notifications.type`'s CHECK; it picks the Android channel. */
  type: string;
  template_key: string;
  params: TemplateParams;
  /** An expo-router path. Navigates only (docs/spec/15, `03`). */
  deep_link: string;
  /** Deterministic per occurrence. This is the no-double-send guarantee. */
  dedupe_key: string;
}

/** A row of `deliver_notifications`: one per (created notification, device). */
export interface DeliveryRow {
  notification_id: string;
  profile_id: string;
  language: string;
  type: string;
  template_key: string | null;
  params: Record<string, string | number> | null;
  deep_link: string;
  /** Null when the member has registered no device. The row still counts as created. */
  device_id: string | null;
  expo_push_token: string | null;
}

/** A message and the device it is aimed at, kept together so a ticket can be attributed. */
export interface PushTarget {
  deviceId: string;
  message: PushMessage;
}

export interface DeliveryOutcome {
  /** Notifications actually written this run. Members already told are not counted. */
  created: number;
  /** Of those, how many had a device to push to. */
  targeted: number;
  /** Tickets Expo accepted. */
  sent: number;
  /** Send-time ticket errors (the rest arrive later, as receipts). */
  failed: number;
  /** Devices deleted for `DeviceNotRegistered` at send time. */
  pruned: number;
  /**
   * True when the whole push request was rejected and nothing went out. The rows still
   * stand, so the caller pings FAILURE rather than pretending the run was clean.
   */
  pushRejected: boolean;
}

/**
 * Turn created rows into addressed messages.
 *
 * Pure, so the rendering rules (per-recipient language, the right Android channel, a payload
 * that carries nothing but navigation) are testable without a network or a database.
 */
export function buildTargets(rows: readonly DeliveryRow[]): PushTarget[] {
  const targets: PushTarget[] = [];

  for (const row of rows) {
    // No token means no push. The notification row exists either way, which is the point.
    if (!row.expo_push_token || !row.device_id) continue;

    const { title, body } = renderTemplate(
      row.template_key ?? '',
      row.params ?? {},
      row.language,
    );

    targets.push({
      deviceId: row.device_id,
      message: {
        to: row.expo_push_token,
        title,
        body,
        data: {
          deepLink: row.deep_link,
          notificationId: row.notification_id,
          type: row.type,
        },
        channelId: routeFor(row.type).channel,
      },
    });
  }

  return targets;
}

export interface TicketPlan {
  /** Rows for `push_tickets`: only what Expo accepted and gave an id. */
  record: Array<{ ticket_id: string; device_id: string }>;
  /** Devices to delete: `DeviceNotRegistered` seen at SEND time rather than in a receipt. */
  dead: string[];
  /** Send-time errors of any kind, for the run's own log line. */
  errored: number;
}

/**
 * Match tickets back to the devices they were sent to and decide what to keep.
 *
 * Expo returns one ticket per message, in order (`push.ts` enforces that, inserting a
 * synthetic error rather than letting the arrays drift), so the index is the join.
 *
 * A SEND-TIME ERROR IS NOT RECORDED IN `push_tickets`, because it has no ticket id and that
 * column is the table's primary key: Expo's own id is the natural key there, and inventing
 * one would put a row in the receipts sweep's queue that Expo can never answer. Dead tokens
 * are still pruned here, exactly as the sweep prunes them later, and the count is returned
 * so the run can say so out loud.
 */
export function planTickets(
  targets: readonly PushTarget[],
  tickets: readonly { status: 'ok' | 'error'; id?: string; error?: string }[],
): TicketPlan {
  const plan: TicketPlan = { record: [], dead: [], errored: 0 };
  const dead = new Set<string>();

  targets.forEach((target, index) => {
    const ticket = tickets[index];
    if (!ticket) return;

    if (ticket.status === 'ok' && ticket.id) {
      plan.record.push({ ticket_id: ticket.id, device_id: target.deviceId });
      return;
    }

    plan.errored += 1;
    // Only this one. MessageTooBig, MessageRateExceeded and the credentials failures are
    // ours to fix, and pruning on them would delete registrations because WE broke
    // something (the reasoning is `push.ts`'s, applied at the other end of the two phases).
    if (isDeadToken(ticket.error)) dead.add(target.deviceId);
  });

  plan.dead = [...dead];
  return plan;
}

/**
 * Write the notifications, then push the ones that were newly written.
 *
 * Throws only on database failures, which are the caller's cue to fail the run: they mean
 * we do not know what was written. A push that goes wrong is reported in the outcome
 * instead, because the durable half already succeeded.
 */
export async function deliverNotifications(
  supabase: SupabaseClient,
  entries: readonly NotificationEntry[],
  send: PushSender,
): Promise<DeliveryOutcome> {
  const empty: DeliveryOutcome = {
    created: 0,
    targeted: 0,
    sent: 0,
    failed: 0,
    pruned: 0,
    pushRejected: false,
  };
  if (entries.length === 0) return empty;

  const { data, error } = await supabase.rpc('deliver_notifications', {
    entries,
  });
  if (error) throw new Error(`deliver failed: ${error.message}`);

  const rows = (data ?? []) as DeliveryRow[];
  if (rows.length === 0) return empty;

  const created = new Set(rows.map((row) => row.notification_id)).size;
  const targets = buildTargets(rows);
  if (targets.length === 0) return { ...empty, created };

  let tickets;
  try {
    tickets = await send(targets.map((target) => target.message));
  } catch (pushError) {
    // No tokens and no member data in the line (docs/spec/20): the count and the reason.
    console.error(
      `notify: push rejected for ${targets.length} messages:`,
      pushError instanceof Error ? pushError.message : 'unknown',
    );
    return { ...empty, created, targeted: targets.length, pushRejected: true };
  }

  const plan = planTickets(targets, tickets);

  // Record BEFORE pruning, unlike the receipts sweep, and for the mirror-image reason: here
  // the tickets are already out and unrecorded tickets can never be answered, while a device
  // that survives one extra tick is pruned by the sweep on the next receipt anyway.
  if (plan.record.length > 0) {
    const { error: ticketError } = await supabase
      .from('push_tickets')
      .insert(plan.record);
    if (ticketError) throw new Error(`ticket record failed: ${ticketError.message}`);
  }

  let pruned = 0;
  if (plan.dead.length > 0) {
    const { error: pruneError, count } = await supabase
      .from('devices')
      .delete({ count: 'exact' })
      .in('id', plan.dead);
    if (pruneError) throw new Error(`device prune failed: ${pruneError.message}`);
    pruned = count ?? 0;
  }

  return {
    created,
    targeted: targets.length,
    sent: plan.record.length,
    failed: plan.errored,
    pruned,
    pushRejected: false,
  };
}

/**
 * The sender the jobs use, built from this environment.
 *
 * `EXPO_ACCESS_TOKEN` is optional (only needed when the Expo project enforces push
 * security) and `EXPO_PUSH_SEND_URL` exists so a test or a local run can point the
 * transport somewhere that is not Expo. Shared rather than repeated per job, the same way
 * `push-receipts` keeps its receipt-fetcher factory in one place.
 */
export function pushSenderFromEnv(): PushSender {
  const endpoint = optionalEnv('EXPO_PUSH_SEND_URL');
  const token = optionalEnv('EXPO_ACCESS_TOKEN');
  return endpoint ? expoPushSender(token, endpoint) : expoPushSender(token);
}
