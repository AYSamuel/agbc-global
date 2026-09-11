'use server';

import { redirect } from 'next/navigation';

import { createServerComponentClient } from '@/lib/supabase/server';
import {
  closeBranch,
  loadBranch,
  moveHeadquarters,
  reopenBranch,
  saveBranch,
  type ServiceRow,
} from '@/server/branches';

import {
  type ActFormState,
  type BranchFormState,
  type BranchValues,
} from './state';

/**
 * Saving a branch, closing one, opening one, moving the headquarters (docs/spec/17 §5).
 *
 * Thin, like `events/actions.ts`: everything that can go wrong lives in `server/branches.ts`
 * and, underneath it, in the column grants, the policies and the three functions, which
 * pgTAP `047` and `049` prove against a real database. This layer reads the form, calls one
 * function, and turns the answer into a redirect or into state.
 *
 * THE OUTCOME RIDES IN THE URL, the house pattern: a refresh after closing a branch
 * re-submits nothing. None of the codes names anybody (`20`).
 */

/** A form field as a string. `FormData.get` can return a File, which stringifies to junk. */
function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}

function texts(form: FormData, key: string): string[] {
  return form
    .getAll(key)
    .map((value) => (typeof value === 'string' ? value : ''));
}

/**
 * The repeatable rows, read back in the order the browser sent them.
 *
 * Repeated NAMES rather than indexed ones (`serviceLabel` four times, not
 * `services[2].label`), because `getAll` preserves document order and a form that adds and
 * removes rows client-side would otherwise have to renumber itself on every removal. The
 * arrays are zipped by position, which is exactly what the DOM guarantees.
 */
function services(form: FormData): ServiceRow[] {
  const weekdays = texts(form, 'serviceWeekday');
  const starts = texts(form, 'serviceStart');
  const kinds = texts(form, 'serviceKind');
  const labels = texts(form, 'serviceLabel');

  return weekdays.map((weekday, index) => ({
    weekday: Number(weekday),
    startTime: starts[index] ?? '',
    kind:
      kinds[index] === 'midweek' || kinds[index] === 'classes'
        ? kinds[index]
        : 'sunday',
    label: labels[index] ?? '',
  }));
}

function leaders(form: FormData): { name: string; role: string }[] {
  const names = texts(form, 'leaderName');
  const roles = texts(form, 'leaderRole');
  return names.map((name, index) => ({ name, role: roles[index] ?? '' }));
}

/**
 * What the browser sent, as the form's own values.
 *
 * `existingSlug` is the slug of the row the server has already read, and it is the ONLY
 * source of the slug on an edit. Once a branch exists the form SHOWS its short id rather
 * than offering it: `BranchForm` renders it through `Locked`, a paragraph, because the
 * UPDATE column grant (`20260820180000`) excludes the column and re-slugging a branch is a
 * different branch wearing its rows. A form with no input submits no field, so reading
 * `slug` from the request here refused every edit of every branch with "Give the branch a
 * short id.", a sentence about a box that is not on the screen. It is the same rule this
 * file already applies to the id one line above the call: the row is read server-side, and
 * what identifies it never travels in the request body.
 */
function collect(form: FormData, existingSlug?: string): BranchValues {
  return {
    slug: existingSlug ?? text(form, 'slug'),
    name: text(form, 'name'),
    city: text(form, 'city'),
    country: text(form, 'country'),
    timezone: text(form, 'timezone'),
    languages: text(form, 'languages'),
    youtubeChannelId: text(form, 'youtubeChannelId'),
    email: text(form, 'email'),
    lat: text(form, 'lat'),
    lng: text(form, 'lng'),
    addressLine1: text(form, 'addressLine1'),
    addressLine2: text(form, 'addressLine2'),
    serviceTimes: text(form, 'serviceTimes'),
    leadName: text(form, 'leadName'),
    leadRole: text(form, 'leadRole'),
    leadBio: text(form, 'leadBio'),
    welcome: text(form, 'welcome'),
    order: text(form, 'order'),
    services: services(form),
    leaders: leaders(form),
  };
}

export async function saveBranchAction(
  previous: BranchFormState,
  formData: FormData,
): Promise<BranchFormState> {
  const attempt = (previous.status === 'error' ? previous.attempt : 0) + 1;

  const supabase = await createServerComponentClient();
  const editingSlug = text(formData, 'existingSlug');

  // The row is read server-side rather than trusted from the form, for the reason every
  // module here gives: an id in a request body is the caller handing themselves a target.
  const existing = editingSlug ? await loadBranch(supabase, editingSlug) : null;

  // AFTER the row, never before: on an edit the slug comes from `existing`, not the form.
  // This also keeps the short id on screen when some OTHER field is refused, since these
  // are the values the form is re-rendered from.
  const values = collect(formData, existing?.slug);

  const result = await saveBranch(
    supabase,
    {
      slug: values.slug,
      name: values.name,
      city: values.city,
      country: values.country,
      timezone: values.timezone,
      languages: values.languages,
      youtubeChannelId: values.youtubeChannelId,
      email: values.email,
      lat: values.lat,
      lng: values.lng,
      addressLine1: values.addressLine1,
      addressLine2: values.addressLine2,
      serviceTimes: values.serviceTimes,
      lead: {
        name: values.leadName,
        role: values.leadRole,
        bio: values.leadBio,
      },
      leaders: values.leaders,
      welcome: values.welcome,
      order: values.order,
      services: values.services,
    },
    existing ?? undefined,
  );

  if (!result.ok) {
    return { status: 'error', problem: result.reason, values, attempt };
  }

  redirect(existing ? `/branches?outcome=saved` : `/branches?outcome=added`);
}

/**
 * The three acts that ask for a fresh authenticator code.
 *
 * Each reads the branch server-side, checks what only this layer can (the typed name), and
 * hands the rest to `server/branches.ts`. The typed name is checked HERE rather than in the
 * database on purpose: it is a confirmation ritual for the person, not an authorization
 * rule, and the database already refuses everything that actually matters.
 */
export async function closeBranchAction(
  _previous: ActFormState,
  formData: FormData,
): Promise<ActFormState> {
  const supabase = await createServerComponentClient();
  const branch = await loadBranch(supabase, text(formData, 'slug'));
  if (!branch) return { status: 'error', problem: 'not_found' };

  if (text(formData, 'confirmName').trim() !== branch.name) {
    return { status: 'error', problem: 'name_mismatch' };
  }

  const result = await closeBranch(supabase, branch, text(formData, 'code'));
  if (result.ok) redirect('/branches?outcome=closed');
  return { status: 'error', problem: result.reason };
}

export async function reopenBranchAction(
  _previous: ActFormState,
  formData: FormData,
): Promise<ActFormState> {
  const supabase = await createServerComponentClient();
  const branch = await loadBranch(supabase, text(formData, 'slug'));
  if (!branch) return { status: 'error', problem: 'not_found' };

  const result = await reopenBranch(supabase, branch, text(formData, 'code'));
  if (result.ok) redirect('/branches?outcome=reopened');
  return { status: 'error', problem: result.reason };
}

export async function moveHeadquartersAction(
  _previous: ActFormState,
  formData: FormData,
): Promise<ActFormState> {
  const supabase = await createServerComponentClient();
  const branch = await loadBranch(supabase, text(formData, 'slug'));
  if (!branch) return { status: 'error', problem: 'not_found' };

  const result = await moveHeadquarters(
    supabase,
    branch,
    text(formData, 'code'),
  );
  if (result.ok) redirect('/branches?outcome=hq-moved');
  return { status: 'error', problem: result.reason };
}
