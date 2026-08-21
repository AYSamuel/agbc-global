'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { Notice } from '@/components/ui/Notice';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { copy } from '@/copy/en';

import { NOTHING_DONE, type ActFormState } from './state';

/**
 * The last control on the three confirm screens (CLOSE, RE-OPEN, MOVE HQ; frames approved
 * 2026-08-21).
 *
 * ONE COMPONENT FOR THREE ACTS, because the acts differ in what they SAY and not in what
 * they ask: a fresh authenticator code, and on the closing screen the branch's name typed
 * out. The consequences above it are the page's, not this component's, which is why they are
 * passed as children rather than configured with a prop.
 *
 * A client component only for `useActionState`: a refusal has to land on the screen the
 * reader is already looking at, with the consequences still above it. Sending them back to
 * the branch page with an error in the URL would make them read the whole thing again.
 */
export type ActAction = (
  state: ActFormState,
  formData: FormData,
) => Promise<ActFormState>;

export function ConfirmForm({
  act,
  slug,
  /** Present on the closing screen only: the exact name that has to be typed. */
  confirmName,
  codeHint,
  submitLabel,
  pendingLabel,
  cancelLabel,
  tone = 'danger',
}: {
  act: ActAction;
  slug: string;
  confirmName?: string;
  codeHint?: string;
  submitLabel: string;
  pendingLabel: string;
  cancelLabel: string;
  tone?: 'danger' | 'primary';
}) {
  const [state, submit] = useActionState(act, NOTHING_DONE);
  const problem = state.status === 'error' ? state.problem : null;

  return (
    <form action={submit} className="max-w-[520px]">
      <input type="hidden" name="slug" value={slug} />

      {problem && (
        <Notice
          tone="bad"
          title={copy.branches.problems[camel(problem)]}
          live="assertive"
        >
          {''}
        </Notice>
      )}

      {confirmName && (
        <div className="mt-4">
          <label
            htmlFor="confirmName"
            className="block text-caption font-extrabold tracking-widest text-muted uppercase"
          >
            {copy.branches.typeToConfirmLabel}
          </label>
          <input
            id="confirmName"
            name="confirmName"
            required
            autoComplete="off"
            aria-invalid={problem === 'name_mismatch' || undefined}
            aria-describedby="confirmName-hint"
            placeholder={confirmName}
            className={
              'mt-1.5 min-h-12 w-full rounded-input border bg-card px-3.5 py-3 text-body text-text ' +
              (problem === 'name_mismatch'
                ? 'border-danger'
                : 'border-cardline')
            }
          />
          <p id="confirmName-hint" className="mt-1.5 text-small text-muted">
            {copy.branches.typeToConfirmHint(confirmName)}
          </p>
        </div>
      )}

      <div className="mt-4">
        <label
          htmlFor="code"
          className="block text-caption font-extrabold tracking-widest text-muted uppercase"
        >
          {copy.branches.codeLabel}
        </label>
        <input
          id="code"
          name="code"
          required
          inputMode="numeric"
          // The browser's own one-time-code handling, the same as the People step-up and
          // the sign-in screen: a paste from an authenticator should not need retyping.
          autoComplete="one-time-code"
          pattern="[0-9]*"
          aria-invalid={problem === 'bad_code' || undefined}
          aria-describedby={codeHint ? 'code-hint' : undefined}
          className={
            'mt-1.5 min-h-12 w-[190px] rounded-input border bg-card px-3.5 py-3 font-mono text-body tracking-[0.34em] text-text ' +
            (problem === 'bad_code' ? 'border-danger' : 'border-cardline')
          }
        />
        {codeHint && (
          <p id="code-hint" className="mt-1.5 text-small text-muted">
            {codeHint}
          </p>
        )}
      </div>

      <div className="mt-4 flex items-center gap-2.5 border-t border-cardline pt-3.5">
        <SubmitButton
          variant={tone === 'danger' ? 'danger' : 'primary'}
          label={submitLabel}
          pendingLabel={pendingLabel}
        />
        <Link
          href={`/branches/${slug}`}
          className="inline-flex min-h-12 items-center px-2 text-body font-semibold text-blue underline-offset-4 hover:underline"
        >
          {cancelLabel}
        </Link>
      </div>
    </form>
  );
}

/** `bad_code` in the module, `badCode` in the copy: one map rather than one per call. */
function camel(problem: string): keyof typeof copy.branches.problems {
  const key = problem.replace(/_([a-z])/g, (_, letter: string) =>
    letter.toUpperCase(),
  );
  return key as keyof typeof copy.branches.problems;
}
