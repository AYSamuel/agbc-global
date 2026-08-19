// What the fan-out decides, with no network and no database in sight (docs/spec/15, `17` §2;
// W3.5 slice 2).
//
// Less lives here than in the automated jobs' cores, and the reason is worth stating: a
// broadcast's words were typed by a person and pre-rendered per language at prepare time
// (`02`), so there is no template to select and no plural rule to apply. What is left is the
// mapping from a delivery row to an addressed message, and the mapping back from Expo's
// answer to a row's outcome.

import { routeFor } from '../_shared/pushChannels.ts';
import { isDeadToken, type PushMessage } from '../_shared/push.ts';

/** A row of `broadcast_next_push_chunk`. */
export interface ChunkRow {
  delivery_id: string;
  notification_id: string;
  device_id: string;
  expo_push_token: string;
  /** `ministry` or `branch`: the Android channel, and the pref that already filtered it. */
  type: string;
  title: string;
  body: string;
  deep_link: string;
}

/** A message and the delivery row it will be recorded against. */
export interface FanoutTarget {
  deliveryId: string;
  deviceId: string;
  message: PushMessage;
}

export function buildFanoutTargets(rows: readonly ChunkRow[]): FanoutTarget[] {
  return rows.map((row) => ({
    deliveryId: row.delivery_id,
    deviceId: row.device_id,
    message: {
      to: row.expo_push_token,
      title: row.title,
      body: row.body,
      data: {
        deepLink: row.deep_link,
        notificationId: row.notification_id,
        type: row.type,
      },
      channelId: routeFor(row.type).channel,
    },
  }));
}

export interface DeliveryResult {
  deliveryId: string;
  ticketId: string | null;
  error: string | null;
}

export interface FanoutPlan {
  results: DeliveryResult[];
  /** Devices to delete: `DeviceNotRegistered` at send time, same rule as everywhere else. */
  dead: string[];
}

/**
 * Turn a page's tickets into per-row outcomes.
 *
 * A ticket Expo did not return leaves its row PENDING rather than being marked failed, which
 * is the difference between "we do not know" and "it did not work". Pending is the fan-out's
 * work list, so an unanswered row is simply attempted again on the next run, and
 * `finish_broadcast` will not close the broadcast while any remain.
 */
export function planFanout(
  targets: readonly FanoutTarget[],
  tickets: readonly { status: 'ok' | 'error'; id?: string; error?: string }[],
): FanoutPlan {
  const plan: FanoutPlan = { results: [], dead: [] };
  const dead = new Set<string>();

  targets.forEach((target, index) => {
    const ticket = tickets[index];
    if (!ticket) return;

    if (ticket.status === 'ok' && ticket.id) {
      plan.results.push({
        deliveryId: target.deliveryId,
        ticketId: ticket.id,
        error: null,
      });
      return;
    }

    plan.results.push({
      deliveryId: target.deliveryId,
      ticketId: null,
      error: ticket.error ?? 'Unknown',
    });
    // Only this one prunes, for the reason `push.ts` gives: the credentials failures mean
    // OUR key is wrong, and pruning on them would delete every registration in the ministry
    // during an outage we caused.
    if (isDeadToken(ticket.error)) dead.add(target.deviceId);
  });

  plan.dead = [...dead];
  return plan;
}
