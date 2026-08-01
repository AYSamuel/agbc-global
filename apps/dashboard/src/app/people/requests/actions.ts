'use server';

import { redirect } from 'next/navigation';

import { createServerComponentClient } from '@/lib/supabase/server';
import { decideRequest } from '@/server/branchRequests';
import { authorize } from '@/server/authorize';

/**
 * The decision, as a Server Action (docs/spec/17 §People, ADR 0015).
 *
 * Thin, like `moderation/actions.ts`, and unlike `people/actions.ts` it can go back to the
 * house pattern: the outcome travels in the URL. What kept it out of the URL on `/people`
 * was the SUBJECT, an email address; here the subject is a request id, which is opaque and
 * discloses nothing. So this whole surface works with HTML alone, a refresh re-submits
 * nothing, and the refusal view is a link rather than a script.
 *
 * Note what is NOT read from the form: who may decide, and which branch this belongs to.
 * `decide_branch_request` reads the request row itself and checks the caller against it, so
 * a crafted id can only ever do what this caller could already do to that request.
 */
export async function decide(formData: FormData): Promise<void> {
  const requestId = readString(formData.get('requestId'));
  const approve = formData.get('decision') === 'approve';
  const note = readString(formData.get('note'));

  if (!requestId) redirect(back('failed'));

  const supabase = await createServerComponentClient();
  const verdict = await authorize(supabase, { action: 'access_dashboard' });
  if (!verdict.ok) redirect(back('not_yours'));

  const result = await decideRequest(supabase, {
    requestId,
    approve,
    note,
  });

  redirect(
    back(result.ok ? (approve ? 'approved' : 'refused') : result.reason),
  );
}

/** Always our own path, never anything derived from the request. */
function back(outcome: string): string {
  return `/people/requests?outcome=${outcome}`;
}

function readString(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
