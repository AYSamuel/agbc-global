import { FunctionsHttpError } from '@supabase/supabase-js';

import type { ContactRequest, ContactResponse } from '@agbc/shared';

import { supabase } from '@/lib/supabase';

// "Email us about this registration" (decided 2026-08-10, replacing in-app
// self-cancel): members do not cancel from the app; a paid place is released by
// a human after a conversation. The message goes through the SAME contact-form
// function the CONTACT screen uses (same inbox, same rate limit), with the
// course and a short registration reference attached automatically so the team
// knows which row without the member typing it.

export type RegistrationContactOutcome =
  | 'sent'
  | 'rate_limited'
  | 'failed'
  /** Fetch-level failure: no network is the usual cause. */
  | 'offline';

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

export async function sendRegistrationMessage(input: {
  name: string;
  email: string;
  courseName: string;
  registrationId: string;
  text: string;
}): Promise<RegistrationContactOutcome> {
  const body: ContactRequest = {
    name: input.name,
    email: input.email,
    message: registrationMessage(
      input.courseName,
      input.registrationId,
      input.text,
    ),
  };
  try {
    const { error } = (await supabase.functions.invoke<ContactResponse>(
      'contact-form',
      { body },
    )) as { error: unknown };
    if (!error) return 'sent';
    if (error instanceof FunctionsHttpError) {
      return (await machineCode(error)) === 'rate_limited'
        ? 'rate_limited'
        : 'failed';
    }
    return 'offline';
  } catch {
    return 'offline';
  }
}

/** The `{ error: '<code>' }` body supabase-js hides behind error.context. */
async function machineCode(error: FunctionsHttpError): Promise<string | null> {
  const context: unknown = (error as { context?: unknown }).context;
  if (!(context instanceof Response)) return null;
  try {
    const body = (await context.json()) as { error?: unknown };
    return typeof body.error === 'string' ? body.error : null;
  } catch {
    return null;
  }
}
