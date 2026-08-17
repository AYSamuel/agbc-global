// The Expo Push adapter (docs/spec/15, `21` §5). One module, so the vendor is one file to
// swap and its types never bleed into job logic (backend standard).
//
// Expo push is TWO-PHASE and that shape drives everything here. A send returns a TICKET,
// which only says Expo accepted the message. The real outcome arrives as a RECEIPT roughly
// 15 minutes later, and receipts are cleared after 24 hours. `DeviceNotRegistered` almost
// always appears in the receipt rather than the ticket, so a sender that ignores receipts
// accumulates dead tokens and eventually gets throttled by Expo. That is why the receipts
// sweep is a launch requirement rather than an optimisation.
//
// Wire limits, verified against Expo's current API docs (2026-08-16) rather than recalled:
//   * send        100 messages per request
//   * getReceipts 1000 ticket ids per request
//
// PAYLOAD RULE, restated at the transport because it is easy to lose between layers:
// nothing special-category ever reaches this module. Titles and bodies arrive already
// rendered by `pushTemplates.ts`, which is where that rule is enforced and explained.

const SEND_ENDPOINT = 'https://exp.host/--/api/v2/push/send';
const RECEIPTS_ENDPOINT = 'https://exp.host/--/api/v2/push/getReceipts';

export const SEND_CHUNK = 100;
export const RECEIPT_CHUNK = 1000;

const TIMEOUT_MS = 15_000;

export interface PushMessage {
  /** An ExponentPushToken[...]. */
  to: string;
  title: string;
  body: string;
  /**
   * Navigation only. The app treats this as untrusted and resolves `deepLink` against an
   * allowlist before routing (docs/spec/15, and `03`'s gate-return rule: a deep link never
   * carries or triggers a write).
   *
   * `type` is the notification's CATEGORY (`ministry`, `prayer`, ...), carried so the app
   * can report `notification_opened` with it and tell a broadcast from an activity ping.
   * It is a category name, never member data, so it is safe on a payload that crosses
   * Expo, APNs/FCM and the OS.
   */
  data: { deepLink: string; notificationId: string; type: string };
  /** One of the six Android channels; ignored by iOS (see pushChannels.ts). */
  channelId: string;
}

export interface PushTicket {
  /** Carried through so a failure can be traced back to a device without re-querying. */
  token: string;
  status: 'ok' | 'error';
  /** Present when status is 'ok'; the id the receipts sweep later asks about. */
  id?: string;
  /** Expo's machine code from `details.error`, e.g. DeviceNotRegistered. */
  error?: string;
  message?: string;
}

export interface PushReceipt {
  ticketId: string;
  status: 'ok' | 'error';
  error?: string;
  message?: string;
}

export type PushSender = (messages: PushMessage[]) => Promise<PushTicket[]>;
export type ReceiptFetcher = (ticketIds: string[]) => Promise<PushReceipt[]>;

/** Split into vendor-sized batches. Exported so the tests can assert the chunking. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

interface ExpoTicketEnvelope {
  data?: Array<{
    status?: string;
    id?: string;
    message?: string;
    details?: { error?: string };
  }>;
  errors?: Array<{ code?: string; message?: string }>;
}

interface ExpoReceiptEnvelope {
  data?: Record<
    string,
    { status?: string; message?: string; details?: { error?: string } }
  >;
  errors?: Array<{ code?: string; message?: string }>;
}

async function postJson<T>(
  endpoint: string,
  body: unknown,
  accessToken: string | null,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  // Only needed when the Expo project enforces push security; harmless otherwise.
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    // Every outbound call has a timeout (backend standard): a missing one donates our
    // whole job window to somebody else's outage.
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    // No response body in the message: it can echo the request, and the request contains
    // push tokens (docs/spec/20: never log a device identifier).
    throw new Error(`expo push: HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

/**
 * Send a batch of messages and return one ticket per message, in order.
 *
 * DELIBERATELY NOT RETRIED. Expo's send endpoint offers no idempotency key, so a retry
 * after a timeout can deliver the same notification twice, and there is no way to tell a
 * lost request from a lost response. The guarantee that matters is one notification row
 * per member per occurrence, and that lives in the database (`notifications`' dedupe
 * indexes, ADR 0022), where it can actually be enforced. A push we are unsure about is
 * left unsent and the member still finds it in the notification centre, which is the
 * degradation `15` already specifies for push being off entirely.
 */
