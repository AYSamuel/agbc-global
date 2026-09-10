import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';

import type { QueueItem } from '@/server/moderationQueue';
import { expectNoA11yViolations } from '@/test/a11y';
import { deferred } from '@/test/deferred';

import { QueueActions } from './QueueActions';

/**
 * That a decision SAYS it is running (W4.12 slice 2).
 *
 * These are the busiest controls in the product and until W4.12 all three were silent: the
 * only sign a click had registered was the page eventually changing, a whole server round
 * trip later. `SubmitButton.tsx` was written partly for this queue and never wired to it.
 *
 * The action is stubbed with a promise the test controls, because "pending" only exists
 * while a submission is in flight and a real action would settle before anything could be
 * asserted. What is under test is this component's wiring, not the decision itself, which
 * `moderateItem.test.ts` proves against the database.
 */
const decide = vi.fn();
vi.mock('@/app/(dashboard)/moderation/actions', () => ({
  decide: (formData: FormData) => decide(formData) as unknown,
}));

const ITEM: QueueItem = {
  id: 'testimony-1',
  kind: 'testimony',
  branchId: 'branch-glasgow',
  branchName: 'AGBC Glasgow',
  body: 'He provided a job after eight months of waiting.',
  language: 'en',
  createdAt: '2026-08-02T09:00:00Z',
  updatedAt: '2026-08-02T09:00:00Z',
  photoUrl: null,
  isAnonymous: false,
  isAnsweredPrayer: false,
  authorName: 'Sarah Oyelaran',
};

/** Holds the action open so the pending state is observable, then lets it finish. */
function heldAction() {
  const { promise, release } = deferred();
  decide.mockReturnValue(promise);
  return release;
}

test('Approve says it is approving while the decision is in flight', async () => {
  const user = userEvent.setup();
  const release = heldAction();
  render(<QueueActions item={ITEM} />);

  const approve = screen.getByRole('button', { name: 'Approve' });
  await user.click(approve);

  const pending = await screen.findByRole('button', { name: 'Approving…' });
  expect(pending).toBeDisabled();
  expect(pending).toHaveAttribute('aria-busy', 'true');

  release();
  await waitFor(() => {
    expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled();
  });
});

test('Reject says it is sending back, not approving', async () => {
  const user = userEvent.setup();
  const release = heldAction();
  render(<QueueActions item={ITEM} />);

  // The reason is required, and the disclosure has to be opened to reach it.
  await user.click(screen.getByText('Reject with reason'));
  await user.type(
    screen.getByLabelText(/What should they change/),
    'Please take the phone number out.',
  );
  await user.click(
    screen.getByRole('button', { name: 'Send this back to the author' }),
  );

  expect(
    await screen.findByRole('button', { name: 'Sending back…' }),
  ).toBeDisabled();
  // The other two decisions must not claim to be running.
  expect(screen.queryByRole('button', { name: 'Approving…' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Removing…' })).toBeNull();

  release();
});

test('Remove says it is removing', async () => {
  const user = userEvent.setup();
  const release = heldAction();
  render(<QueueActions item={ITEM} />);

  await user.click(screen.getByText('Remove'));
  await user.type(
    screen.getByLabelText(/Why is this being removed/),
    'Names a child by name.',
  );
  await user.click(screen.getByRole('button', { name: 'Remove permanently' }));

  expect(
    await screen.findByRole('button', { name: 'Removing…' }),
  ).toBeDisabled();
  release();
});

test('the decisions have no accessibility violations', async () => {
  const { container } = render(<QueueActions item={ITEM} />);

  await expectNoA11yViolations(container);
});
