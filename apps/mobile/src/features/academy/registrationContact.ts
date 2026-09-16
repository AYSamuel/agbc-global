import type { ContactRequest } from '@agbc/shared';

import {
  type ContactAttempt,
  type ContactSendOutcome,
  keyFor,
  sendContactMessage,
} from '@/lib/contactForm';

// "Email us about this registration" (decided 2026-08-10, replacing in-app
// self-cancel): members do not cancel from the app; a paid place is released by
// a human after a conversation. The message goes through the SAME contact-form
// function the CONTACT screen uses (same inbox, same rate limit), with the
// course and a short registration reference attached automatically so the team
// knows which row without the member typing it.
//
// Since W4.18 slice 3 it also goes through the same SENDER (`lib/contactForm`),
// which carries the idempotency key. This file used to hold its own copy of the
// call and its own reading of a failure, and the two had already drifted.

export type RegistrationContactOutcome = ContactSendOutcome;

/**
 * The context line is deliberately English and machine-shaped: it is for the
 * team's inbox, not the member's screen, and the inbox reads one language.
 * The member's own words follow untouched, in whatever language they wrote.
 */
export function registrationMessage(
  courseName: string,
  registrationId: string,
  text: string,
): string {
  const ref = registrationId.slice(0, 8);
  return `[Registration · ${courseName} · ref ${ref}]\n\n${text}`;
}

export interface RegistrationMessageInput {
  name: string;
  email: string;
  courseName: string;
  registrationId: string;
  text: string;
}

/** The exact request a given input sends, so the sheet can key it by content. */
export function registrationRequest(
  input: RegistrationMessageInput,
): ContactRequest {
  return {
    name: input.name,
    email: input.email,
    message: registrationMessage(
      input.courseName,
      input.registrationId,
      input.text,
    ),
  };
}

/**
 * Sends the message under a key kept by content: pass back the attempt this
 * returns on a retry, and the same words go out under the same key.
 */
export async function sendRegistrationMessage(
  input: RegistrationMessageInput,
  previous: ContactAttempt | null,
): Promise<{ outcome: RegistrationContactOutcome; attempt: ContactAttempt }> {
  const request = registrationRequest(input);
  const attempt = keyFor(request, previous);
  const outcome = await sendContactMessage(request, attempt.key);
  return { outcome, attempt };
}
