'use client';

import { useEffect, useId, useRef, useState } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Notice } from '@/components/ui/Notice';
import { copy } from '@/copy/en';
import { MAX_IMAGE_BYTES } from '@/server/imageShelf';

import { wholeKb, wholeMb } from '@/app/sermon-audio/format';
import type { MintAction } from '@/app/sermon-audio/state';
import { uploadViaXhr, type UploadFn } from '@/app/sermon-audio/upload';

import { ImagePreview, type ImageSubject } from './ImagePreview';

/**
 * A picture field: choose, upload, and hand the form a PATH (frames: `SERMON-AUDIO-ARTWORK`
 * four moments, and `NEW EVENT` · Picture).
 *
 * Lifted out of `sermon-audio/` in W3.5 slice 4b, when events needed the same field. Copying
 * it would have been two upload paths to keep in step, which is the drift `upload.ts` was
 * extracted to prevent one layer down; what varies between the two is the words and the form
 * key, so those are props.
 *
 * THE ORDER OF TRUST is the audio uploader's, unchanged: the extension allowlist and the
 * size cap here are cheap early refusals, the storage policies admit the upload, and the
 * save action reads the object's OWN first bytes before any row points at it. Nothing in
 * this component is load-bearing for safety.
 *
 * WHAT IS DIFFERENT is that this field always has something true to show BEFORE anything
 * is chosen, and showing it is the point: a synced message already wears a YouTube
 * thumbnail and needs no picture, while one that was never on YouTube wears the plain navy
 * cover. The preview and the hint say which, so the reader is deciding against what
 * members actually see rather than against an empty box.
 *
 * `submitLabel` decides whether this owns a Save. On the attach and create forms it does
 * not: the audio uploader's Save covers the whole form and this only contributes a hidden
 * field. On the manage screen it stands alone, so it does, and it appears inside the
 * chosen state under the same house rule (a primary action with nothing to act on is
 * hidden, never disabled).
 */

export interface ImageFieldSeams {
  upload?: UploadFn;
}

/** Every sentence this field can show. Both call sites keep theirs in `copy/en.ts`. */
export interface ImageFieldWords {
  dropTitle: string;
  dropSub: string;
  hasThumbnailHint: string;
  noThumbnailHint: string;
  hasArtworkHint: string;
  onCardsNow: string;
  /**
   * The caption when the slot holds the fallback rather than a picture. Optional: the
   * message shelf captions both the same ("On cards now", because a YouTube thumbnail IS
   * on the cards), while an event's empty slot is named for what it shows.
   */
  captionNone?: string;
  chosen: string;
  previewOwn: string;
  previewYouTube: string;
  previewNone: string;
  sendingLabel: string;
  readyTitle: (kb: number) => string;
  readyBody: string;
  chooseAnother: string;
  pickNotImage: string;
  pickTooBig: (mb: number) => string;
  uploadFailed: string;
}

type Phase =
  | { phase: 'idle'; problem?: string }
  | {
      phase: 'uploading';
      fileName: string;
      sentBytes: number;
      totalBytes: number;
    }
  | { phase: 'done'; path: string; sizeBytes: number; previewUrl: string };

const ACCEPT = '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp';

