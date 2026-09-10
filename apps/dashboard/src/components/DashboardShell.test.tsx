import { render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';

import type { Caller } from '@/server/authorize';
import { expectNoA11yViolations } from '@/test/a11y';

import { DashboardShell } from './DashboardShell';

/**
 * The rail reads the active route from the router itself since W4.12 slice 4, so the tests
 * have to supply one. Only the segment is stubbed, not the rail: what these assert is what
 * the rail DOES with a segment, and a hand-rolled rail would only prove it matches this
 * file's belief about itself.
 */
let segment = 'moderation';
vi.mock('next/navigation', () => ({
  useSelectedLayoutSegment: () => segment,
}));

const LEADER: Caller = {
  userId: 'user-1',
  email: 'grace@example.test',
  displayName: 'Grace Bello',
  role: 'leader',
  branchId: 'branch-berlin',
  branchName: 'AGBC Lighthouse Berlin',
};

const ADMIN: Caller = { ...LEADER, role: 'admin', displayName: 'Pastor AY' };

/**
 * The rail's People row, which means different work depending on who is reading it.
 *
 * Pinned because it was wrong on device: the row pointed at `/people` for everyone, so a
 * leader following it met "roles are handed out by an admin" with no route onward, while
 * the badge beside the row counted the very requests it was hiding.
 */
test('a leader’s People row goes to the queue that is actually theirs', async () => {
  const { container } = render(
    <DashboardShell caller={LEADER} waiting={2}>
      <p>content</p>
    </DashboardShell>,
  );

  expect(screen.getByRole('link', { name: /People/ })).toHaveAttribute(
    'href',
    '/people/requests',
  );
  await expectNoA11yViolations(container);
});

test('an admin’s People row goes to role assignment', () => {
  render(
    <DashboardShell caller={ADMIN}>
      <p>content</p>
    </DashboardShell>,
  );

  expect(screen.getByRole('link', { name: /People/ })).toHaveAttribute(
    'href',
    '/people',
  );
});

test('the waiting count is read out, not conveyed by a bare number', () => {
  render(
    <DashboardShell caller={LEADER} waiting={2}>
      <p>content</p>
    </DashboardShell>,
  );

  expect(
    screen.getByRole('link', { name: /2 people are waiting on you/ }),
  ).toBeVisible();
});

test('nothing waiting shows no badge at all', () => {
  render(
    <DashboardShell caller={LEADER} waiting={0}>
      <p>content</p>
    </DashboardShell>,
  );

  expect(screen.queryByText(/waiting on you/)).toBeNull();
});

/**
 * The active row, which used to be a prop every one of 31 call sites had to get right and
 * is now read from the router. Both directions are asserted: naming the row is not enough
 * if every other row claims to be current too.
 */
test('the rail marks the row matching the current segment, and only that row', () => {
  segment = 'reports';
  render(
    <DashboardShell caller={LEADER}>
      <p>content</p>
    </DashboardShell>,
  );

  expect(screen.getByRole('link', { name: /Reports/ })).toHaveAttribute(
    'aria-current',
    'page',
  );
  expect(screen.getByRole('link', { name: /Moderation/ })).not.toHaveAttribute(
    'aria-current',
  );
});

test('the sermon audio row lights up, though its key and its segment differ', () => {
  // `sermonAudio` as a key, `sermon-audio` as a route. The segment is derived from the
  // href for exactly this row; keying off `destination.key` would leave it dark forever.
  segment = 'sermon-audio';
  render(
    <DashboardShell caller={LEADER}>
      <p>content</p>
    </DashboardShell>,
  );

  expect(screen.getByRole('link', { name: /Sermon audio/ })).toHaveAttribute(
    'aria-current',
    'page',
  );
});
