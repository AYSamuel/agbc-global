import { FunctionsHttpError } from '@supabase/supabase-js';

import type { ContactRequest, ContactResponse } from '@agbc/shared';

import { mintContactKey } from './contactKey';
import { budget } from './fetchWithTimeout';
import { functionErrorCode } from './functionError';
import { supabase } from './supabase';

// The one caller of the `contact-form` function (docs/spec/04 CONTACT; W4.18
// slice 3). Two screens send through it, CONTACT and the Academy's "Email us
// about this registration" sheet, and until this each carried its own copy of
// the call and its own reading of a failure, which had already drifted apart.
//
// A MESSAGE SENT ONCE ARRIVES ONCE. The function hands the email to Resend
// synchronously, so a request the phone gave up on may still have been sent;
// on 2026-09-16 one message typed once arrived at the church inbox twice, one
// minute apart, because the app called the first attempt a failure and the
// member did the only sensible thing. Every send now carries an
// `Idempotency-Key`, which the function forwards to Resend, which keeps it for
// 24 hours and refuses a second email under it. The key is minted here and
// KEPT BY CONTENT (see `keyFor`), so a retry of the same words cannot post
// twice and a rephrased message is never silently swallowed as a duplicate.

/** How long the phone waits for the function, instead of the client's default ten. */
export const CONTACT_BUDGET_MS = 30_000;

export type ContactSendOutcome =
  | 'sent'
  | 'rate_limited'
  /** The function answered and refused; nothing was sent. */
  | 'failed'
  /** The answer never arrived. The email may have gone; the copy says neither. */
  | 'unconfirmed';

/** One attempt's identity: the words it carried and the key it went out under. */
export interface ContactAttempt {
  content: string;
  key: string;
}

/**
 * The content a key is bound to. Whitespace is trimmed exactly as the shared
 * schema trims it, so "the same words" here means the same email.
 */
export function contentOf(request: ContactRequest): string {
  return JSON.stringify([
    request.name.trim(),
    request.email.trim(),
    request.message.trim(),
  ]);
}

/**
 * The key for this send. Tied to the CONTENT, not to the tap and not to the
 * screen: tied to the tap, a retry mints afresh and duplicates as before;
 * tied to the screen, a member who rephrases after a failure and presses
 * Send has the rewritten message discarded by Resend as a repeat of the old
 * one. So the previous key is reused only while the words are unchanged.
 */
export function keyFor(
  request: ContactRequest,
  previous: ContactAttempt | null,
): ContactAttempt {
  const content = contentOf(request);
  if (previous !== null && previous.content === content) return previous;
  return { content, key: mintContactKey() };
}

export async function sendContactMessage(
  body: ContactRequest,
  key: string,
): Promise<ContactSendOutcome> {
  try {
    // The SDK types this response's error loosely; pin it to unknown and
    // narrow by instance below.
    // A budget of its own (W4.18 follow-up to slice 3). The function cold-boots
    // and then waits up to six seconds for Resend; the client's default ten was
    // expiring first often enough that "unconfirmed" was the common case rather
    // than the rare one. Thirty seconds is room, not a promise: the key above is
    // what makes the retry safe when even this runs out.
    const { error } = (await supabase.functions.invoke<ContactResponse>(
      'contact-form',
      {
        body,
        headers: { 'Idempotency-Key': key },
        signal: budget(CONTACT_BUDGET_MS),
      },
    )) as { error: unknown };
    if (!error) return 'sent';
    if (error instanceof FunctionsHttpError) {
      return (await functionErrorCode(error)) === 'rate_limited'
        ? 'rate_limited'
        : 'failed';
    }
    return 'unconfirmed';
  } catch {
    return 'unconfirmed';
  }
}
