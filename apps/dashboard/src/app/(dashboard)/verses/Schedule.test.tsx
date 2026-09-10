import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';

import type { Caller } from '@/server/authorize';
import type { VerseSchedule } from '@/server/verses';
import { expectNoA11yViolations } from '@/test/a11y';

import { Schedule } from './Schedule';

/**
 * The schedule, rendered directly with a caller and an answer.
 *
 * No database and no session: what is under test is the SCREEN. Whether a leader may read
 * `daily_verses` at all is the database's question (they may, it is public content), and
 * whether they may CHANGE it is answered by `import_daily_verses` and by the table's admin
 * policy, both covered in `server/verses.test.ts` against the real stack.
 */

const ADMIN: Caller = {
  userId: 'caller-admin',
  email: 'ay@example.com',
  displayName: 'Pastor AY Samuel',
  role: 'admin',
  branchId: 'branch-glasgow',
  branchName: 'AGBC Glasgow',
};

const LEADER: Caller = {
  ...ADMIN,
  userId: 'caller-leader',
  email: 'leader@example.com',
  displayName: 'Tolu Adeyemi',
  role: 'leader',
  branchId: 'branch-berlin',
  branchName: 'AGBC Lighthouse Berlin',
};

/** The frame's own numbers: three languages a quarter deep, German twelve days from empty. */
const SCHEDULE: VerseSchedule = {
  today: '2026-08-02',
  depth: [
    {
      language: 'de',
      runsOutOn: '2026-08-14',
      daysQueued: 12,
      staleFrom: '2026-08-13',
    },
    {
      language: 'en',
      runsOutOn: '2026-10-29',
      daysQueued: 88,
      staleFrom: '2026-10-28',
    },
    {
      language: 'fr',
      runsOutOn: '2026-10-29',
      daysQueued: 88,
      staleFrom: '2026-10-28',
    },
    {
      language: 'nl',
      runsOutOn: '2026-10-29',
      daysQueued: 88,
      staleFrom: '2026-10-28',
    },
  ],
  upcoming: [
    {
      date: '2026-08-02',
      language: 'en',
      reference: 'Psalm 23:1',
      text: 'The Lord is my shepherd; I shall lack nothing.',
      translation: 'WEB',
    },
    {
      date: '2026-08-03',
      language: 'de',
      reference: 'Psalm 23,1',
      text: 'Der HERR ist mein Hirte, mir wird nichts mangeln.',
      translation: 'WEB',
    },
  ],
};

test('depth is four numbers, and the low one is flagged in words as well as in red', async () => {
  const { container } = render(<Schedule caller={ADMIN} schedule={SCHEDULE} />);

  // Four, never one: a single total would read as healthy while German sat empty.
  expect(screen.getByText('12')).toBeVisible();
  expect(screen.getAllByText('88')).toHaveLength(3);

  // In the frame's order, English first, whatever order the database answered in (it sorts
  // worst-first, which is right for an alert and wrong for four cards somebody checks every
  // week: they would swap places as the queues moved).
  expect(screen.getAllByRole('term').map((term) => term.textContent)).toEqual([
    'English',
    'German running out',
    'Dutch',
    'French',
  ]);

  // The frame marks a language under the floor in red and in nothing else. Colour is not
  // a message, so the card says it too.
  expect(screen.getByText('German').closest('dt')).toHaveTextContent(
    /German\s+running out/,
  );
  expect(screen.getByText('English').closest('dt')).not.toHaveTextContent(
    /running out/,
  );

  // And the banner names the DATE rather than the count, because "runs out on 14 August"
  // is something a person can act on.
  expect(screen.getByText('German runs out on 14 August')).toBeVisible();
  expect(screen.getByRole('link', { name: 'Import German' })).toHaveAttribute(
    'href',
    '/verses/import',
  );

  await expectNoA11yViolations(container);
});

