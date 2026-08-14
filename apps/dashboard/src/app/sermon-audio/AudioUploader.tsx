'use client';

import { useId, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { copy } from '@/copy/en';
import { MAX_AUDIO_BYTES } from '@/server/sermonAudio';

import { wholeMb, wholeMinutes } from './format';
import type { MintAction } from './state';

/**
 * The file half of both shelf forms (frames: `SERMON-AUDIO-ATTACH`, approved 2026-08-14):
 * pick or drop a file, read its duration, upload it straight to storage with honest
 * progress, then surface the Save button with the file's facts.
 *
 * THE ORDER OF TRUST. Everything this component checks is a courtesy: the extension
 * allowlist, the size cap and the duration read are cheap early refusals so nobody waits
 * out a 30 MB upload for an answer the browser already knew. The real boundary is behind
 * it twice over: the storage policies admit the upload (live-table admin at aal2,
 * machine-minted name, capped size, audio mime), and the save action reads the object's
 * OWN first bytes before any row points at it. Nothing here is load-bearing for safety.
 *
 * THE HIDDEN SAVE. Until a file has uploaded and read cleanly there is no Save button at
 * all, per the house rule: a primary action operating on data that is not there yet is
 * hidden, never disabled. It appears inside the "uploaded and read" moment with the two
 * hidden fields (path, durationSec) the action needs.
 *
 * The two effectful seams (reading a duration, sending bytes) are injectable because
 * jsdom has neither real audio decoding nor a real network: tests fake the seam, never
 * the component (~/.claude/standards/qa-testing.md: mock at boundaries you own).
 */

export interface UploaderSeams {
  readDuration?: (file: File) => Promise<number>;
  upload?: (
    signedUrl: string,
    file: File,
    contentType: string,
    onProgress: (sentBytes: number) => void,
  ) => Promise<void>;
}

type UploadPhase =
  | { phase: 'idle'; problem?: string }
  | { phase: 'reading'; fileName: string }
  | {
      phase: 'uploading';
      fileName: string;
      sentBytes: number;
      totalBytes: number;
    }
  | {
      phase: 'done';
      path: string;
      durationSec: number;
      sizeBytes: number;
      fileName: string;
    };

const ACCEPT = '.mp3,.m4a,.aac,audio/mpeg,audio/mp4,audio/aac';

/** Declared upload types, from OUR mapping: a picked file's own `type` is often empty. */
const MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
};