export function expoPushSender(
  accessToken: string | null = null,
  endpoint: string = SEND_ENDPOINT,
): PushSender {
  return async (messages) => {
    const tickets: PushTicket[] = [];

    for (const batch of chunk(messages, SEND_CHUNK)) {
      const envelope = await postJson<ExpoTicketEnvelope>(
        endpoint,
        batch,
        accessToken,
      );

      // A request-level error means NONE of this batch was accepted.
      if (envelope.errors?.length) {
        const code = envelope.errors[0]?.code ?? 'unknown';
        throw new Error(`expo push: request rejected (${code})`);
      }

      const rows = envelope.data ?? [];
      batch.forEach((message, index) => {
        const row = rows[index];
        if (!row) {
          // Fewer tickets than messages: Expo's contract says one per message, so this is
          // a vendor surprise. Recorded as an error rather than dropped, so the count of
          // tickets always matches the count of attempts.
          tickets.push({
            token: message.to,
            status: 'error',
            error: 'NoTicketReturned',
          });
          return;
        }
        tickets.push({
          token: message.to,
          status: row.status === 'ok' ? 'ok' : 'error',
          id: row.id,
          error: row.details?.error,
          message: row.message,
        });
      });
    }

    return tickets;
  };
}

/**
 * Fetch receipts for tickets already sent.
 *
 * Safe to retry, unlike a send: this is a read, and asking twice about the same ticket
 * costs nothing. A batch that fails at the request level throws and the caller leaves
 * those tickets unprocessed, so the next tick asks again, which is the correct behaviour
 * for a queue drained by `processed_at`.
 */
export function expoReceiptFetcher(
  accessToken: string | null = null,
  endpoint: string = RECEIPTS_ENDPOINT,
): ReceiptFetcher {
  return async (ticketIds) => {
    const receipts: PushReceipt[] = [];

    for (const batch of chunk(ticketIds, RECEIPT_CHUNK)) {
      const envelope = await postJson<ExpoReceiptEnvelope>(
        endpoint,
        { ids: batch },
        accessToken,
      );

      if (envelope.errors?.length) {
        const code = envelope.errors[0]?.code ?? 'unknown';
        throw new Error(`expo receipts: request rejected (${code})`);
      }

      // Expo returns a MAP keyed by ticket id, and omits ids whose receipt is not ready
      // yet. An omitted id is not an error: it stays unprocessed and is asked about again.
      for (const [ticketId, row] of Object.entries(envelope.data ?? {})) {
        receipts.push({
          ticketId,
          status: row.status === 'ok' ? 'ok' : 'error',
          error: row.details?.error,
          message: row.message,
        });
      }
    }

    return receipts;
  };
}

/**
 * The one receipt error that means the token is dead and must be deleted (docs/spec/15).
 *
 * The others are ours to fix, not the device's: MessageTooBig is a payload bug,
 * MessageRateExceeded is back-pressure, and MismatchSenderId / InvalidCredentials mean the
 * FCM V1 key in EAS is wrong or revoked. Deleting a device for any of those would destroy
 * a member's push registration because WE misconfigured something.
 */
export function isDeadToken(error: string | undefined): boolean {
  return error === 'DeviceNotRegistered';
}

/** Credentials problems are an operator alarm, not a per-device outcome. */
export function isCredentialsFailure(error: string | undefined): boolean {
  return error === 'MismatchSenderId' || error === 'InvalidCredentials';
}
