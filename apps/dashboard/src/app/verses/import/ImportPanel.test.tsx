import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';

import type { ImportResult } from '@/server/verses';
import { expectNoA11yViolations } from '@/test/a11y';

import type { CheckAction, CheckState } from '../state';

import { ImportPanel } from './ImportPanel';

/**
 * The two steps, with the preview handed in as a stub.
 *
 * A stub rather than a mock of the real action, for the reason the panel takes it as a
 * prop at all: the counts are the DATABASE's answer, computed by `import_daily_verses`,
 * and re-deriving them here would test this file's belief about that function rather than
 * the screen. What the screen owes the reader is that those numbers, the choice between
 * keeping and replacing, and the button that writes them all agree with each other.
 */

const PASTE =
  'date\tlanguage\treference\ttext\ttranslation\n2026-08-14\tde\tPsalm 23,1\tDer HERR ist mein Hirte\tWEB';

/** The frame's own batch: 360 rows, 312 new, 36 already there, 12 unreadable. */
const QUARTER: ImportResult = {
  dryRun: true,
  replaceExisting: false,
  new: 312,
  existing: 36,
  invalid: 12,
  applied: 0,
  problems: [
    { line: 84, date: '2026-08-32', language: 'de', reason: 'date_impossible' },
    {
      line: 119,
      date: '2026-09-07',
      language: 'ge',
      reason: 'language_unknown',
    },
    { line: 203, date: '2026-09-30', language: 'fr', reason: 'text_blank' },
  ],
};

function answering(result: ImportResult, rows = 360): CheckAction {
  return (_previous, formData): Promise<CheckState> => {
    const paste = formData.get('paste');
    // The paste has to reach the action, or the preview is about nothing.
    expect(typeof paste === 'string' && paste.length > 0).toBe(true);
    return Promise.resolve({ status: 'checked', rows, result });
  };
}

const neverApplies = () => undefined;

async function check(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.type(screen.getByLabelText('Paste from your spreadsheet'), PASTE);
  await user.click(screen.getByRole('button', { name: 'Check this batch' }));
}

test('the paste step explains the columns before anything is typed', async () => {
  const { container } = render(
    <ImportPanel check={answering(QUARTER)} apply={neverApplies} />,
  );

  expect(screen.getByRole('heading', { name: 'Import a batch' })).toBeVisible();
  expect(
    screen.getByText(/Nothing is saved until you have seen what it will do/),
  ).toBeVisible();

  const box = screen.getByLabelText('Paste from your spreadsheet');
  expect(box.tagName).toBe('TEXTAREA');
  expect(box).toHaveAccessibleDescription(/Tabs or commas both work/);

  expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute(
    'href',
    '/verses',
  );

  await expectNoA11yViolations(container);
});

test('the preview counts three things, keeps by default, and names every unreadable row', async () => {
  const user = userEvent.setup();
  const { container } = render(
    <ImportPanel check={answering(QUARTER)} apply={neverApplies} />,
  );

  await check(user);

  expect(
    await screen.findByRole('heading', { name: 'Check this batch' }),
  ).toBeVisible();
  expect(screen.getByText('360 rows pasted · nothing saved yet')).toBeVisible();

  expect(screen.getByText('312')).toBeVisible();
  expect(screen.getByText('New days')).toBeVisible();
  expect(screen.getByText('36')).toBeVisible();
  expect(screen.getByText('Already scheduled')).toBeVisible();
  expect(screen.getByText('12')).toBeVisible();
  expect(screen.getByText('Cannot be read')).toBeVisible();

  // Keeping is the safe answer and the default. Overlapping days are the NORMAL case for
  // somebody re-pasting a corrected spreadsheet, not an error.
  expect(
    screen.getByRole('radio', { name: 'Keep what is there' }),
  ).toBeChecked();
  expect(screen.getByRole('radio', { name: 'Replace them' })).not.toBeChecked();
  expect(screen.getByText('The 36 days you already have')).toBeVisible();

  // Line numbers, because "12 problems" with no line numbers is a dead end in a 360-row
  // paste. And the language that cannot be understood is quoted back rather than pilled.
  expect(screen.getByText('Row 84')).toBeVisible();
  expect(screen.getByText('That date does not exist.')).toBeVisible();
  expect(screen.getByText('2026-08-32')).toBeVisible();
  expect(
    screen.getByText(
      'Language “ge” is not one of English, German, Dutch or French.',
    ),
  ).toBeVisible();
  expect(screen.getByText('The verse text is empty.')).toBeVisible();

  await expectNoA11yViolations(container);
});

