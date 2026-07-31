import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';

import type { BranchOption, FoundPerson } from '@/server/assignRole';
import { expectNoA11yViolations } from '@/test/a11y';

import { PersonForm } from './PersonForm';
import type { AssignAction, AssignState } from './state';

/**
 * The change itself: the role, the branch that comes with it, and the code.
 *
 * The action is a stub, and the assertions that matter are about what this form SENDS
 * it. A demotion that quietly carried a branch, or a submit that reached the server
 * without a code, would both look perfectly fine on screen.
 */

const BRANCHES: BranchOption[] = [
  { id: 'branch-berlin', name: 'AGBC Lighthouse Berlin' },
  { id: 'branch-emmen', name: 'AGBC Emmen' },
];

const GRACE: FoundPerson = {
  id: 'person-2',
  email: 'grace.achebe@example.com',
  displayName: 'Grace Achebe',
  role: 'leader',
  branchId: 'branch-emmen',
  branchName: 'AGBC Emmen',
  onboarded: true,
  joinedAt: '2023-06-01T09:00:00.000Z',
};

const TOLU: FoundPerson = {
  ...GRACE,
  id: 'person-1',
  displayName: 'Tolu Adeyemi',
  role: 'member',
  branchId: 'branch-berlin',
  branchName: 'AGBC Lighthouse Berlin',
  joinedAt: '2024-03-04T10:00:00.000Z',
};

/** Records what the form submitted, and answers with whatever the test needs. */
function recording(answer: AssignState = { status: 'idle' }) {
  const sent: FormData[] = [];
  const assign: AssignAction = (_previous, formData) => {
    sent.push(formData);
    return Promise.resolve(answer);
  };
  return { assign, sent };
}

function fields(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

test('the person, their current role, and a code field that expects an authenticator', async () => {
  const { container } = render(
    <PersonForm
      person={TOLU}
      branches={BRANCHES}
      onlyLeader={false}
      assign={recording().assign}
      onFinished={vi.fn()}
      onCancel={vi.fn()}
    />,
  );

  expect(screen.getByText('Tolu Adeyemi')).toBeVisible();
  expect(screen.getByText('AGBC Lighthouse Berlin')).toBeVisible();
  expect(screen.getByText('Member since 2024')).toBeVisible();

  expect(screen.getByRole('radio', { name: 'Member' })).toBeChecked();

  const code = screen.getByLabelText('Code from your authenticator');
  expect(code).toBeRequired();
  expect(code).toHaveAttribute('autocomplete', 'one-time-code');
  expect(code).toHaveAttribute('inputmode', 'numeric');
  expect(code).toHaveAttribute('maxlength', '6');

  await expectNoA11yViolations(container);
});

test('the branch chooser belongs to a leader grant, and only to one', async () => {
  const user = userEvent.setup();
  render(
    <PersonForm
      person={TOLU}
      branches={BRANCHES}
      onlyLeader={false}
      assign={recording().assign}
      onFinished={vi.fn()}
      onCancel={vi.fn()}
    />,
  );

  expect(screen.queryByLabelText('Branch they will lead')).toBeNull();

  await user.click(screen.getByRole('radio', { name: 'Leader' }));

  expect(screen.getByLabelText('Branch they will lead')).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'Make Tolu a leader' }),
  ).toBeVisible();
});

test('demoting sends no branch, so nobody is quietly moved', async () => {
  const user = userEvent.setup();
  const { assign, sent } = recording();
  render(
    <PersonForm
      person={GRACE}
      branches={BRANCHES}
      onlyLeader={false}
      assign={assign}
      onFinished={vi.fn()}
      onCancel={vi.fn()}
    />,
  );

  await user.click(screen.getByRole('radio', { name: 'Member' }));
  await user.type(
    screen.getByLabelText('Code from your authenticator'),
    '123456',
  );
  await user.click(screen.getByRole('button', { name: 'Make Grace a member' }));

  await waitFor(() => {
    expect(sent).toHaveLength(1);
  });
  expect(fields(sent[0])).toEqual({
    targetId: 'person-2',
    role: 'member',
    code: '123456',
  });
});

