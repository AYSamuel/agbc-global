import { render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import { expectNoA11yViolations } from '@/test/a11y';
import type { ReportedItem } from '@/server/reportsInbox';

import { ReportedCard } from './ReportedCard';

/**
 * What the card SAYS, which the server probes cannot check.
 *
 * The Server Action is stubbed because it is a network boundary this file has no business
 * crossing: what these tests are about is whether the words and the controls on the card
 * match the rules, and the rules themselves are proven in `resolveReports.test.ts`
 * against the database.
 */
vi.mock('@/app/reports/actions', () => ({ act: vi.fn() }));

const NOW = Date.parse('2026-08-04T12:00:00Z');

const ITEM: ReportedItem = {
  kind: 'testimony',
  id: 'testimony-1',
  branchId: 'branch-berlin',
  branchName: 'AGBC Lighthouse Berlin',
  body: 'Gott hat nach acht Monaten des Wartens eine Stelle gegeben.',
  language: 'de',
  updatedAt: '2026-07-24T09:00:00Z',
  postedAt: '2026-07-24T09:00:00Z',
  firstReportedAt: '2026-08-02T12:00:00Z',
  reportCount: 3,
  reasons: [
    { reason: 'private_details', count: 2 },
    { reason: 'not_for_this_space', count: 1 },
  ],
  isSafeguarding: false,
  isAnonymous: false,
  authorName: 'Sarah Oyelaran',
  contentStatus: 'approved',
};

const FLAGGED: ReportedItem = {
  ...ITEM,
  kind: 'prayer',
  id: 'prayer-1',
  isSafeguarding: true,
  isAnonymous: true,
  authorName: null,
  reportCount: 1,
  reasons: [{ reason: 'at_risk', count: 1 }],
};

test('one card carries the whole report: the words, the count, the reasons', async () => {
  const { container } = render(<ReportedCard item={ITEM} now={NOW} />);

  expect(screen.getByText(/Gott hat nach acht Monaten/)).toBeInTheDocument();
  expect(screen.getByText('3 reports')).toBeInTheDocument();
  expect(screen.getByText('Private details about someone')).toBeInTheDocument();
  expect(screen.getByText('Not for this space')).toBeInTheDocument();
  // The age of the WAIT, which is the first report and not the newest.
  expect(screen.getByText(/First reported 2 days ago/)).toBeInTheDocument();
  await expectNoA11yViolations(container);
});

test('the tally is read out in words, not left as a number in a box', () => {
  render(<ReportedCard item={ITEM} now={NOW} />);

  // "2" beside "Private details about someone" says nothing on its own.
  expect(screen.getByText('2 reports:')).toBeInTheDocument();
  expect(screen.getByText('1 report:')).toBeInTheDocument();
});

test('an anonymous prayer shows no author on the dashboard either', () => {
  render(<ReportedCard item={FLAGGED} now={NOW} />);

  expect(screen.getByText('Shared anonymously')).toBeInTheDocument();
  expect(screen.queryByText('Sarah Oyelaran')).not.toBeInTheDocument();
});

test('a flagged card offers no Dismiss, and says why', async () => {
  const { container } = render(<ReportedCard item={FLAGGED} now={NOW} />);

  expect(
    screen.queryByRole('button', { name: 'Dismiss reports' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Flag safeguarding' }),
  ).not.toBeInTheDocument();
  // The absence is a rule, so it is stated rather than left to be inferred.
  expect(
    screen.getByText(/stays open until the safeguarding process closes it/),
  ).toBeInTheDocument();
  await expectNoA11yViolations(container);
});

test('an unflagged card offers all four actions', () => {
  render(<ReportedCard item={ITEM} now={NOW} />);

  expect(
    screen.getByRole('button', { name: 'Dismiss reports' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Flag safeguarding' }),
  ).toBeInTheDocument();
  expect(screen.getByText('Reject with reason')).toBeInTheDocument();
  expect(screen.getByText('Remove')).toBeInTheDocument();
});

test('a post already removed is not offered for removal again', () => {
  render(
    <ReportedCard item={{ ...ITEM, contentStatus: 'removed' }} now={NOW} />,
  );

  expect(screen.queryByText('Reject with reason')).not.toBeInTheDocument();
  // A report can outlive the decision on its content, so the card says where the post is.
  expect(screen.getByText('Already removed')).toBeInTheDocument();
  // Dismissing the reports is still the leader's to do.
  expect(
    screen.getByRole('button', { name: 'Dismiss reports' }),
  ).toBeInTheDocument();
});

test('every form carries the version the leader read', () => {
  const { container } = render(<ReportedCard item={ITEM} now={NOW} />);

  const versions = container.querySelectorAll(
    'input[name="reviewedUpdatedAt"]',
  );
  expect(versions).toHaveLength(4);
  versions.forEach((input) => {
    expect(input).toHaveValue(ITEM.updatedAt);
  });
});