test('a leader is shown the way to their own queue, and never the schedule', async () => {
  // Handed the whole schedule on purpose: the page does not load it for a leader, and this
  // component refuses to render it even when it is there. One of the two would be enough
  // to keep it off the screen; the point is that neither can be forgotten alone.
  const { container } = render(
    <Schedule caller={LEADER} schedule={SCHEDULE} />,
  );

  expect(
    screen.getByText('The verse schedule is kept by a ministry admin'),
  ).toBeVisible();
  expect(screen.getByText(/Nothing is wrong with your account/)).toBeVisible();
  // Never a dead end: the refusal names what IS theirs and links to it (PR #116).
  expect(
    screen.getByRole('link', { name: 'Go to your queue' }),
  ).toHaveAttribute('href', '/people/requests');

  expect(screen.queryByText('Days queued ahead')).toBeNull();
  expect(screen.queryByText(/The Lord is my shepherd/)).toBeNull();
  expect(screen.queryByRole('link', { name: 'Import a batch' })).toBeNull();
  expect(screen.queryByRole('link', { name: 'Add one verse' })).toBeNull();

  await expectNoA11yViolations(container);
});

test('today is marked, and every row opens its own day and language', () => {
  render(<Schedule caller={ADMIN} schedule={SCHEDULE} />);

  // One row is today. The date comes from the database with the depth numbers, so the
  // pill and the counts cannot disagree about which day it is.
  expect(screen.getAllByText('Today')).toHaveLength(1);

  expect(
    screen.getByRole('link', { name: 'Edit 2 August English' }),
  ).toHaveAttribute('href', '/verses/2026-08-02/en');
  expect(
    screen.getByRole('link', { name: 'Edit 3 August German' }),
  ).toHaveAttribute('href', '/verses/2026-08-03/de');

  // No Remove on a row: this list is 90 days across four languages and the work is
  // scanning it. Remove lives on the screen Edit opens.
  expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
});

test('an empty schedule says what members are seeing, and offers the import', async () => {
  const { container } = render(
    <Schedule
      caller={ADMIN}
      schedule={{
        today: '2026-08-02',
        depth: SCHEDULE.depth.map((row) => ({
          language: row.language,
          runsOutOn: '2026-08-02',
          daysQueued: 0,
          staleFrom: null,
        })),
        upcoming: [],
      }}
    />,
  );

  expect(screen.getByText('No verses scheduled yet')).toBeVisible();
  expect(screen.getByText(/Members are seeing nothing on Home/)).toBeVisible();
  expect(
    screen.getAllByRole('link', { name: 'Import a batch' }).length,
  ).toBeGreaterThan(0);

  // Nothing queued anywhere, so the banner speaks about the language rather than a date,
  // and in words of its own: the guide box below already carries the general rule, and one
  // screen printing the same sentence twice reads as a bug. It names the WORST language,
  // which with everything at zero is the first the database returns: one banner and four
  // cards, as the frame draws it, the banner being the alarm and the cards the detail.
  expect(screen.getByText('German has no verses at all')).toBeVisible();
  expect(
    screen.getByText(/nothing older for the app to fall back on/),
  ).toBeVisible();

  await expectNoA11yViolations(container);
});

test('the last action is reported, counted, at the top of the list it changed', () => {
  const { rerender } = render(
    <Schedule caller={ADMIN} schedule={SCHEDULE} outcome="imported:312" />,
  );

  expect(
    screen.getByText(
      '312 verses are scheduled. Members will see them on the day.',
    ),
  ).toBeVisible();

  // And one verse is one verse. Fixing a single day is the common case once a quarter is
  // queued, so the count it reports back is the one most often read.
  rerender(
    <Schedule caller={ADMIN} schedule={SCHEDULE} outcome="imported:1" />,
  );
  expect(
    screen.getByText(
      'That verse is scheduled. Members will see it on the day.',
    ),
  ).toBeVisible();
});

test('an outcome nobody minted is ignored rather than rendered', () => {
  render(
    <Schedule caller={ADMIN} schedule={SCHEDULE} outcome="<script>hello" />,
  );

  expect(screen.queryByRole('status')).toBeNull();
  expect(screen.queryByRole('alert')).toBeNull();
});
