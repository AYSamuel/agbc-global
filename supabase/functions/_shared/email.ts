// Sending mail, behind one adapter (backend standard: third-party clients live in one
// module, so the vendor is one file to swap and vendor types never bleed into job logic).
//
// The jobs that use this send to STAFF about work waiting for them. Two rules follow the
// payload rather than the transport, so they are restated where the payload is built:
// no testimony or prayer wording ever leaves the database in an email (docs/spec/20: it is
// special-category data, and an inbox is not the place for it), and nothing here logs a
// recipient address.

export interface OutgoingEmail {
  from: string;
  to: string;
  subject: string;
  text: string;
}

/** Throws on failure; the caller decides whether that costs a dead-man ping. */
export type EmailSender = (email: OutgoingEmail) => Promise<void>;

const SEND_TIMEOUT_MS = 10_000;
const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/**
 * The Resend adapter.
 *
 * `endpoint` exists for LOCAL verification only, where there is no Resend key and pointing the
 * job at a catcher is the difference between proving the whole path and asserting it (set
 * RESEND_API_URL in supabase/functions/.env; see docs/runbooks/local-dev.md). It is not set in
 * any deployed environment.
 */
export function resendSender(
  apiKey: string,
  endpoint: string = RESEND_ENDPOINT,
): EmailSender {
  return async (email) => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(email),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });

    if (!response.ok) {
      // Status only. Resend echoes the recipient in its error body (docs/spec/20).
      throw new Error(`resend responded ${response.status}`);
    }
  };
}
