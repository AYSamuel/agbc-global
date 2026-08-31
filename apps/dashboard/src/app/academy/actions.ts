'use server';

import { redirect } from 'next/navigation';

import { createServerComponentClient } from '@/lib/supabase/server';
import { authorize } from '@/server/authorize';
import {
  linkRegistration,
  loadRegistration,
  setRegistrationAside,
  unlinkRegistration,
} from '@/server/registrations';

/**
 * The three writes behind the Academy screens (#164, docs/spec/17 §4).
 *
 * Thin, like `moderation/actions.ts` and `branches/actions.ts`: everything that can go wrong
 * lives in `server/registrations.ts` and, beneath it, in four definer routines that pgTAP
 * `052` proves against a real database. This layer reads the form, re-checks authority,
 * calls one function and turns the answer into a redirect.
 *
 * AUTHORITY IS RE-READ HERE rather than trusted from the page that rendered the form. A
 * Server Action is its own entry point, reachable by anyone who can POST to it, so
 * `authorize()` runs again in every one of them. CSRF needs no explicit check: Next compares
 * Origin against Host for every Server Action, which is the same defence `sameOrigin.ts`
 * gives the route handlers that get no such thing for free.
 *
 * THE OUTCOME RIDES IN THE URL, the house pattern, so a refresh after attaching a
 * registration re-submits nothing. None of the codes names anybody, and none carries an
 * address: `20` keeps PII out of URLs, where it lands in server logs, browser history and
 * any `Referer`. Ids are uuids, which name nobody on their own.
 */

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * The view to return to, and only ever one of the three.
 *
 * It arrives from a hidden field, so it was going into `?view=${view}` verbatim. A value of
 * `waiting&outcome=linked&x` produced `?view=waiting&outcome=linked&x&outcome=gone`, and the
 * page reads the FIRST occurrence of a repeated parameter, so a failed act announced
 * "Attached. They are told within a minute or two." Nobody could do that to anybody else
 * (Next compares Origin against Host on every Server Action, and the field is our own), which
 * makes it a correctness bug rather than a hole; the fix is the same either way, and this is
 * the "validate at every boundary" line in ~/.claude/standards/backend.md.
 */
function view(form: FormData): 'waiting' | 'aside' | 'linked' {
  const value = text(form, 'view');
  return value === 'aside' || value === 'linked' ? value : 'waiting';
}

/** Every action asks the same question first. */
async function admin() {
  const supabase = await createServerComponentClient();
  const verdict = await authorize(supabase, { action: 'link_registrations' });
  return { supabase, ok: verdict.ok } as const;
}

export async function setAsideAction(formData: FormData): Promise<void> {
  const registrationId = text(formData, 'registrationId');
  const aside = text(formData, 'aside') === 'true';
  const from = view(formData);

  const { supabase, ok } = await admin();
  if (!ok) redirect('/academy?outcome=refused');

  const result = await setRegistrationAside(supabase, {
    registrationId,
    aside,
  });

  if (!result.ok) redirect(`/academy?view=${from}&outcome=${result.reason}`);

  // Back to the view they were working, with the undo beside the result: setting aside is a
  // judgement about a stranger made from four fields, and the undo is the whole mitigation
  // (SPEC decision 4). Bringing one back returns to the set-aside list rather than to the
  // queue, because that is the list they are working through.
  redirect(
    aside
      ? `/academy?outcome=set_aside&undo=${registrationId}`
      : '/academy?view=aside&outcome=brought_back',
  );
}

export async function linkAction(formData: FormData): Promise<void> {
  const registrationId = text(formData, 'registrationId');
  const memberId = text(formData, 'memberId');

  const { supabase, ok } = await admin();
  if (!ok) redirect('/academy?outcome=refused');

  const result = await linkRegistration(supabase, { registrationId, memberId });
  if (result.ok) redirect('/academy?outcome=linked');

  // The two address collisions go BACK to the link screen, which renders the refusal in
  // full: they are the mis-link this tool is most dangerous for, and "that did not go
  // through" at the top of a queue is not enough to act on. Everything else is a state the
  // queue itself can explain, INCLUDING `already_enrolled`: what it asks for (check the
  // refund, then set this row aside) is done from the queue, not from the link screen.
  if (
    result.reason === 'address_taken' ||
    result.reason === 'address_is_signin'
  ) {
    redirect(
      `/academy/${registrationId}/link?member=${memberId}&problem=${result.reason}`,
    );
  }

  // `set_aside` is the module's word for a refusal AND for a success, so the failure takes a
  // distinct code on the way into the URL. Without this, failing to link a set-aside row
  // would report "Set aside. It is out of the working queue.", which is true of the row and
  // a lie about what just happened.
  redirect(
    `/academy?outcome=${result.reason === 'set_aside' ? 'set_aside_first' : result.reason}`,
  );
}

export async function unlinkAction(formData: FormData): Promise<void> {
  const registrationId = text(formData, 'registrationId');
  const typed = text(formData, 'confirmName');

  const { supabase, ok } = await admin();
  if (!ok) redirect('/academy?outcome=refused');

  const { registration } = await loadRegistration(supabase, registrationId);
  if (!registration?.member) redirect('/academy?view=linked&outcome=gone');

  // The typed name is checked HERE and not in the database, on purpose and for the reason
  // the branches module gives: it is a confirmation ritual for the person, not an
  // authorization rule, and `unlink_registration` already refuses everything that matters.
  if (typed !== registration.member.displayName) {
    redirect(`/academy/${registrationId}/unlink?problem=name_mismatch`);
  }

  const result = await unlinkRegistration(supabase, registrationId);
  if (result.ok) redirect('/academy?view=linked&outcome=unlinked');
  redirect(`/academy?view=linked&outcome=${result.reason}`);
}
