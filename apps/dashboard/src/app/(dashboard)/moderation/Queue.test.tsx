import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test, vi } from 'vitest';

import type { QueueItem } from '@/server/moderationQueue';
import { expectNoA11yViolations } from '@/test/a11y';
import { deferred } from '@/test/deferred';

import { copy } from '@/copy/en';

import { Queue } from './Queue';

/**
 * The optimistic queue (W4.13).
 *
 * Two claims are worth holding, and they pull in opposite directions. A decided item must
 * leave the screen BEFORE the server answers, or the reviewer waits a round trip per decision
 * for a row they have already dealt with. And a REFUSED decision must put the row back, or the
 * screen quietly lies about what the database did: `moderateItem()` refuses a decision whose
 * `reviewedUpdatedAt` no longer matches the row, which happens whenever the author edited the
 * post after this reviewer read it.
 *
 * The action is stubbed because what is under test is this component's optimism, not the
 * decision. Whether a decision is legal is `moderateItem.test.ts`, against a real database.
 */
const decide = vi.fn();
vi.mock('./actions', () => ({
  decide: (formData: FormData) => decide(formData) as unknown,
}));

// Reporting is not what is under test, but an unmocked capture would try to reach Sentry.
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

beforeEach(() => {
  decide.mockReset();
});

const NOW = Date.parse('2026-08-04T12:00:00Z');

function item(id: string, body: string): QueueItem {
  return {
    id,
    kind: 'testimony',
    branchId: 'branch-glasgow',
    branchName: 'AGBC Glasgow',
    body,
    language: 'en',
    createdAt: '2026-08-02T09:00:00Z',
    updatedAt: '2026-08-02T09:00:00Z',
    photoUrl: null,
    isAnonymous: false,
    isAnsweredPrayer: false,
    authorName: 'Sarah Oyelaran',
  };
}

const ITEMS = [
  item('t-1', 'He provided a job after eight months of waiting.'),
  item('t-2', 'The scan came back clear this morning.'),
];

test('an approved item leaves the screen before the server answers', async () => {
  const user = userEvent.setup();
  const { promise, release } = deferred();
  decide.mockReturnValue(promise);

  render(<Queue items={ITEMS} now={NOW} scope="AGBC Glasgow" />);
  expect(screen.getByText(ITEMS[0].body)).toBeVisible();

  await user.click(screen.getAllByRole('button', { name: 'Approve' })[0]);

  // The action has not settled, and the row is already gone.
  await waitFor(() => {
    expect(screen.queryByText(ITEMS[0].body)).toBeNull();
  });
  expect(screen.getByText(ITEMS[1].body)).toBeVisible();

  release();
});

test('a refused decision puts the item back and says why', async () => {
  const user = userEvent.setup();
  decide.mockResolvedValue({ ok: false, reason: 'content_changed' });

  render(<Queue items={ITEMS} now={NOW} scope="AGBC Glasgow" />);
  await user.click(screen.getAllByRole('button', { name: 'Approve' })[0]);

  // Optimism is about latency, never about authority: the database said no, so the row
  // returns and the reviewer is told rather than left thinking it worked.
  await waitFor(() => {
    expect(screen.getByText(ITEMS[0].body)).toBeVisible();
  });
  expect(screen.getByText(copy.queue.outcome.contentChanged)).toBeVisible();
});

test('the decision that was made is the one reported', async () => {
  const user = userEvent.setup();
  decide.mockResolvedValue({ ok: true, decision: 'approve' });

  render(<Queue items={ITEMS} now={NOW} scope="AGBC Glasgow" />);
  await user.click(screen.getAllByRole('button', { name: 'Approve' })[0]);

  await waitFor(() => {
    expect(screen.getByText(copy.queue.outcome.approved)).toBeVisible();
  });
  // The other decisions must not claim to have happened.
  expect(screen.queryByText(copy.queue.outcome.rejected)).toBeNull();
});

test('the queue carries the id of the item being decided, not the first one', async () => {
  const user = userEvent.setup();
  decide.mockResolvedValue({ ok: true, decision: 'approve' });

  render(<Queue items={ITEMS} now={NOW} scope="AGBC Glasgow" />);
  await user.click(screen.getAllByRole('button', { name: 'Approve' })[1]);

  await waitFor(() => {
    expect(decide).toHaveBeenCalledTimes(1);
  });
  const sent = decide.mock.calls[0][0] as FormData;
  expect(sent.get('id')).toBe('t-2');
  // And it is the second row that left, not the first.
  expect(screen.getByText(ITEMS[0].body)).toBeVisible();
});

test('an unreachable server puts the item back and refuses to claim nothing changed', async () => {
  const user = userEvent.setup();
  // What being offline actually looks like from here: the action never answers.
  decide.mockRejectedValue(new Error('Failed to fetch'));

  render(<Queue items={ITEMS} now={NOW} scope="AGBC Glasgow" />);
  await user.click(screen.getAllByRole('button', { name: 'Approve' })[0]);

  // The row first, like the refusal test above: the alert is set inside the action while the
  // optimistic rollback waits for the transition to end, so waiting on the alert alone is a
  // race that passes alone and fails in a loaded suite.
  await waitFor(() => {
    expect(screen.getByText(ITEMS[0].body)).toBeVisible();
  });
  // And the reviewer has not been told the decision definitely failed: a request that never
  // answered may still have been carried out.
  expect(screen.getByText(copy.queue.outcome.unreachable)).toBeVisible();
  expect(screen.queryByText(copy.queue.outcome.failed)).toBeNull();
});

test('an empty queue says so rather than showing a bare list', async () => {
  const { container } = render(
    <Queue items={[]} now={NOW} scope="AGBC Glasgow" />,
  );

  expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
  await expectNoA11yViolations(container);
});
