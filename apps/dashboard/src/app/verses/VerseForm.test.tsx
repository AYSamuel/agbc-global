import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';

import type { ScheduledVerse } from '@/server/verses';
import { expectNoA11yViolations } from '@/test/a11y';

import { VerseForm } from './VerseForm';

/**
 * The one form both `/verses/new` and `/verses/<date>/<language>` render.
 *
 * The actions are stubs: what is under test is the FORM, and what it carries when it is
 * submitted. Whether a save is legal is `import_daily_verses`' answer, and it is asked in
 * `server/verses.test.ts` against a real database.
 */

const GERMAN: ScheduledVerse = {
  date: '2026-08-14',
  language: 'de',
  reference: 'Psalm 23,1',
  text: 'Der HERR ist mein Hirte, mir wird nichts mangeln.',
  translation: 'WEB',
};

const noop = () => undefined;

test('a new verse asks for a day and a language, and has nothing to remove', async () => {
  const { container } = render(
    <VerseForm verse={null} save={noop} remove={noop} />,
  );

  // ISO, not a native date picker: an en-US browser renders that as 09/01/2026, which is
  // the ambiguity `try_iso_date()` refuses to accept from a spreadsheet.
  expect(screen.getByLabelText('Date')).toHaveAttribute(
    'placeholder',
    'YYYY-MM-DD',
  );
  expect(screen.getByLabelText('Date')).toHaveAttribute(
    'pattern',
    '\\d{4}-\\d{2}-\\d{2}',
  );
  expect(screen.getByRole('radio', { name: 'English' })).toBeChecked();
  expect(screen.getByRole('radio', { name: 'German' })).not.toBeChecked();
  expect(screen.getByLabelText('Reference')).toHaveValue('');
  expect(screen.getByLabelText('Verse text')).toHaveValue('');
  // The table's own default, so a form left alone matches what a paste with no
  // translation column produces.
  expect(screen.getByLabelText('Translation')).toHaveValue('WEB');

  expect(screen.getByRole('button', { name: 'Save' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute(
    'href',
    '/verses',
  );
  // Nothing exists yet, so there is nothing to destroy.
  expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();

  await expectNoA11yViolations(container);
});

test('an existing verse fills the form, and can be removed from it', async () => {
  const { container } = render(
    <VerseForm verse={GERMAN} save={noop} remove={noop} />,
  );

  expect(screen.getByLabelText('Date')).toHaveValue('2026-08-14');
  expect(screen.getByRole('radio', { name: 'German' })).toBeChecked();
  expect(screen.getByLabelText('Reference')).toHaveValue('Psalm 23,1');
  expect(screen.getByLabelText('Verse text')).toHaveValue(GERMAN.text);
  expect(screen.getByRole('button', { name: 'Remove' })).toBeVisible();

  await expectNoA11yViolations(container);
});

test('the hint follows the language chosen, because it describes what a save replaces', async () => {
  const user = userEvent.setup();
  render(<VerseForm verse={null} save={noop} remove={noop} />);

  expect(screen.getByText(/already has a verse in English/)).toBeVisible();

  await user.click(screen.getByRole('radio', { name: 'French' }));

  expect(screen.getByText(/already has a verse in French/)).toBeVisible();
  expect(screen.queryByText(/already has a verse in English/)).toBeNull();
});

test('Remove acts on the day the form was opened on, not the day now typed in it', async () => {
  const user = userEvent.setup();
  const remove = vi.fn();
  const { container } = render(
    <VerseForm verse={GERMAN} save={noop} remove={remove} />,
  );

  // Somebody edits the date, then changes their mind and removes the verse instead. The
  // row that goes must be the one they opened, or an untouched day disappears silently.
  fireEvent.change(screen.getByLabelText('Date'), {
    target: { value: '2026-08-20' },
  });
  await user.click(screen.getByRole('radio', { name: 'Dutch' }));

  const form = container.querySelector('form');
  expect(form).not.toBeNull();
  const fields = new FormData(form ?? undefined);
  expect(fields.get('date')).toBe('2026-08-20');
  expect(fields.get('language')).toBe('nl');
  expect(fields.get('originalDate')).toBe('2026-08-14');
  expect(fields.get('originalLanguage')).toBe('de');

  await user.click(screen.getByRole('button', { name: 'Remove' }));

  expect(remove).toHaveBeenCalledTimes(1);
  const submitted = remove.mock.calls[0][0] as FormData;
  expect(submitted.get('originalDate')).toBe('2026-08-14');
  expect(submitted.get('originalLanguage')).toBe('de');
});