/** Declared upload types, from OUR mapping: a picked file's own `type` is often empty. */
const MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export function ImageField({
  subject,
  words,
  fieldName,
  mint,
  submitLabel,
  submittingLabel,
  showSubject = true,
  seams = {},
}: {
  /** What members see right now, which decides both the preview and the hint. */
  subject: ImageSubject;
  /**
   * What this field says. A prop rather than one feature's copy bundle, because the
   * MECHANISM is shared and the VOCABULARY is not: a message's picture competes with a
   * YouTube thumbnail and is cropped square on a lock screen, an event's stands behind a
   * gradient at the top of its own page. Same field, different true sentences.
   */
  words: ImageFieldWords;
  /** The hidden input's name, which is the form key the server action reads. */
  fieldName: string;
  mint: MintAction;
  submitLabel?: string;
  submittingLabel?: string;
  /**
   * False on the manage screen, where the block above this one already shows the picture
   * with its size and date. Two previews of the same image, one captioned "on cards" and
   * the other "on cards now", is a screen asking the reader to work out whether they are
   * looking at one picture or two (seen in the browser, 2026-08-15).
   */
  showSubject?: boolean;
  seams?: ImageFieldSeams;
}) {
  const [state, setState] = useState<Phase>({ phase: 'idle' });
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const text = words;
  const upload = seams.upload ?? uploadViaXhr;

  // The chosen picture is drawn from an object URL, which is a live handle rather than a
  // string: revoked when it is replaced or the field unmounts, or the tab leaks a blob per
  // attempt for as long as it stays open.
  const previewUrl = state.phase === 'done' ? state.previewUrl : null;
  useEffect(() => {
    if (previewUrl === null) return;
    return () => {
      URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function accept(file: File) {
    const extension = extensionOf(file);
    if (!extension) {
      setState({ phase: 'idle', problem: text.pickNotImage });
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setState({ phase: 'idle', problem: text.pickTooBig(wholeMb(file.size)) });
      return;
    }

    let minted;
    try {
      minted = await mint(extension);
    } catch (error) {
      setState({
        phase: 'idle',
        problem:
          error instanceof TypeError
            ? copy.sermonAudio.attach.offline
            : copy.sermonAudio.attach.failedBody,
      });
      return;
    }
    if (!minted.ok) {
      setState({
        phase: 'idle',
        problem:
          minted.reason === 'refused'
            ? copy.sermonAudio.attach.refusedBody
            : copy.sermonAudio.attach.failedBody,
      });
      return;
    }

    setState({
      phase: 'uploading',
      fileName: file.name,
      sentBytes: 0,
      totalBytes: file.size,
    });
    try {
      await upload(minted.signedUrl, file, MIME[extension], (sentBytes) => {
        setState((previous) =>
          previous.phase === 'uploading'
            ? { ...previous, sentBytes }
            : previous,
        );
      });
    } catch {
      setState({ phase: 'idle', problem: text.uploadFailed });
      return;
    }

    setState({
      phase: 'done',
      path: minted.path,
      sizeBytes: file.size,
      previewUrl: URL.createObjectURL(file),
    });
  }

  function startOver() {
    // The uploaded object stays behind as an unreferenced orphan; the storage layer treats
    // those as garbage, not as a leak (nothing can mint a row pointing at a file the save
    // never blessed, and the bucket is not listable by anyone but an admin).
    if (inputRef.current) inputRef.current.value = '';
    setState({ phase: 'idle' });
  }

  if (state.phase === 'done') {
    return (
      <div className="max-w-[40rem]">
        <div className="mt-2 flex flex-wrap items-start gap-3.5">
          <ImagePreview
            url={state.previewUrl}
            caption={text.chosen}
            alt={text.previewOwn}
          />
          <div className="min-w-[14rem] flex-1">
            <Notice
              tone="good"
              live="polite"
              title={text.readyTitle(wholeKb(state.sizeBytes))}
            >
              {text.readyBody}
            </Notice>
          </div>
        </div>
        <input type="hidden" name={fieldName} value={state.path} />
        <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
          {submitLabel === undefined ? null : (
            <SubmitButton
              label={submitLabel}
              pendingLabel={submittingLabel ?? submitLabel}
            />
          )}
          <Button type="button" variant="ghost" onClick={startOver}>
            {text.chooseAnother}
          </Button>
        </div>
      </div>
    );
  }

  if (state.phase === 'uploading') {
    const percent =
      state.totalBytes > 0
        ? Math.min(100, Math.round((state.sentBytes / state.totalBytes) * 100))
        : 0;

    return (
      <div className="max-w-[40rem]">
        <div className="mt-1.5 rounded-control border border-cardline bg-card px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-body font-bold">
            <span className="break-all">{state.fileName}</span>
            <span className="text-muted">
              {copy.sermonAudio.sizeKb(wholeKb(state.totalBytes))}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label={text.sendingLabel}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="mt-2.5 h-2 overflow-hidden rounded-full bg-alt"
          >
            <div
              className="h-full rounded-full bg-blue"
              style={{ width: `${String(percent)}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[40rem]">
      {state.problem ? (
        <div className="mb-3">
          <Alert>{state.problem}</Alert>
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap items-start gap-3.5">
        {showSubject ? (
          <ImagePreview
            url={subject.url}
            caption={
              subject.url === null
                ? (text.captionNone ?? text.onCardsNow)
                : text.onCardsNow
            }
            alt={
              subject.url === null
                ? text.previewNone
                : subject.kind === 'own'
                  ? text.previewOwn
                  : text.previewYouTube
            }
            plain={subject.url === null}
          />
        ) : null}
        <div className="min-w-[14rem] flex-1">
          {/* The input is the real control (keyboard and assistive tech reach it); the
              drop handling is an enhancement layered on its label. */}
          <label
            htmlFor={inputId}
            onDragOver={(event) => {
              event.preventDefault();
            }}
            onDrop={(event) => {
              event.preventDefault();
              const file = event.dataTransfer.files.item(0);
              if (file) void accept(file);
            }}
            className="flex cursor-pointer flex-col items-center gap-1.5 rounded-card border border-dashed border-cardline bg-card px-5 py-4 text-center"
          >
            <span aria-hidden="true" className="text-muted">
              ⬚
            </span>
            <span className="text-body font-extrabold text-text">
              {text.dropTitle}
            </span>
            <span className="text-[0.72rem] font-bold text-muted">
              {text.dropSub}
            </span>
          </label>
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void accept(file);
            }}
          />
          {/* Three subjects, three different true things to say. Collapsing `own` into
              the no-picture branch printed "there is no picture for this one" directly
              underneath the picture (seen in the browser, 2026-08-15). */}
          <p className="mt-1.5 text-[0.78rem] leading-normal text-muted">
            {subject.kind === 'own'
              ? text.hasArtworkHint
              : subject.kind === 'youtube'
                ? text.hasThumbnailHint
                : text.noThumbnailHint}
          </p>
        </div>
      </div>
    </div>
  );
}

function extensionOf(file: File): string | null {
  const match = /\.([a-z0-9]+)$/i.exec(file.name);
  const raw = match?.[1].toLowerCase();
  // One spelling per format, because the server mints from the same map: a .jpeg is a jpg.
  const extension = raw === 'jpeg' ? 'jpg' : raw;
  if (extension && extension in MIME) return extension;
  // A file named without a suffix but declared as an image still gets in by type.
  const byType = Object.entries(MIME).find(([, mime]) => mime === file.type);
  return byType ? byType[0] : null;
}
