'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { PageHeader } from '@/components/PageHeader';
import { Alert } from '@/components/ui/Alert';
import { Notice } from '@/components/ui/Notice';
import { copy } from '@/copy/en';

import { CONTROL, FIELD, HINT, LABEL } from '../people/fields';
import { isNextRedirect } from './AttachPanel';
import { AudioUploader, type UploaderSeams } from './AudioUploader';
import {
  NOT_SAVED,
  type MintAction,
  type SaveAction,
  type SaveProblem,
  type SaveState,
} from './state';

/**
 * A message that was never on YouTube at all (frame: `SERMON-AUDIO-NEW`, approved
 * 2026-08-14): a midweek word, a prayer meeting, anything the church records without
 * filming. It appears in Watch like any other message, with an audio cover in place of
 * a video player; the app has rendered that state since W1.3.
 *
 * Same shape as `AttachPanel`: the frame's field order, Create hidden inside the
 * uploader until a file has uploaded and read cleanly, failures as state so everything
 * typed survives them.
 */
export function NewMessagePanel({
  create,
  mint,
  seams,
}: {
  create: SaveAction;
  mint: MintAction;
  seams?: UploaderSeams;
}) {
  const [state, submit] = useActionState(guarded(create), NOT_SAVED);
  const text = copy.sermonAudio.create;
  const attach = copy.sermonAudio.attach;

  return (
    <>
      <PageHeader title={text.title} scope={text.scope} />

      {state.status === 'failed' && state.reason === 'not_audio' ? (
        <Notice tone="bad" live="assertive" title={attach.wrongKindTitle}>
          {attach.wrongKindBody}
        </Notice>
      ) : null}
      {state.status === 'failed' && state.reason !== 'not_audio' ? (
        <div className="mt-4">
          <Alert>{PROBLEMS[state.reason]}</Alert>
        </div>
      ) : null}

      <form action={submit}>
        <div className={FIELD}>
          <label htmlFor="new-title" className={LABEL}>
            {text.titleLabel}
          </label>
          <input
            id="new-title"
            name="title"
            required
            maxLength={200}
            className={CONTROL}
          />
        </div>
        <div className={FIELD}>
          <label htmlFor="new-speaker" className={LABEL}>
            {attach.speakerLabel}
          </label>
          <input
            id="new-speaker"
            name="speaker"
            required
            maxLength={120}
            className={CONTROL}
          />
        </div>
        <div className={FIELD}>
          <label htmlFor="new-series" className={LABEL}>
            {attach.seriesLabel}
          </label>
          <input
            id="new-series"
            name="series"
            maxLength={120}
            placeholder={attach.seriesPlaceholder}
            className={CONTROL}
          />
        </div>
        <div className={FIELD}>
          <label htmlFor="new-date" className={LABEL}>
            {text.dateLabel}
          </label>
          <input
            id="new-date"
            name="publishedOn"
            required
            pattern="\d{4}-\d{2}-\d{2}"
            placeholder={text.datePlaceholder}
            aria-describedby="new-date-hint"
            className={CONTROL}
          />
          <p id="new-date-hint" className={HINT}>
            {text.dateHint}
          </p>
        </div>

        <div className={FIELD} style={{ maxWidth: '40rem' }}>
          <span className={LABEL}>{attach.fileLabel}</span>
          <AudioUploader
            mint={mint}
            submitLabel={text.submit}
            submittingLabel={text.submitting}
            seams={seams}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <Link
            href="/sermon-audio"
            className="inline-flex min-h-12 items-center px-2 text-body font-semibold text-blue underline-offset-4 hover:underline"
          >
            {attach.cancel}
          </Link>
        </div>
      </form>
    </>
  );
}

const PROBLEMS: Record<Exclude<SaveProblem, 'not_audio'>, string> = {
  missing: copy.sermonAudio.attach.uploadFailed,
  gone: copy.sermonAudio.attach.goneBody,
  invalid: copy.sermonAudio.create.dateRequired,
  refused: copy.sermonAudio.attach.refusedBody,
  offline: copy.sermonAudio.attach.offline,
  failed: copy.sermonAudio.attach.failedBody,
};

/** The network, told apart from a bug; a success's redirect keeps flying. */
function guarded(save: SaveAction): SaveAction {
  return async (previous: SaveState, formData: FormData) => {
    try {
      return await save(previous, formData);
    } catch (error) {
      if (isNextRedirect(error)) throw error;
      return {
        status: 'failed',
        reason: error instanceof TypeError ? 'offline' : 'failed',
      };
    }
  };
}