export function AudioUploader({
  mint,
  submitLabel,
  submittingLabel,
  seams = {},
}: {
  mint: MintAction;
  submitLabel: string;
  submittingLabel: string;
  seams?: UploaderSeams;
}) {
  const [state, setState] = useState<UploadPhase>({ phase: 'idle' });
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const text = copy.sermonAudio.attach;

  const readDuration = seams.readDuration ?? readDurationViaAudio;
  const upload = seams.upload ?? uploadViaXhr;

  async function accept(file: File) {
    const extension = extensionOf(file);
    if (!extension) {
      setState({ phase: 'idle', problem: text.pickNotAudio });
      return;
    }
    if (file.size > MAX_AUDIO_BYTES) {
      setState({ phase: 'idle', problem: text.pickTooBig(wholeMb(file.size)) });
      return;
    }

    setState({ phase: 'reading', fileName: file.name });
    let durationSec: number;
    try {
      durationSec = await readDuration(file);
    } catch {
      setState({ phase: 'idle', problem: text.unreadable });
      return;
    }

    let minted;
    try {
      minted = await mint(extension);
    } catch (error) {
      setState({
        phase: 'idle',
        problem: error instanceof TypeError ? text.offline : text.failedBody,
      });
      return;
    }
    if (!minted.ok) {
      setState({
        phase: 'idle',
        problem:
          minted.reason === 'refused' ? text.refusedBody : text.failedBody,
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
      durationSec,
      sizeBytes: file.size,
      fileName: file.name,
    });
  }

  function startOver() {
    // The uploaded object stays behind as an unreferenced orphan; the storage layer
    // treats those as garbage, not as a leak (nothing can mint a row pointing at a file
    // the save never blessed, and nothing lists the bucket to members).
    if (inputRef.current) inputRef.current.value = '';
    setState({ phase: 'idle' });
  }

  if (state.phase === 'done') {
    return (
      <div className="max-w-[40rem]">
        <Notice
          tone="good"
          live="polite"
          title={text.checkedTitle(
            wholeMinutes(state.durationSec),
            wholeMb(state.sizeBytes),
          )}
        >
          {state.fileName} · {text.checkedBody}
        </Notice>
        <input type="hidden" name="path" value={state.path} />
        <input
          type="hidden"
          name="durationSec"
          value={String(state.durationSec)}
        />
        <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
          <Save label={submitLabel} pendingLabel={submittingLabel} />
          <Button type="button" variant="ghost" onClick={startOver}>
            {text.startOver}
          </Button>
        </div>
      </div>
    );
  }

  if (state.phase === 'reading' || state.phase === 'uploading') {
    const sentMb = state.phase === 'uploading' ? wholeMb(state.sentBytes) : 0;
    const totalMb =
      state.phase === 'uploading' ? wholeMb(state.totalBytes) : null;
    const percent =
      state.phase === 'uploading' && state.totalBytes > 0
        ? Math.min(100, Math.round((state.sentBytes / state.totalBytes) * 100))
        : 0;

    return (
      <div className="max-w-[40rem]">
        <div className="mt-1.5 rounded-control border border-cardline bg-card px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-body font-bold">
            <span className="break-all">{state.fileName}</span>
            <span className="text-muted">
              {state.phase === 'reading'
                ? text.readingFile
                : text.uploadingProgress(sentMb, totalMb ?? 0)}
            </span>
          </div>
          <div
            role="progressbar"
            aria-label={text.uploadingLabel}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={state.phase === 'uploading' ? percent : undefined}
            className="mt-2.5 h-2 overflow-hidden rounded-full bg-alt"
          >
            <div
              className="h-full rounded-full bg-blue"
              style={{ width: `${String(percent)}%` }}
            />
          </div>
        </div>
        <p className="mt-1.5 max-w-[52ch] text-[0.78rem] leading-normal text-muted">
          {text.uploadingHint}
        </p>
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
      {/* The input is the real control (keyboard and assistive tech reach it); the drop
          handling is an enhancement layered on its label. */}
      <label
        htmlFor={inputId}
        onDragOver={(event) => {
          event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          // .item(0), not [0]: item() is honestly typed as possibly null, where an
          // index without noUncheckedIndexedAccess reads as always defined.
          const file = event.dataTransfer.files.item(0);
          if (file) void accept(file);
        }}
        className="mt-1.5 flex cursor-pointer flex-col items-center gap-1.5 rounded-card border border-dashed border-cardline bg-card px-5 py-6 text-center"
      >
        <span aria-hidden="true" className="text-muted">
          ↑
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
      <p className="mt-1.5 max-w-[52ch] text-[0.78rem] leading-normal text-muted">
        {text.dropHint}
      </p>
    </div>
  );
}

/** Its own component so `useFormStatus()` can see the form it belongs to. */
function Save({
  label,
  pendingLabel,
}: {
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

function extensionOf(file: File): string | null {
  const match = /\.([a-z0-9]+)$/i.exec(file.name);
  const extension = match?.[1].toLowerCase();
  if (extension && extension in MIME) return extension;
  // A file named without a suffix but declared as audio still gets in by type.
  const byType = Object.entries(MIME).find(([, mime]) => mime === file.type);
  return byType ? byType[0] : null;
}

/**
 * The browser's own decoder answers, so the duration members will see is the file's own.
 * Rejected when the decoder cannot say: an unreadable file would fail the server's byte
 * check anyway, and refusing before a 30 MB upload is the whole point of this layer.
 */
function readDurationViaAudio(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const probe = new Audio();
    probe.preload = 'metadata';
    probe.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      const seconds = probe.duration;
      if (Number.isFinite(seconds) && seconds > 0) {
        resolve(Math.round(seconds));
      } else {
        reject(new Error('no duration in the file'));
      }
    };
    probe.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('the file could not be decoded'));
    };
    probe.src = url;
  });
}

/**
 * XHR rather than fetch, for one reason only: upload progress events. The PUT and the
 * headers mirror what supabase-js sends to a signed upload URL; the token is inside the
 * URL the server minted.
 */
function uploadViaXhr(
  signedUrl: string,
  file: File,
  contentType: string,
  onProgress: (sentBytes: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', signedUrl);
    xhr.setRequestHeader('content-type', contentType);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`upload refused with ${String(xhr.status)}`));
    };
    xhr.onerror = () => {
      reject(new Error('the upload did not reach storage'));
    };
    xhr.send(file);
  });
}