test('a leader grant sends the chosen branch', async () => {
  const user = userEvent.setup();
  const { assign, sent } = recording();
  render(
    <PersonForm
      person={TOLU}
      branches={BRANCHES}
      onlyLeader={false}
      assign={assign}
      onFinished={vi.fn()}
      onCancel={vi.fn()}
    />,
  );

  await user.click(screen.getByRole('radio', { name: 'Leader' }));
  await user.selectOptions(
    screen.getByLabelText('Branch they will lead'),
    'branch-emmen',
  );
  await user.type(
    screen.getByLabelText('Code from your authenticator'),
    '654321',
  );
  await user.click(screen.getByRole('button', { name: 'Make Tolu a leader' }));

  await waitFor(() => {
    expect(sent).toHaveLength(1);
  });
  expect(fields(sent[0])).toEqual({
    targetId: 'person-1',
    role: 'leader',
    branchId: 'branch-emmen',
    code: '654321',
  });
});

test('taking a branch its only leader warns, and still allows it', async () => {
  const user = userEvent.setup();
  const { container } = render(
    <PersonForm
      person={GRACE}
      branches={BRANCHES}
      onlyLeader
      assign={recording().assign}
      onFinished={vi.fn()}
      onCancel={vi.fn()}
    />,
  );

  // Nothing has changed yet: Grace still leads Emmen.
  expect(screen.queryByText('AGBC Emmen would have no leader')).toBeNull();

  await user.click(screen.getByRole('radio', { name: 'Member' }));

  expect(screen.getByText('AGBC Emmen would have no leader')).toBeVisible();
  expect(screen.getByText(/You can still do this/)).toBeVisible();
  // A warning, not a refusal.
  expect(
    screen.getByRole('button', { name: 'Make Grace a member' }),
  ).toBeEnabled();
  await expectNoA11yViolations(container);

  await user.click(screen.getByRole('radio', { name: 'Leader' }));

  expect(screen.queryByText('AGBC Emmen would have no leader')).toBeNull();
});

test('a refused code is explained, focused, and marks the field', async () => {
  const user = userEvent.setup();
  const { assign } = recording({ status: 'failed', reason: 'bad_code' });
  render(
    <PersonForm
      person={TOLU}
      branches={BRANCHES}
      onlyLeader={false}
      assign={assign}
      onFinished={vi.fn()}
      onCancel={vi.fn()}
    />,
  );

  const code = screen.getByLabelText('Code from your authenticator');
  await user.type(code, '000000');
  await user.click(screen.getByRole('button', { name: 'Make Tolu a member' }));

  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent('That code did not work');
  // Focus this form's own error handler moved, which is the point of the assertion:
  // "something is wrong somewhere above" is not recoverable for a screen reader user.
  await waitFor(() => {
    expect(alert).toHaveFocus();
  });
  expect(code).toHaveAttribute('aria-invalid', 'true');
});

test('a change that lands says what it means for the person', async () => {
  const user = userEvent.setup();
  const onFinished = vi.fn();
  const { assign } = recording({ status: 'done', role: 'leader' });
  render(
    <PersonForm
      person={TOLU}
      branches={BRANCHES}
      onlyLeader={false}
      assign={assign}
      onFinished={onFinished}
      onCancel={vi.fn()}
    />,
  );

  await user.click(screen.getByRole('radio', { name: 'Leader' }));
  await user.selectOptions(
    screen.getByLabelText('Branch they will lead'),
    'branch-emmen',
  );
  await user.type(
    screen.getByLabelText('Code from your authenticator'),
    '123456',
  );
  await user.click(screen.getByRole('button', { name: 'Make Tolu a leader' }));

  expect(await screen.findByRole('status')).toHaveTextContent(
    'Tolu Adeyemi leads AGBC Emmen now.',
  );
  // The form is gone rather than sitting there showing a role that is no longer true,
  // and its heading goes with it: "This person" sitting over a success message about
  // somebody no longer on screen is how it read before the heading moved in here.
  expect(screen.queryByRole('radio', { name: 'Leader' })).toBeNull();
  expect(screen.queryByText('This person')).toBeNull();

  await user.click(screen.getByRole('button', { name: 'Find someone else' }));
  expect(onFinished).toHaveBeenCalledTimes(1);
});
