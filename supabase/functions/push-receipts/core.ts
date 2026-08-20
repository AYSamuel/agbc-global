// What the receipts sweep decides, with no network and no database in sight.
//
// Same split as verse-monitor: `index.ts` does the lease, the reads, the writes and the
// ping; everything that involves a JUDGEMENT lives here, where it can be tested against
// hand-written receipts instead of a live Expo account.

import { isCredentialsFailure, isDeadToken, type PushReceipt } from '../_shared/push.ts';

/** Which ledger a ticket lives in: `push_tickets` or `broadcast_deliveries`. */
export type TicketSource = 'ticket' | 'broadcast';

export interface TicketRow {
  ticket_id: string;
  device_id: string;
  /**
   * The answer is written to a different table per source, so it travels WITH the ticket
   * rather than being inferred later. Absent means the automated ledger, which is what the
   * pre-broadcast rows and any older caller mean.
   */
  source?: TicketSource;
}

export interface ReceiptOutcome {
  ticketId: string;
  error: string | null;
  source: TicketSource;
}

export interface SweepPlan {
  /** Ticket ids to stamp `processed_at`: only those Expo actually answered. */
  processed: ReceiptOutcome[];
  /** Device ids to delete, deduped. A device may hold several failed tickets. */
  deadDevices: string[];
  /** Receipts that came back as errors, for the run's own log line. */
  errored: number;
  /**
   * Receipts blaming OUR credentials rather than a device. Kept separate because the
   * response is different in kind: nobody's token is bad, the FCM V1 key in EAS is.
   */
  credentialsFailures: number;
}

/**
 * Turn the tickets we asked about and the receipts we got back into a set of actions.
 *
 * THE UNANSWERED ARE LEFT ALONE. Expo omits receipts that are not ready yet, so a ticket
 * with no receipt in this response keeps `processed_at IS NULL` and is asked about again
 * on the next tick. Marking it processed would silently drop the one outcome the sweep
 * exists to catch; the 7-day retention purge is what eventually removes tickets whose
 * receipts never arrived (Expo clears receipts after 24h, so anything older is
 * unanswerable anyway).
 */
export function planSweep(
  tickets: readonly TicketRow[],
  receipts: readonly PushReceipt[],
): SweepPlan {
  const deviceByTicket = new Map(tickets.map((t) => [t.ticket_id, t.device_id]));
  const sourceByTicket = new Map<string, TicketSource>(
    tickets.map((t) => [t.ticket_id, t.source ?? 'ticket']),
  );
  const plan: SweepPlan = {
    processed: [],
    deadDevices: [],
    errored: 0,
    credentialsFailures: 0,
  };
  const dead = new Set<string>();

  for (const receipt of receipts) {
    // A receipt for a ticket we did not ask about: ignore rather than trust it. It cannot
    // be attributed to a device, so acting on it could delete the wrong registration.
    const deviceId = deviceByTicket.get(receipt.ticketId);
    if (deviceId === undefined) continue;

    const source = sourceByTicket.get(receipt.ticketId) ?? 'ticket';

    if (receipt.status === 'ok') {
      plan.processed.push({ ticketId: receipt.ticketId, error: null, source });
      continue;
    }

    plan.errored += 1;
    plan.processed.push({
      ticketId: receipt.ticketId,
      error: receipt.error ?? 'Unknown',
      source,
    });

    if (isDeadToken(receipt.error)) {
      // Source-blind on purpose: a device that uninstalled the app is gone whether we
      // learned it from a reminder or from a broadcast, and before 20260820140000 a member
      // whose only pushes were broadcasts kept their registration for ever.
      dead.add(deviceId);
    } else if (isCredentialsFailure(receipt.error)) {
      // Never delete a device for this: the token is fine, our sending credentials are
      // not, and pruning here would destroy every registration during an outage we caused.
      plan.credentialsFailures += 1;
    }
  }

  plan.deadDevices = [...dead];
  return plan;
}

export interface RateAlarm {
  sent: number;
  errored: number;
  ratio: number;
}

/** `21` §5: alert when more than 10% of a day's automated tickets error. */
export const ERROR_RATE_FLOOR = 0.1;

/**
 * Should the day's rate raise an alarm?
 *
 * A floor on the SAMPLE as well as the ratio, deliberately: three sends and one failure
 * is 33% and means nothing, and an alarm that cries on Tuesday morning traffic is an
 * alarm people learn to ignore. Twenty is low enough to catch a real outage on a quiet
 * day and high enough that noise does not reach anyone.
 */
export const MIN_SAMPLE = 20;

export function shouldAlarm(rate: RateAlarm | null): boolean {
  if (!rate) return false;
  if (rate.sent < MIN_SAMPLE) return false;
  return rate.ratio > ERROR_RATE_FLOOR;
}

/**
 * The alert body. No tokens, no member names, no notification content: this goes to an
 * inbox (docs/spec/20), and the useful facts are all numbers.
 */
export function buildRateAlert(
  rate: RateAlarm,
  dashboardUrl: string | null,
): { subject: string; text: string } {
  const percent = (rate.ratio * 100).toFixed(1);
  const lines = [
    `${percent}% of push notifications failed in the last 24 hours.`,
    '',
    `Sent: ${rate.sent}`,
    `Failed: ${rate.errored}`,
    '',
    'Most often this is one of two things:',
    '  * many DeviceNotRegistered receipts, which is normal after a lot of uninstalls',
    '    and needs nothing (the sweep prunes those tokens itself); or',
    '  * MismatchSenderId / InvalidCredentials, which means the FCM V1 key in EAS is',
    '    wrong or revoked and NO push is reaching Android. Check the assigned Private',
    '    Key Id against docs/runbooks/credentials.md.',
  ];
  if (dashboardUrl) lines.push('', dashboardUrl);
  return {
    subject: `AGBC push: ${percent}% delivery failures in 24h`,
    text: lines.join('\n'),
  };
}
