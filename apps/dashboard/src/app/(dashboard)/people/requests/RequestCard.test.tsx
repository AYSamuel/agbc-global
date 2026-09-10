import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';

import type { BranchRequest } from '@/server/branchRequests';
import { expectNoA11yViolations } from '@/test/a11y';

import { RefuseForm } from './RefuseForm';
import { PastMove, WaitingRequest } from './RequestCard';

/**
 * The three request surfaces, rendered directly.
 *
 * Times are passed in rather than read from the clock, so "waiting 3 days" is a fact about
 * the fixture and not about when the suite happens to run.
 */

const SARAH: BranchRequest = {
  id: 'request-1',
  displayName: 'Sarah Okafor',
  fromBranchId: 'branch-glasgow',
  fromBranchName: 'AGBC Glasgow',
  toBranchId: 'branch-berlin',
  toBranchName: 'AGBC Lighthouse Berlin',
  createdAt: '2026-05-11T09:00:00.000Z',
  decidedAt: null,
};

const NOW = new Date('2026-05-14T09:00:00.000Z').getTime();

test('a waiting request names the person, the move, and both ways to decide it', async () => {
  const { container } = render(<WaitingRequest request={SARAH} now={NOW} />);

  expect(screen.getByText('Sarah Okafor')).toBeVisible();
  expect(screen.getByText('AGBC Glasgow')).toBeVisible();
  expect(screen.getByText('AGBC Lighthouse Berlin')).toBeVisible();
  expect(screen.getByText('Wants to join')).toBeVisible();

  expect(screen.getByRole('button', { name: 'Approve' })).toBeVisible();
  // A link rather than a script: the refusal view is a URL, so it works without
  // JavaScript and survives a refresh.
  expect(
    screen.getByRole('link', { name: 'Refuse with a reason' }),
  ).toHaveAttribute('href', '/people/requests?refuse=request-1');

  await expectNoA11yViolations(container);
});

test('waiting past the escalation threshold is called out, and before it is not', () => {
  const { rerender } = render(<WaitingRequest request={SARAH} now={NOW} />);
  expect(screen.getByText('Waiting 3 days')).toBeVisible();

  // One hour after it was asked for: the same card, with nothing shouting.
  rerender(
    <WaitingRequest
      request={SARAH}
      now={new Date('2026-05-11T10:00:00.000Z').getTime()}
    />,
  );
  expect(screen.queryByText(/^Waiting /)).toBeNull();
});

test('a completed move out is read-only, which is the whole of decision 14', async () => {
  const { container } = render(
    <PastMove
      request={{
        ...SARAH,
        decidedAt: '2026-05-14T11:00:00.000Z',
      }}
    />,
  );

  expect(screen.getByText('Sarah Okafor')).toBeVisible();
  expect(screen.getByText('Left')).toBeVisible();
  expect(screen.getByText('14 May')).toBeVisible();
  // The absence IS the feature: a leader is told after the fact and cannot block someone
  // leaving, so there is nothing here to press.
  expect(screen.queryByRole('button')).toBeNull();
  expect(screen.queryByRole('link')).toBeNull();

  await expectNoA11yViolations(container);
});

test('refusing asks for the note, and says first who will and will not read it', async () => {
  const { container } = render(<RefuseForm request={SARAH} />);

  expect(screen.getByText('Refusing Sarah Okafor')).toBeVisible();

  const note = screen.getByLabelText('Why, for the ministry record');
  expect(note).toBeRequired();
  expect(note).toHaveAttribute(
    'placeholder',
    'Required. Written for whoever reviews this later.',
  );

  // Said BEFORE it is written: the note's shape depends on knowing the member never sees
  // it, never learns who decided, and that the leader cannot read it back either.
  expect(
    screen.getByText(
      'Sarah Okafor will not see this, and will not see your name',
    ),
  ).toBeVisible();
  expect(
    screen.getByText(/pointed at AGBC Lighthouse Berlin's contact address/),
  ).toBeVisible();
  expect(screen.getByText(/can be read by an admin/)).toBeVisible();

  expect(
    screen.getByRole('button', { name: 'Refuse this request' }),
  ).toBeVisible();
  expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute(
    'href',
    '/people/requests',
  );

  await expectNoA11yViolations(container);
});
