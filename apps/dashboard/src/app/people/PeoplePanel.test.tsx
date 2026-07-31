import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';

import type { BranchOption, FoundPerson } from '@/server/assignRole';
import { expectNoA11yViolations } from '@/test/a11y';

import { PeoplePanel } from './PeoplePanel';
import type { AssignAction, FindAction, LookupState } from './state';

/**
 * The lookup, with the two actions passed in as stubs.
 *
 * Stubs rather than mocks of the real module: the panel takes both actions as props
 * precisely so this file can hand it an answer without a database, and so nothing here
 * has to know how `find()` reaches Supabase. What is under test is the SCREEN: what it
 * says when an address matches nobody, and how somebody gets back from there.
 */

const BRANCHES: BranchOption[] = [
  { id: 'branch-berlin', name: 'AGBC Lighthouse Berlin' },
  { id: 'branch-glasgow', name: 'AGBC Glasgow' },
];

const TOLU: FoundPerson = {
  id: 'person-1',
  email: 'tolu.adeyemi@example.com',
  displayName: 'Tolu Adeyemi',
  role: 'member',
  branchId: 'branch-berlin',
  branchName: 'AGBC Lighthouse Berlin',
  onboarded: true,
  joinedAt: '2024-03-04T10:00:00.000Z',
};

function answering(state: (email: string) => LookupState): FindAction {
  return (_previous, formData) => {
    const entry = formData.get('email');
    return Promise.resolve(state(typeof entry === 'string' ? entry : ''));
  };
}

const neverAssigns: AssignAction = () =>
  Promise.resolve({ status: 'failed', reason: 'failed' });

test('the lookup explains the rule, labels its field, and passes axe', async () => {
  const { container } = render(
    <PeoplePanel
      branches={BRANCHES}
      find={answering(() => ({ status: 'idle' }))}
      assign={neverAssigns}
    />,
  );

  const field = screen.getByLabelText('Email address');
  expect(field).toHaveAttribute('type', 'email');
  // Somebody else's address: offering the admin their own would autofill the one
  // address this screen refuses.
  expect(field).toHaveAttribute('autocomplete', 'off');
  expect(
    screen.getByText('Type the address exactly as they sign in with it.'),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/no member list and no partial search/),
  ).toBeVisible();

  await expectNoA11yViolations(container);
});

test('an address with no account is named, and Look again returns to the field', async () => {
  const user = userEvent.setup();
  const { container } = render(
    <PeoplePanel
      branches={BRANCHES}
      find={answering((email) => ({
        status: 'failed',
        email,
        reason: 'no_account',
      }))}
      assign={neverAssigns}
    />,
  );

  await user.type(screen.getByLabelText('Email address'), 'nobody@example.com');
  await user.click(screen.getByRole('button', { name: 'Find' }));

  expect(
    await screen.findByText('No account for nobody@example.com'),
  ).toBeVisible();
  expect(
    screen.getByText(/ask them to open the app and sign in once/),
  ).toBeVisible();
  await expectNoA11yViolations(container);

  await user.click(screen.getByRole('button', { name: 'Look again' }));

  expect(screen.queryByText('No account for nobody@example.com')).toBeNull();
  expect(screen.getByRole('button', { name: 'Find' })).toBeVisible();
  expect(screen.getByLabelText('Email address')).toHaveValue('');
});

test('each refusal says what actually happened, rather than one vague answer', async () => {
  const user = userEvent.setup();
  render(
    <PeoplePanel
      branches={BRANCHES}
      find={answering((email) => ({
        status: 'failed',
        email,
        reason: 'not_onboarded',
      }))}
      assign={neverAssigns}
    />,
  );

  await user.type(screen.getByLabelText('Email address'), 'half@example.com');
  await user.click(screen.getByRole('button', { name: 'Find' }));

  // The reversal this slice carries: an admin who can already read every profile is told
  // a half-finished account apart from a typo.
  expect(
    await screen.findByText('They have not finished joining yet'),
  ).toBeVisible();
  expect(screen.queryByText(/No account for/)).toBeNull();
});

test('a match hands the person to the form, and the address becomes a record', async () => {
  const user = userEvent.setup();
  render(
    <PeoplePanel
      branches={BRANCHES}
      find={answering((email) => ({
        status: 'found',
        email,
        person: TOLU,
        onlyLeader: false,
      }))}
      assign={neverAssigns}
    />,
  );

  await user.type(
    screen.getByLabelText('Email address'),
    'tolu.adeyemi@example.com',
  );
  await user.click(screen.getByRole('button', { name: 'Find' }));

  expect(await screen.findByText('Tolu Adeyemi')).toBeVisible();
  expect(screen.getByText('This person')).toBeVisible();
  // The frames drop the hint and the Find button once a lookup has happened: what is
  // left is what was asked, and the way on is Cancel.
  expect(screen.getByLabelText('Email address')).toHaveAttribute('readonly');
  expect(screen.queryByRole('button', { name: 'Find' })).toBeNull();
});