test('a batch of one counts in the singular, everywhere it is counted', async () => {
  // Small pastes are the common case once a quarter is in: a volunteer fixing one day.
  // "1 rows pasted" and "Import 1 verses" is how a screen tells somebody it was written
  // for a number it never expected.
  const user = userEvent.setup();
  render(
    <ImportPanel
      check={answering({ ...QUARTER, new: 1, existing: 1, invalid: 0 }, 1)}
      apply={neverApplies}
    />,
  );

  await check(user);

  expect(
    await screen.findByText('1 row pasted · nothing saved yet'),
  ).toBeVisible();
  expect(screen.getByText('The day you already have')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Import 1 verse' })).toBeVisible();
});

test('the button counts what the current choice would write', async () => {
  const user = userEvent.setup();
  render(<ImportPanel check={answering(QUARTER)} apply={neverApplies} />);

  await check(user);

  // Keeping: the new days alone.
  expect(
    await screen.findByRole('button', { name: 'Import 312 verses' }),
  ).toBeVisible();

  await user.click(screen.getByRole('radio', { name: 'Replace them' }));

  // Replacing: the days already queued are overwritten too, and the button says so
  // BEFORE it is pressed.
  expect(
    screen.getByRole('button', { name: 'Import 348 verses' }),
  ).toBeVisible();
});

test('stepping back returns to the paste that was typed, not to an empty box', async () => {
  const user = userEvent.setup();
  render(<ImportPanel check={answering(QUARTER)} apply={neverApplies} />);

  await check(user);
  await user.click(
    await screen.findByRole('button', { name: 'Back to the paste' }),
  );

  expect(screen.getByRole('heading', { name: 'Import a batch' })).toBeVisible();
  expect(screen.getByLabelText('Paste from your spreadsheet')).toHaveValue(
    PASTE,
  );
});

test('a paste of days already queued offers the choice that would change something', async () => {
  const user = userEvent.setup();
  render(
    <ImportPanel
      check={answering(
        { ...QUARTER, new: 0, existing: 36, invalid: 0, problems: [] },
        36,
      )}
      apply={neverApplies}
    />,
  );

  await check(user);

  // No "Import 0 verses": a button that would do nothing is not offered.
  expect(
    await screen.findByText(/Every one of those days is already scheduled/),
  ).toBeVisible();
  expect(screen.queryByRole('button', { name: /^Import / })).toBeNull();

  await user.click(screen.getByRole('radio', { name: 'Replace them' }));

  expect(
    screen.getByRole('button', { name: 'Import 36 verses' }),
  ).toBeVisible();
});

test('a batch with nothing usable in it says so instead of offering a write', async () => {
  const user = userEvent.setup();
  render(
    <ImportPanel
      check={answering({
        ...QUARTER,
        new: 0,
        existing: 0,
        invalid: 3,
      })}
      apply={neverApplies}
    />,
  );

  await check(user);

  expect(
    await screen.findByText('Nothing in that paste can be imported.'),
  ).toBeVisible();
  expect(screen.queryByRole('button', { name: /^Import / })).toBeNull();
  // The rows are still listed: knowing which lines to fix is the whole point of the step.
  expect(screen.getByText('Row 84')).toBeVisible();
});

test('a preview that never came back is reported, and the paste survives it', async () => {
  const user = userEvent.setup();
  const failing: CheckAction = () => {
    // What a browser reports when the request never left or the answer never came back.
    throw new TypeError('Failed to fetch');
  };
  render(<ImportPanel check={failing} apply={neverApplies} />);

  await check(user);

  expect(await screen.findByText(/You appear to be offline/)).toBeVisible();
  expect(screen.getByLabelText('Paste from your spreadsheet')).toHaveValue(
    PASTE,
  );
});

test('a leader who reaches the import screen is pointed at their own queue', async () => {
  const user = userEvent.setup();
  const refusing: CheckAction = () =>
    Promise.resolve({ status: 'failed', reason: 'refused' });
  const apply = vi.fn();
  render(<ImportPanel check={refusing} apply={apply} />);

  await check(user);

  expect(
    await screen.findByText('The verse schedule is kept by a ministry admin'),
  ).toBeVisible();
  expect(
    screen.getByRole('link', { name: 'Go to your queue' }),
  ).toHaveAttribute('href', '/people/requests');
  expect(apply).not.toHaveBeenCalled();
});
