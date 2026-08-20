'use server';

import { redirect } from 'next/navigation';

import { createServerComponentClient } from '@/lib/supabase/server';
import {
  approveBroadcast,
  haltBroadcast,
  rejectBroadcast,
  saveDraft,
  submitBroadcast,
  type BroadcastScope,
} from '@/server/broadcasts';

import { type ComposeState, type ComposeValues } from './state';

/**
 * The four things a staff member does to a broadcast that already exists (docs/spec/17 §2).
 *
 * Thin, like `verses/actions.ts`: everything that can go wrong lives in
 * `server/broadcasts.ts` and, underneath it, in the SQL action functions, which are tested
 * against a real database in pgTAP `043`. This layer reads the form, calls one function, and
 * turns the answer into a redirect.
 *
 * THE OUTCOME RIDES IN THE URL, the house pattern: a refresh after approving re-submits
 * nothing, and the page already reads these codes. Nothing member-identifying goes in a
 * query string (`20`), and none of these codes names anybody.
 */

type Outcome =
  'approved' | 'sent-back' | 'submitted' | 'stopped' | 'refused' | 'raced';

function back(outcome: Outcome): never {
  redirect(`/broadcasts?outcome=${outcome}`);
}

/**
 * A refusal from the database is a RACE, not a fault, and is reported as one.
 *
 * Two admins looking at the same queue is the normal case here, not the exceptional one, so
 * "somebody got there first" is the honest sentence rather than an error. The distinction
 * matters: `42501` means this caller may not, and `23514` means the row has moved on.
 */
function outcomeFor(reason: string): Outcome {
  return reason.includes('cannot be approved by its author') ||
    reason.includes('only an admin') ||
    reason.includes('only the author')
    ? 'refused'
    : 'raced';
}

/**
 * A form field as a string.
 *
 * `FormData.get` can return a File, and stringifying one gives "[object File]" rather than
 * failing, which would sail a nonsense id straight into an RPC. Narrowing is the fix, not a
 * cast.
 */
function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}

export async function submitAction(formData: FormData): Promise<never> {
  const id = text(formData, 'id');
  const supabase = await createServerComponentClient();
  const result = await submitBroadcast(supabase, id);
  back(result.ok ? 'submitted' : outcomeFor(result.reason));
}

export async function approveAction(formData: FormData): Promise<never> {
  const id = text(formData, 'id');
  const supabase = await createServerComponentClient();
  const result = await approveBroadcast(supabase, id);
  back(result.ok ? 'approved' : outcomeFor(result.reason));
}

export async function rejectAction(formData: FormData): Promise<never> {
  const id = text(formData, 'id');
  const note = text(formData, 'note');
  const supabase = await createServerComponentClient();
  const result = await rejectBroadcast(supabase, id, note);
  back(result.ok ? 'sent-back' : outcomeFor(result.reason));
}

export async function haltAction(formData: FormData): Promise<never> {
  const id = text(formData, 'id');
  const supabase = await createServerComponentClient();
  const result = await haltBroadcast(supabase, id);
  back(result.ok ? 'stopped' : outcomeFor(result.reason));
}

/**
 * Save a draft and go to the confirmation screen.
 *
 * Returns STATE rather than redirecting on failure, unlike the four actions above, and the
 * reason is what a failure costs the reader: a refused link means everything they typed is
 * still on screen and still theirs. A redirect with a code in the URL would throw the
 * message away to report the problem with it.
 *
 * The success path does redirect, because by then the draft exists and the URL should name
 * it: a refresh on the confirmation screen re-reads a row rather than re-submitting a form.
 */
export async function saveDraftAction(
  previous: ComposeState,
  formData: FormData,
): Promise<ComposeState> {
  const attempt = (previous.status === 'error' ? previous.attempt : 0) + 1;

  const values: ComposeValues = {
    scope: text(formData, 'scope'),
    title: text(formData, 'title'),
    body: text(formData, 'body'),
    bodyDe: text(formData, 'bodyDe'),
    bodyNl: text(formData, 'bodyNl'),
    bodyFr: text(formData, 'bodyFr'),
    link: text(formData, 'link'),
  };

  const title = values.title.trim();
  const body = values.body.trim();
  if (title === '' || body === '') {
    return { status: 'error', problem: 'empty', values, attempt };
  }

  const scope: BroadcastScope =
    values.scope === 'ministry' ? 'ministry' : 'branch';

  const supabase = await createServerComponentClient();
  const result = await saveDraft(supabase, {
    id: text(formData, 'id') || undefined,
    scope,
    title,
    body,
    bodyDe: values.bodyDe,
    bodyNl: values.bodyNl,
    bodyFr: values.bodyFr,
    link: values.link,
  });

  if (!result.ok) {
    return {
      status: 'error',
      values,
      attempt,
      problem:
        result.reason === 'link_not_allowed'
          ? 'link_not_allowed'
          : result.reason === 'link_malformed'
            ? 'link_malformed'
            : 'refused',
    };
  }

  redirect(`/broadcasts/${result.id}/confirm`);
}
