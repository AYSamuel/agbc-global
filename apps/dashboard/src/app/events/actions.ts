'use server';

import { redirect } from 'next/navigation';

import { createServerComponentClient } from '@/lib/supabase/server';
import {
  loadEvent,
  saveEvent,
  setEventStatus,
  type EventStatus,
} from '@/server/events';
import { authorize } from '@/server/authorize';
import { mintEventImageUpload } from '@/server/eventImages';
import { IMAGE_EXTENSIONS } from '@/server/imageShelf';

import type { MintResult } from '@/app/sermon-audio/state';

import { type EventFormState, type EventValues } from './state';

/**
 * Saving an event, and turning one off or back on (docs/spec/17 §3, `11`).
 *
 * Thin, like `broadcasts/actions.ts`: everything that can go wrong lives in
 * `server/events.ts` and, underneath it, in RLS and the update guard, which pgTAP `046`
 * proves against a real database. This layer reads the form, calls one function, and turns
 * the answer into a redirect or into state.
 *
 * THE OUTCOME RIDES IN THE URL, the house pattern: a refresh after cancelling re-submits
 * nothing. None of the codes names anybody (`20`).
 */

type Outcome =
  | 'posted'
  | 'posted-ministry'
  | 'saved'
  | 'saved-and-told'
  | 'cancelled'
  | 'reinstated'
  | 'already-started'
  | 'refused'
  | 'failed';

/**
 * A form field as a string.
 *
 * `FormData.get` can return a File, and stringifying one gives "[object File]" rather than
 * failing, which would sail a nonsense id straight into a query.
 */
function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}

/**
 * A one-shot door for one picture upload (W3.5 slice 4b).
 *
 * The NAME is minted here, server-side and after authorize(), never in the browser: these
 * URLs are public and permanent, so a filename a human chose would be a permanent public
 * string, and on an event picture that is exactly where a member's name would end up.
 *
 * `manage_events` rather than `manage_ministry_events`: a leader posting for their own
 * branch is the caller this slice exists for, and which EVENT the picture may land on is
 * decided later by the events row policy, not here.
 */
export async function mintEventImageAction(
  extension: string,
): Promise<MintResult> {
  const known = IMAGE_EXTENSIONS.find((ext) => ext === extension);
  if (!known) return { ok: false, reason: 'failed' };

  const supabase = await createServerComponentClient();
  const verdict = await authorize(supabase, { action: 'manage_events' });
  if (!verdict.ok) return { ok: false, reason: 'refused' };

  return await mintEventImageUpload(supabase, known);
}

/**
 * What the form is saying about the picture, in the three states a form can say it.
 *
 * Separate from `text()` because the distinction it draws is between a field that is absent
 * and a field that is empty, and `text()` deliberately flattens both to ''.
 */
function pictureFrom(form: FormData): { imagePath?: string | null } {
  if (form.get('removeImage') !== null) return { imagePath: null };
  const value = form.get('imagePath');
  if (typeof value !== 'string' || value === '') return {};
  return { imagePath: value };
}

export async function saveEventAction(
  previous: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const attempt = (previous.status === 'error' ? previous.attempt : 0) + 1;

  const values: EventValues = {
    scope: text(formData, 'scope'),
    title: text(formData, 'title'),
    description: text(formData, 'description'),
    startsAtLocal: text(formData, 'startsAtLocal'),
    endsAtLocal: text(formData, 'endsAtLocal'),
    location: text(formData, 'location'),
    // An unchecked checkbox sends nothing at all, which is how "off" travels in a form.
    rsvpEnabled: formData.get('rsvpEnabled') !== null,
  };

  const id = text(formData, 'id') || undefined;
  const supabase = await createServerComponentClient();

  // The row is read server-side before the save, for two things this layer cannot get from
  // the form: which branch the event belongs to (a branch id in a request body would hand
  // the caller their own authority) and whether the plan is about to change, which decides
  // what the outcome message may honestly promise.
  const existing = id ? await readExisting(supabase, id) : null;

  const result = await saveEvent(
    supabase,
    {
      id,
      scope: values.scope === 'ministry' ? 'ministry' : 'branch',
      title: values.title,
      description: values.description,
      startsAtLocal: values.startsAtLocal,
      endsAtLocal: values.endsAtLocal,
      location: values.location,
      rsvpEnabled: values.rsvpEnabled,
      // THREE STATES, and collapsing any two of them loses a real case. A path means a
      // picture was just uploaded; the empty string means Remove was ticked; and the field
      // absent entirely means the form is not speaking about the picture, which is every
      // ordinary edit and must leave it exactly where it was.
      ...pictureFrom(formData),
    },
    existing ?? undefined,
  );

  if (!result.ok) {
    return { status: 'error', problem: result.reason, values, attempt };
  }

  if (!existing) {
    redirect(
      `/events?outcome=${values.scope === 'ministry' ? 'posted-ministry' : 'posted'}`,
    );
  }

  // Only "the plan changed" reaches anybody (decision 2, docs/spec/11): the same comparison
  // the notice job makes, made here only to choose which sentence the leader reads.
  const planChanged =
    normalize(existing.startsAtLocal) !== normalize(values.startsAtLocal) ||
    existing.location.trim() !== values.location.trim();

  redirect(`/events?outcome=${planChanged ? 'saved-and-told' : 'saved'}`);
}

/**
 * '2026-09-12T10:00' and '2026-09-12T10:00:00' are the same minute.
 *
 * `datetime-local` submits without seconds and PostgREST returns them, so a straight string
 * comparison would call every save a reschedule and promise the leader a notification that
 * the database, comparing timestamps properly, is never going to send.
 */
function normalize(value: string): string {
  return value.trim().slice(0, 16);
}

async function readExisting(
  supabase: Awaited<ReturnType<typeof createServerComponentClient>>,
  id: string,
) {
  const verdict = await authorize(supabase, { action: 'access_dashboard' });
  if (!verdict.ok) return null;
  return await loadEvent(supabase, verdict.caller, id);
}

export async function setStatusAction(formData: FormData): Promise<never> {
  const id = text(formData, 'id');
  const status: EventStatus =
    text(formData, 'status') === 'cancelled' ? 'cancelled' : 'scheduled';

  const supabase = await createServerComponentClient();
  const existing = await readExisting(supabase, id);
  if (!existing) redirect('/events?outcome=refused');

  const result = await setEventStatus(supabase, existing, status);
  if (result.ok) {
    redirect(
      `/events?outcome=${status === 'cancelled' ? 'cancelled' : 'reinstated'}`,
    );
  }

  const outcome: Outcome =
    result.reason === 'already_started' ? 'already-started' : 'refused';
  redirect(`/events?outcome=${outcome}`);
}
