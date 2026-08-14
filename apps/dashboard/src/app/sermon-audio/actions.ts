'use server';

import { redirect } from 'next/navigation';

import { createServerComponentClient } from '@/lib/supabase/server';
import { authorize } from '@/server/authorize';
import {
  AUDIO_EXTENSIONS,
  attachAudio,
  createAudioOnlySermon,
  mintUpload,
  removeAudio,
} from '@/server/sermonAudio';

import type { MintResult, SaveState } from './state';

/**
 * The shelf's four doors (frames approved 2026-08-14; slice plan
 * `docs/spec/plans/W3.1-audio-slice.md`).
 *
 * Thin, like `verses/actions.ts`: everything that can go wrong lives in
 * `server/sermonAudio.ts`, tested against a real stack. This layer parses, re-checks
 * authority, and turns a result into a state or a redirect.
 *
 * AUTHORITY IS RE-READ IN EVERY ONE. A Server Action is its own entry point, reachable
 * by anyone who can POST to it, so `authorize({ action: 'manage_sermon_audio' })` runs
 * again here and does not trust the page that rendered the form. CSRF needs no explicit
 * check: Next compares Origin against Host for every Server Action.
 *
 * Successes redirect with the outcome in the URL (a refresh re-submits nothing); the
 * failures a form must explain while keeping what was typed come back as state.
 */

export async function mintUploadAction(extension: string): Promise<MintResult> {
  const known = AUDIO_EXTENSIONS.find((ext) => ext === extension);
  if (!known) return { ok: false, reason: 'failed' };

  const supabase = await createServerComponentClient();
  const verdict = await authorize(supabase, { action: 'manage_sermon_audio' });
  if (!verdict.ok) return { ok: false, reason: 'refused' };

  return await mintUpload(supabase, known);
}

export async function attachAudioAction(
  _previous: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const sermonId = readString(formData.get('sermonId'));
  const path = readString(formData.get('path'));
  const durationSec = readInt(formData.get('durationSec'));
  const speaker = readString(formData.get('speaker'));
  const series = readString(formData.get('series'));
  if (!sermonId || !path || durationSec === undefined || !speaker) {
    return { status: 'failed', reason: 'invalid' };
  }

  const supabase = await createServerComponentClient();
  const verdict = await authorize(supabase, { action: 'manage_sermon_audio' });
  if (!verdict.ok) return { status: 'failed', reason: 'refused' };

  const outcome = await attachAudio(supabase, {
    sermonId,
    path,
    durationSec,
    speaker,
    series: series ?? null,
  });
  if (!outcome.ok) return { status: 'failed', reason: outcome.reason };

  redirect(`/sermon-audio?outcome=${outcome.replaced ? 'replaced' : 'saved'}`);
}

export async function createAudioOnlyAction(
  _previous: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const title = readString(formData.get('title'));
  const publishedOn = readString(formData.get('publishedOn'));
  const path = readString(formData.get('path'));
  const durationSec = readInt(formData.get('durationSec'));
  const speaker = readString(formData.get('speaker'));
  const series = readString(formData.get('series'));
  if (
    !title ||
    !publishedOn ||
    !path ||
    durationSec === undefined ||
    !speaker
  ) {
    return { status: 'failed', reason: 'invalid' };
  }

  const supabase = await createServerComponentClient();
  const verdict = await authorize(supabase, { action: 'manage_sermon_audio' });
  if (!verdict.ok) return { status: 'failed', reason: 'refused' };

  const outcome = await createAudioOnlySermon(supabase, {
    title,
    speaker,
    series: series ?? null,
    publishedOn,
    path,
    durationSec,
  });
  if (!outcome.ok) return { status: 'failed', reason: outcome.reason };

  redirect('/sermon-audio?outcome=created');
}

export async function removeAudioAction(formData: FormData): Promise<void> {
  const sermonId = readString(formData.get('sermonId'));
  if (!sermonId) redirect(back('failed'));

  const supabase = await createServerComponentClient();
  const verdict = await authorize(supabase, { action: 'manage_sermon_audio' });
  if (!verdict.ok) redirect('/sermon-audio');

  const outcome = await removeAudio(supabase, sermonId);
  if (outcome.ok) redirect(back('removed'));

  // Stable outcome codes; `copy/en.ts` owns the English (sermonAudio.outcome).
  const codes: Record<string, string> = {
    gone: 'gone',
    no_audio: 'no_audio',
    audio_only: 'audio_only',
    refused: 'refused',
    failed: 'failed',
  };
  redirect(back(codes[outcome.reason] ?? 'failed'));
}

/** Always our own path, never anything derived from the request. */
function back(outcome: string): string {
  return `/sermon-audio?outcome=${outcome}`;
}

function readString(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readInt(value: FormDataEntryValue | null): number | undefined {
  const raw = readString(value);
  if (!raw || !/^\d+$/.test(raw)) return undefined;
  return Number.parseInt(raw, 10);
}
