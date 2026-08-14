'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { PageHeader } from '@/components/PageHeader';
import { Alert } from '@/components/ui/Alert';
import { Notice } from '@/components/ui/Notice';
import { copy } from '@/copy/en';

import { CONTROL, FIELD, HINT, LABEL } from '../people/fields';
import { AudioUploader, type UploaderSeams } from './AudioUploader';
import {
  NOT_SAVED,
  type MintAction,
  type SaveAction,
  type SaveProblem,
  type SaveState,
} from './state';

/**
 * Add or replace the audio on one message (frames: `SERMON-AUDIO-ATTACH`, all three
 * moments; approved 2026-08-14).
 *
 * The frame's order holds: the file first, the metadata under it, one way out at the
 * bottom. Save lives inside the uploader's "uploaded and read" moment (hidden until
 * there is something to save); the speaker field is `required`, so a Save pressed with
 * it empty is caught by the browser at the field, input preserved.
 *
 * Failures come back as state rather than a redirect so everything typed stays put
 * (frontend.md). The one that deserves its own banner is `not_audio`: the server read
 * the file's own bytes, refused, and discarded the upload, which is worth saying in
 * full (frame: "if the file is not what it claims").
 */
export function AttachPanel({
  sermonId,
  scopeLine,
  speaker,
  series,
  attach,
  mint,
  seams,
}: {
  sermonId: string;
  scopeLine: string;
  speaker: string;
  series: string | null;
  attach: SaveAction;
  mint: MintAction;
  seams?: UploaderSeams;
}) {
  const [state, submit] = useActionState(guarded(attach), NOT_SAVED);
  const text = copy.sermonAudio.attach;

  return (
    <>
      <PageHeader title={text.title} scope={scopeLine} />

      {state.status === 'failed' && state.reason === 'not_audio' ? (
        <Notice tone="bad" live="assertive" title={text.wrongKindTitle}>
          {text.wrongKindBody}
        </Notice>
      ) : null}
      {state.status === 'failed' && state.reason !== 'not_audio' ? (
        <div className="mt-4">
          <Alert>{PROBLEMS[state.reason]}</Alert>
        </div>
      ) : null}

      <form action={submit}>
        <input type="hidden" name="sermonId" value={sermonId} />

        <div className={FIELD} style={{ maxWidth: '40rem' }}>
          <span className={LABEL}>{text.fileLabel}</span>
          <AudioUploader
            mint={mint}
            submitLabel={text.save}
            submittingLabel={text.saving}
            seams={seams}
          />
        </div>

        <div className={FIELD}>
          <label htmlFor="attach-speaker" className={LABEL}>
            {text.speakerLabel}
          </label>
          <input
            id="attach-speaker"
            name="speaker"
            required
            maxLength={120}
            defaultValue={speaker}
            className={CONTROL}
          />
        </div>
        <div className={FIELD}>
          <label htmlFor="attach-series" className={LABEL}>
            {text.seriesLabel}
          </label>
          <input
            id="attach-series"
            name="series"
            maxLength={120}
            defaultValue={series ?? ''}
            placeholder={text.seriesPlaceholder}
            aria-describedby="attach-prefilled-hint"
            className={CONTROL}
          />
          <p id="attach-prefilled-hint" className={HINT}>
            {text.prefilledHint}
          </p>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <Link
            href="/sermon-audio"
            className="inline-flex min-h-12 items-center px-2 text-body font-semibold text-blue underline-offset-4 hover:underline"
          >
            {text.cancel}
          </Link>
        </div>
      </form>
    </>
  );
}

const PROBLEMS: Record<Exclude<SaveProblem, 'not_audio'>, string> = {
  missing: copy.sermonAudio.attach.uploadFailed,
  gone: copy.sermonAudio.attach.goneBody,
  invalid: copy.sermonAudio.attach.speakerRequired,
  refused: copy.sermonAudio.attach.refusedBody,
  offline: copy.sermonAudio.attach.offline,
  failed: copy.sermonAudio.attach.failedBody,
};

/** The network, told apart from a bug (the `ImportPanel` wrapper). */
function guarded(save: SaveAction): SaveAction {
  return async (previous: SaveState, formData: FormData) => {
    try {
      return await save(previous, formData);
    } catch (error) {
      // Next's redirect() works by throwing; a success must keep flying.
      if (isNextRedirect(error)) throw error;
      return {
        status: 'failed',
        reason: error instanceof TypeError ? 'offline' : 'failed',
      };
    }
  };
}

export function isNextRedirect(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('digest' in error)) {
    return false;
  }
  const digest = error.digest;
  return typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT');
}
