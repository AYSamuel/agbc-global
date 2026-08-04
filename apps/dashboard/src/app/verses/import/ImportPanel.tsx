'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';

import { PageHeader } from '@/components/PageHeader';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Pill } from '@/components/ui/Pill';
import { Stat } from '@/components/ui/Stat';
import { copy } from '@/copy/en';
import {
  LANGUAGES,
  type ImportProblem,
  type ImportResult,
} from '@/server/verses';

import { FIELD, HINT, LABEL } from '../../people/fields';
import { VersesRefusal } from '../Refusal';
import {
  NOTHING_CHECKED,
  type ApplyAction,
  type CheckAction,
  type CheckProblem,
  type CheckState,
} from '../state';

/**
 * Paste a quarter, then see what it will do before it does it (frames: `VERSES-IMPORT`).
 *
 * TWO STEPS AND ONE PASTE. The text stays in this component across both, so "Back to the
 * paste" returns to what was typed rather than to an empty box, and the apply sends the
 * SAME text back to be parsed again. Carrying the parsed rows forward instead would make a
 * second description of the batch, free to disagree with the one the reader was shown; the
 * promise on the first screen ("nothing is saved until you have seen what it will do") is
 * only true while the preview and the write come from one text and one function.
 *
 * The counts are the database's, not this file's. Nothing here validates a row: that
 * belongs to `import_daily_verses`, called twice, which is the whole design (see the
 * migration's note and `server/verses.ts`).
 */
export function ImportPanel({
  check,
  apply,
}: {
  check: CheckAction;
  apply: ApplyAction;
}) {
  const [answer, submit, checking] = useActionState(
    guarded(check),
    NOTHING_CHECKED,
  );
  const [paste, setPaste] = useState('');
  const [replace, setReplace] = useState(false);
  /**
   * The preview the reader has stepped back from, held by identity rather than by a flag.
   * Every dispatch returns a NEW state object, so a fresh preview is never equal to a
   * dismissed one and shows immediately; a boolean would have to be unset by hand, and the
   * day somebody forgot, Check would appear to do nothing (the `PeoplePanel` idiom).
   */
  const [steppedBack, setSteppedBack] = useState<CheckState | null>(null);
  const state = answer === steppedBack ? NOTHING_CHECKED : answer;

  if (state.status === 'checked') {
    return (
      <Preview
        result={state.result}
        rows={state.rows}
        paste={paste}
        replace={replace}
        onReplace={setReplace}
        onBack={() => {
          setSteppedBack(answer);
        }}
        apply={apply}
      />
    );
  }

  return (
    <>
      <PageHeader
        title={copy.verses.import.title}
        scope={copy.verses.import.scope}
      />

      {state.status === 'failed' && state.reason === 'refused' ? (
        <VersesRefusal />
      ) : null}

      {state.status === 'failed' && state.reason !== 'refused' ? (
        <div className="mt-4">
          <Alert>{PROBLEMS[state.reason]}</Alert>
        </div>
      ) : null}

      <div className="mt-4 flex items-start gap-3 rounded-card border border-[rgba(185,134,0,0.34)] bg-[rgba(255,207,74,0.14)] px-4 py-3">
        <span
          aria-hidden="true"
          className="mt-px text-gold-deep dark:text-accent"
        >
          ✎
        </span>
        <p className="text-body leading-relaxed text-text">
          <b className="font-extrabold">{copy.verses.import.guideTitle}</b>{' '}
          {copy.verses.import.guide}
        </p>
      </div>

      <form action={submit}>
        <div className="mt-4 max-w-[40rem]">
          <label htmlFor="verses-paste" className={LABEL}>
            {copy.verses.import.pasteLabel}
          </label>
          {/* A textarea, not a file input: the owner of this job (`22` §1) keeps the
              quarter in a spreadsheet, and "select all, copy" is the action they already
              perform. A file input can join it later; it cannot replace it. */}
          <textarea
            id="verses-paste"
            name="paste"
            required
            rows={8}
            spellCheck={false}
            placeholder={copy.verses.import.pastePlaceholder}
            aria-describedby="verses-paste-hint"
            value={paste}
            onChange={(event) => {
              setPaste(event.target.value);
            }}
            className="mt-1.5 w-full rounded-control border border-cardline bg-card px-4 py-3 font-mono text-body leading-relaxed text-text"
          />
          <p id="verses-paste-hint" className={HINT}>
            {copy.verses.import.pasteHint}
          </p>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2.5">
          <Button type="submit" disabled={checking}>
            {checking ? copy.verses.import.checking : copy.verses.import.check}
          </Button>
          <Link
            href="/verses"
            className="inline-flex min-h-12 items-center px-2 text-body font-semibold text-blue underline-offset-4 hover:underline"
          >
            {copy.verses.import.cancel}
          </Link>
        </div>
      </form>
    </>
  );
}

/**
 * What it will do, before it does it (frame: `VERSES-IMPORT · what it will do`).
 *
 * An importer pasting a corrected spreadsheet is USUALLY overlapping days they already
 * queued, so "36 already scheduled" is the normal case and not an error. The choice is
 * explicit and defaults to the safe side: keep what is there. Rows that cannot be read are
 * listed individually, because "12 problems" with no line numbers is a dead end in a
 * 360-row paste.
 */
