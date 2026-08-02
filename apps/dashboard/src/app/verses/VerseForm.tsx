'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useFormStatus } from 'react-dom';

import { Button } from '@/components/ui/Button';
import { copy } from '@/copy/en';
import { LANGUAGES, type Language, type ScheduledVerse } from '@/server/verses';

import { CONTROL, FIELD, HINT, LABEL } from '../people/fields';

import { nameOf } from './format';

/**
 * One day, one language (frame: `VERSE-EDIT`).
 *
 * ONE FORM FOR BOTH `/verses/new` AND `/verses/<date>/<language>`, which is the frame's own
 * reasoning: the table's key is (date, language) and saving onto an occupied pair IS the
 * edit. Two forms would be two validators, and the day they disagreed the disagreement
 * would be invisible.
 *
 * REMOVE LIVES HERE and not on the list rows, also from the frame: the schedule is 90 days
 * across four languages and a destructive control repeated several hundred times down a
 * list somebody is only scanning is a hazard. Here the verse being removed is on screen.
 * It shares this form rather than opening its own, so it carries the ORIGINAL day and
 * language even when the fields above have been edited.
 *
 * A client component for one reason: the hint under Translation names the language, and a
 * hint that still said "German" after French was chosen would be wrong in the one place
 * the reader is looking for reassurance. The dashboard already needs scripts to sign in
 * (see `people/actions.ts`), so this costs nobody a way in.
 */
export function VerseForm({
  verse,
  initialDate = '',
  initialLanguage = 'en',
  save,
  remove,
}: {
  /** The verse being edited, or null when this day and language has none yet. */
  verse: ScheduledVerse | null;
  /** Prefill for a new verse, from the URL of the day that was empty. */
  initialDate?: string;
  initialLanguage?: Language;
  save: (formData: FormData) => void | Promise<void>;
  remove: (formData: FormData) => void | Promise<void>;
}) {
  const [date, setDate] = useState(verse?.date ?? initialDate);
  const [language, setLanguage] = useState<string>(
    verse?.language ?? initialLanguage,
  );

  return (
    <form action={save}>
      {verse ? (
        <>
          {/* The pair this form was opened on, which is what Remove acts on and what a
              save clears if the day or the language above has been changed. */}
          <input type="hidden" name="originalDate" value={verse.date} />
          <input type="hidden" name="originalLanguage" value={verse.language} />
        </>
      ) : null}

      <div className={FIELD}>
        <label htmlFor="verse-date" className={LABEL}>
          {copy.verses.verse.date}
        </label>
        {/* ISO in the box, as the frame draws it, and NOT `type="date"`. The native
            control was tried first (2026-08-02) and rendered the day as 09/01/2026 on an
            en-US browser, three lines under a heading reading "1 September 2026". Every
            other date on this surface is unambiguous, `try_iso_date()` refuses ambiguous
            ones outright, and a screen that prints one anyway teaches the opposite lesson.
            The pattern gives the same guarantee the picker did. */}
        <input
          id="verse-date"
          name="date"
          required
          inputMode="numeric"
          autoComplete="off"
          pattern="\d{4}-\d{2}-\d{2}"
          placeholder={copy.verses.verse.datePlaceholder}
          title={copy.verses.verse.dateHint}
          value={date}
          onChange={(event) => {
            setDate(event.target.value);
          }}
          className={CONTROL}
        />
      </div>

      <fieldset className={FIELD}>
        <legend className={LABEL}>{copy.verses.verse.language}</legend>
        <div className="mt-1.5 inline-flex flex-wrap gap-1 rounded-control bg-alt p-1">
          {LANGUAGES.map((option) => (
            <label
              key={option}
              className={`flex min-h-11 cursor-pointer items-center rounded-control px-4 text-body font-bold has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-blue ${
                language === option
                  ? 'bg-raised text-text shadow-sm'
                  : 'text-muted'
              }`}
            >
              {/* A real radio group: four buttons that look like a segmented control would
                  leave a keyboard user with no way to know they are one choice. */}
              <input
                type="radio"
                name="language"
                value={option}
                checked={language === option}
                onChange={() => {
                  setLanguage(option);
                }}
                className="sr-only"
              />
              {nameOf(option)}
            </label>
          ))}
        </div>
      </fieldset>

      <div className={FIELD}>
        <label htmlFor="verse-reference" className={LABEL}>
          {copy.verses.verse.reference}
        </label>
        <input
          id="verse-reference"
          name="reference"
          required
          defaultValue={verse?.reference ?? ''}
          className={CONTROL}
        />
      </div>

      <div className="mt-4 max-w-[40rem]">
        <label htmlFor="verse-text" className={LABEL}>
          {copy.verses.verse.text}
        </label>
        <textarea
          id="verse-text"
          name="text"
          required
          rows={3}
          defaultValue={verse?.text ?? ''}
          className="mt-1.5 w-full rounded-control border border-cardline bg-card px-4 py-3 text-body leading-relaxed text-text"
        />
      </div>

      <div className={FIELD}>
        <label htmlFor="verse-translation" className={LABEL}>
          {copy.verses.verse.translation}
        </label>
        <input
          id="verse-translation"
          name="translation"
          defaultValue={verse?.translation ?? 'WEB'}
          className={CONTROL}
        />
        {/* The frame's hint, under the last field: it is about the save rather than about
            this box, which is why it names the language chosen above. */}
        <p className={HINT}>{copy.verses.verse.uniqueHint(nameOf(language))}</p>
      </div>

      <Actions removing={verse !== null} remove={remove} />
    </form>
  );
}

/**
 * The action row, in its own component so `useFormStatus()` can see the form.
 *
 * The hook reads the status of the form ABOVE it in the tree, so a button that called it
 * from inside `VerseForm` would always read idle.
 */
function Actions({
  removing,
  remove,
}: {
  removing: boolean;
  remove: (formData: FormData) => void | Promise<void>;
}) {
  const { pending } = useFormStatus();

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2.5 border-t border-cardline pt-3.5">
      <Button type="submit" disabled={pending}>
        {pending ? copy.verses.verse.saving : copy.verses.verse.save}
      </Button>
      <Link
        href="/verses"
        className="inline-flex min-h-12 items-center px-2 text-body font-semibold text-blue underline-offset-4 hover:underline"
      >
        {copy.verses.verse.cancel}
      </Link>
      {removing ? (
        <>
          <span className="flex-1" />
          {/* The mockup's `.btn.danger`: outlined rather than filled, because removing is
              not the primary act on this screen even when it is the right one. It submits
              THIS form to a different action, so no second form is nested inside the
              first, and `formNoValidate` keeps a half-typed field from blocking it. */}
          <Button
            type="submit"
            variant="secondary"
            formAction={remove}
            formNoValidate
            disabled={pending}
            className="border-danger text-danger"
          >
            {copy.verses.verse.remove}
          </Button>
        </>
      ) : null}
    </div>
  );
}
