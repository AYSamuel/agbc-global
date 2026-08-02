'use server';

import { redirect } from 'next/navigation';

import { createServerComponentClient } from '@/lib/supabase/server';
import { authorize } from '@/server/authorize';
import {
  LANGUAGES,
  parsePaste,
  removeVerse,
  runImport,
  saveVerse,
  type Language,
} from '@/server/verses';

import type { CheckState } from './state';

/**
 * The four things the verse screens do (docs/spec/17 §48, frames approved in PR #119).
 *
 * Thin, like `people/requests/actions.ts`: everything that can go wrong lives in
 * `server/verses.ts` and in `import_daily_verses`, which is tested against a real database.
 * This layer parses the form, re-checks authority, and turns a result into either a state
 * or an outcome code.
 *
 * THREE OF THE FOUR REDIRECT WITH THE OUTCOME IN THE URL, the house pattern: a refresh
 * after saving re-submits nothing, and `/verses` already reads those codes. `check` cannot
 * join them, and the reason is size rather than privacy: a 360-row paste does not fit in a
 * query string, so the preview comes back as state.
 *
 * AUTHORITY IS RE-READ IN EVERY ONE. A Server Action is its own entry point, reachable by
 * anyone who can POST to it, so `authorize({ action: 'manage_verses' })` runs again here
 * and does not trust the page that rendered the form. CSRF needs no explicit check: Next
 * compares Origin against Host for every Server Action, which is the same defence
 * `sameOrigin.ts` gives the route handlers that get no such thing for free.
 */

export async function check(
  _previous: CheckState,
  formData: FormData,
): Promise<CheckState> {
  const paste = readString(formData.get('paste'));
  if (!paste) return { status: 'failed', reason: 'empty' };

  const supabase = await createServerComponentClient();
  const verdict = await authorize(supabase, { action: 'manage_verses' });
  if (!verdict.ok) return { status: 'failed', reason: 'refused' };

  const rows = parsePaste(paste);
  if (rows.length === 0) return { status: 'failed', reason: 'empty' };

  try {
    // The dry run's `replace_existing` changes only what it would APPLY, which is zero
    // here; the three counts the screen shows do not depend on it. The choice between
    // keeping and replacing is made after these numbers are read, not before.
    const result = await runImport(supabase, rows, {
      replaceExisting: false,
      dryRun: true,
    });
    return { status: 'checked', rows: rows.length, result };
  } catch {
    return { status: 'failed', reason: 'failed' };
  }
}

/**
 * The write, from the same paste the preview was computed from.
 *
 * The rows are parsed again rather than carried over from the preview, so the promise the
 * screen makes ("nothing is saved until you have seen what it will do") holds all the way
 * down: same text, same parser, same database function. Anything else would be a second
 * description of the batch, free to disagree with the first.
 */
export async function apply(formData: FormData): Promise<void> {
  const paste = readString(formData.get('paste'));
  const replaceExisting = formData.get('conflicts') === 'replace';
  if (!paste) redirect(back('nothing'));

  const supabase = await createServerComponentClient();
  const verdict = await authorize(supabase, { action: 'manage_verses' });
  if (!verdict.ok) redirect('/verses');

  let outcome: string;
  try {
    const result = await runImport(supabase, parsePaste(paste), {
      replaceExisting,
      dryRun: false,
    });
    outcome =
      result.applied > 0 ? `imported:${String(result.applied)}` : 'nothing';
  } catch {
    outcome = 'import_failed';
  }

  // Outside the try, deliberately: redirect() works by throwing, and a catch that swallowed
  // it would leave the reader on a screen that had already written 312 verses.
  redirect(back(outcome));
}

/**
 * One verse, saved through the batch function, so a single edit and a 360-row paste cannot
 * validate differently (`server/verses.ts`).
 *
 * `originalDate` and `originalLanguage` come from the form, and what they can do is bounded:
 * the pair names WHICH row to clear after a move, and the delete policy decides whether the
 * caller may clear it. An admin may remove any verse already, so a crafted pair grants
 * nothing (the same reasoning as the moderation action's item id).
 */
export async function save(formData: FormData): Promise<void> {
  const date = readString(formData.get('date'));
  const language = readLanguage(formData.get('language'));
  const reference = readString(formData.get('reference'));
  const text = readString(formData.get('text'));
  const translation = readString(formData.get('translation')) ?? 'WEB';
  const originalDate = readString(formData.get('originalDate'));
  const originalLanguage = readLanguage(formData.get('originalLanguage'));

  if (!date || !language || !reference || !text) redirect(back('invalid'));

  const supabase = await createServerComponentClient();
  const verdict = await authorize(supabase, { action: 'manage_verses' });
  if (!verdict.ok) redirect('/verses');

  let outcome: string;
  try {
    const result = await saveVerse(supabase, {
      date,
      language,
      reference,
      text,
      translation,
    });

    if (!result.ok) {
      outcome = result.reason === 'invalid' ? 'invalid' : 'failed';
    } else if (
      originalDate !== undefined &&
      originalLanguage !== undefined &&
      (originalDate !== date || originalLanguage !== language)
    ) {
      // The day it came from is cleared AFTER the new one is written, so a failure leaves
      // the verse scheduled twice rather than not at all. `gone` means there was nothing
      // there to clear, which is the outcome we wanted anyway.
      const cleared = await removeVerse(
        supabase,
        originalDate,
        originalLanguage,
      );
      outcome =
        cleared.ok || cleared.reason === 'gone' ? 'saved' : 'moved_partly';
    } else {
      outcome = 'saved';
    }
  } catch {
    outcome = 'failed';
  }

  redirect(back(outcome));
}

export async function remove(formData: FormData): Promise<void> {
  const date = readString(formData.get('originalDate'));
  const language = readLanguage(formData.get('originalLanguage'));
  if (!date || !language) redirect(back('failed'));

  const supabase = await createServerComponentClient();
  const verdict = await authorize(supabase, { action: 'manage_verses' });
  if (!verdict.ok) redirect('/verses');

  let outcome: string;
  try {
    const result = await removeVerse(supabase, date, language);
    outcome = result.ok ? 'removed' : result.reason;
  } catch {
    outcome = 'failed';
  }

  redirect(back(outcome));
}

/** Always our own path, never anything derived from the request. */
function back(outcome: string): string {
  return `/verses?outcome=${outcome}`;
}

function readString(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readLanguage(value: FormDataEntryValue | null): Language | undefined {
  const raw = readString(value);
  return LANGUAGES.find((language) => language === raw);
}
