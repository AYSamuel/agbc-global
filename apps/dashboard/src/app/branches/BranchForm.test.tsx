import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';

import type { BranchRow } from '@/server/branches';
import { expectNoA11yViolations } from '@/test/a11y';

import { BranchForm } from './BranchForm';

/**
 * The repeatable rows: the service schedule and the leader list.
 *
 * Everything asserted here is about what SURVIVES a removal, because that is the one thing
 * these two lists do that no other field in this form does. The inputs inside them are
 * uncontrolled (`defaultValue`), deliberately, so a seventeen-field form does not re-render
 * on every keystroke. That makes their React keys load-bearing: `defaultValue` is read only
 * when React mounts the input, so a key that changes meaning between renders hands the
 * surviving row somebody else's DOM node with the previous occupant's text still in it.
 *
 * Keying by array index did exactly that, and it cost typed data rather than only looking
 * wrong. The two tests below remove the MIDDLE row, which is the only position where the
 * defect shows: removing the last row renumbers nothing.
 */

const noop = () => Promise.resolve({ status: 'idle' as const });

function branch(overrides: Partial<BranchRow> = {}): BranchRow {
  return {
    id: 'branch-glasgow',
    slug: 'glasgow',
    name: 'AGBC Glasgow',
    city: 'Glasgow',
    country: 'Scotland',
    isHq: true,
    status: 'active',
    timezone: 'Europe/London',
    languages: 'en',
    youtubeChannelId: null,
    email: 'glasgow@example.test',
    lat: 55.86,
    lng: -4.25,
    addressLine1: '1 Test Street',
    addressLine2: '',
    serviceTimes: 'Sundays at 11',
    lead: { name: 'A Leader', role: 'Pastor', bio: '' },
    leaders: [
      { name: 'First Leader', role: 'Elder' },
      { name: 'Second Leader', role: 'Deacon' },
      { name: 'Third Leader', role: 'Warden' },
    ],
    welcome: 'Welcome',
    order: 1,
    archivedAt: null,
    archivedBy: null,
    services: [
      { weekday: 0, startTime: '09:00', kind: 'sunday', label: 'Early' },
      { weekday: 0, startTime: '11:00', kind: 'sunday', label: 'Main' },
      { weekday: 3, startTime: '19:00', kind: 'midweek', label: 'Midweek' },
    ],
    memberCount: 12,
    ...overrides,
  };
}

test('removing the middle service keeps what was typed into the rows either side', async () => {
  const user = userEvent.setup();
  render(<BranchForm save={noop} existing={branch()} />);

  const before = screen.getAllByLabelText('What to call it');
  expect(before).toHaveLength(3);

  // Type into all three, so each row holds a value the state has never seen. This is what a
  // person editing a schedule actually does before deciding one of the rows should go.
  await user.clear(before[0]);
  await user.type(before[0], 'Sunrise');
  await user.clear(before[1]);
  await user.type(before[1], 'Midday');
  await user.clear(before[2]);
  await user.type(before[2], 'Evening');

  await user.click(screen.getByRole('button', { name: 'Remove Main' }));

  const after = screen.getAllByLabelText('What to call it');
  expect(after).toHaveLength(2);
  // The failure this guards: with index keys the second input came back holding 'Midday',
  // the text belonging to the row that was just removed, and 'Evening' was gone.
  expect(after.map((input) => (input as HTMLInputElement).value)).toEqual([
    'Sunrise',
    'Evening',
  ]);
});

test('removing the middle leader keeps what was typed into the rows either side', async () => {
  const user = userEvent.setup();
  render(<BranchForm save={noop} existing={branch()} />);

  // By PLACEHOLDER, not by label: the branch's own name field is labelled 'Name' too
  // (`copy.branches.nameLabel`), so querying the label matches four inputs rather than the
  // three leader rows. The placeholders differ ('AGBC Rotterdam' against 'Name').
  const before = screen.getAllByPlaceholderText('Name');
  expect(before).toHaveLength(3);

  await user.clear(before[0]);
  await user.type(before[0], 'Ada');
  await user.clear(before[1]);
  await user.type(before[1], 'Grace');
  await user.clear(before[2]);
  await user.type(before[2], 'Ruth');

  await user.click(
    screen.getByRole('button', { name: 'Remove Second Leader' }),
  );

  const after = screen.getAllByPlaceholderText('Name');
  expect(after).toHaveLength(2);
  expect(after.map((input) => (input as HTMLInputElement).value)).toEqual([
    'Ada',
    'Ruth',
  ]);
});

test('two rows added in a row stay independent of each other', async () => {
  const user = userEvent.setup();
  render(<BranchForm save={noop} existing={branch()} />);

  // This one guards the FIX rather than the bug, and it passed before the fix too. It is
  // here because the obvious cheap repair, keying on the row's own content, would put two
  // freshly added rows under the same key: both are blank. Typing into one would then show
  // up in the other, which is the same defect wearing different clothes.
  await user.click(screen.getByRole('button', { name: 'Add a service' }));
  await user.click(screen.getByRole('button', { name: 'Add a service' }));

  const labels = screen.getAllByLabelText('What to call it');
  expect(labels).toHaveLength(5);

  await user.type(labels[3], 'Youth');

  expect((labels[3] as HTMLInputElement).value).toBe('Youth');
  expect((labels[4] as HTMLInputElement).value).toBe('');
});

test('the same form mounted twice produces the same row ids', () => {
  // The stand-in for a hydration check, which jsdom cannot do directly: Next server-renders
  // this client component for the initial HTML, so the ids the server writes must be the ids
  // the browser mints. Two mounts approximate the two renders. A counter that outlived a
  // single form, a module-level one for instance, would number the second mount higher and
  // ship a hydration mismatch that every other test in this file would still pass.
  const first = render(<BranchForm save={noop} existing={branch()} />);
  const before = [
    ...first.container.querySelectorAll('input[name="serviceLabel"]'),
  ].map((input) => input.id);
  first.unmount();

  const second = render(<BranchForm save={noop} existing={branch()} />);
  const after = [
    ...second.container.querySelectorAll('input[name="serviceLabel"]'),
  ].map((input) => input.id);

  expect(after).toEqual(before);
  expect(before.every((id) => id.length > 0)).toBe(true);
});

test('the form has no accessibility violations with its repeatable rows', async () => {
  const { container } = render(<BranchForm save={noop} existing={branch()} />);

  await expectNoA11yViolations(container);
});