function Preview({
  result,
  rows,
  paste,
  replace,
  onReplace,
  onBack,
  apply,
}: {
  result: ImportResult;
  rows: number;
  paste: string;
  replace: boolean;
  onReplace: (replace: boolean) => void;
  onBack: () => void;
  apply: ApplyAction;
}) {
  // What this button would actually write, under the choice made right now. The frame's
  // "Import 312 verses" is the new days alone, because keeping is the default.
  const applying = result.new + (replace ? result.existing : 0);

  return (
    <>
      <PageHeader
        title={copy.verses.import.previewTitle}
        scope={copy.verses.import.previewScope(rows)}
      />

      <dl className="mt-4 flex flex-wrap gap-2.5">
        <Stat label={copy.verses.import.statNew} value={result.new} />
        <Stat label={copy.verses.import.statExisting} value={result.existing} />
        <Stat
          label={copy.verses.import.statInvalid}
          value={result.invalid}
          tone={result.invalid > 0 ? 'low' : 'normal'}
        />
      </dl>

      <form action={apply}>
        {/* The same text the preview was computed from, parsed once more on the server. */}
        <input type="hidden" name="paste" value={paste} />

        {result.existing > 0 ? (
          <fieldset className={FIELD}>
            <legend className={LABEL}>
              {copy.verses.import.conflictLabel(result.existing)}
            </legend>
            <div className="mt-1.5 inline-flex flex-wrap gap-1 rounded-control bg-alt p-1">
              {CONFLICT_CHOICES.map((choice) => (
                <label
                  key={choice.value}
                  className={`flex min-h-11 cursor-pointer items-center rounded-control px-4 text-body font-bold has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-blue ${
                    replace === choice.replace
                      ? 'bg-raised text-text shadow-sm'
                      : 'text-muted'
                  }`}
                >
                  <input
                    type="radio"
                    name="conflicts"
                    value={choice.value}
                    checked={replace === choice.replace}
                    aria-describedby="verses-conflict-hint"
                    onChange={() => {
                      onReplace(choice.replace);
                    }}
                    className="sr-only"
                  />
                  {choice.label}
                </label>
              ))}
            </div>
            <p id="verses-conflict-hint" className={HINT}>
              {copy.verses.import.conflictHint}
            </p>
          </fieldset>
        ) : null}

        {result.problems.length > 0 ? (
          <>
            <h2 className="pt-5 pb-2.5 text-label font-extrabold tracking-[0.14em] text-muted uppercase">
              {copy.verses.import.problemsLabel}
            </h2>
            {result.problems.map((problem) => (
              <Problem
                key={`${String(problem.line)}-${problem.language}`}
                problem={problem}
              />
            ))}
          </>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-2.5 border-t border-cardline pt-3.5">
          {applying > 0 ? (
            <Apply count={applying} />
          ) : (
            <Alert>
              {result.existing > 0
                ? copy.verses.import.allExisting
                : copy.verses.import.nothingToImport}
            </Alert>
          )}
          {/* A button rather than a link: the paste lives in this component, and a link
              back to /verses/import would return to an empty box. */}
          <Button type="button" variant="ghost" onClick={onBack}>
            {copy.verses.import.back}
          </Button>
        </div>
      </form>
    </>
  );
}

/** Its own component so `useFormStatus()` can see the form it belongs to. */
function Apply({ count }: { count: number }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? copy.verses.import.applying : copy.verses.import.apply(count)}
    </Button>
  );
}

const CONFLICT_CHOICES = [
  { value: 'keep', replace: false, label: copy.verses.import.keep },
  { value: 'replace', replace: true, label: copy.verses.import.replace },
];

/**
 * One row that cannot be read, named by its line number in the reader's own spreadsheet.
 *
 * The language pill appears only for a language the table knows. When it is the language
 * that is wrong, the pill would be showing the reader a code that means nothing, so the
 * sentence carries the offending value instead (the frame does exactly this).
 */
function Problem({ problem }: { problem: ImportProblem }) {
  const known = LANGUAGES.some((language) => language === problem.language);

  return (
    <article className="mb-3 rounded-card border border-cardline bg-card px-4 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone="urgent">{copy.verses.import.problemRow(problem.line)}</Pill>
        {known ? <Pill tone="quiet">{problem.language}</Pill> : null}
        <span className="flex-1" />
        {problem.date ? (
          <span className="text-[0.72rem] font-bold text-muted">
            {problem.date}
          </span>
        ) : null}
      </div>
      <p className="mt-2.5 text-body leading-relaxed text-text">
        {reasonOf(problem)}
      </p>
    </article>
  );
}

function reasonOf(problem: ImportProblem): string {
  if (problem.reason === 'language_unknown' && problem.language) {
    return copy.verses.import.languageUnknown(problem.language);
  }
  return (
    copy.verses.import.reasons[problem.reason] ??
    copy.verses.import.unknownReason
  );
}

const PROBLEMS: Record<Exclude<CheckProblem, 'refused'>, string> = {
  empty: copy.verses.import.emptyPaste,
  offline: copy.verses.import.offline,
  failed: copy.verses.import.outcome.failed,
};

/** See the same wrapper in `PeoplePanel`: the network, told apart from a bug. */
function guarded(check: CheckAction): CheckAction {
  return async (previous: CheckState, formData: FormData) => {
    try {
      return await check(previous, formData);
    } catch (error) {
      return {
        status: 'failed',
        reason: error instanceof TypeError ? 'offline' : 'failed',
      };
    }
  };
}
