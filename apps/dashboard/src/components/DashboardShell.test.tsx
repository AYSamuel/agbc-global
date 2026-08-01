import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';

import type { Caller } from '@/server/authorize';
import { expectNoA11yViolations } from '@/test/a11y';

import { DashboardShell } from './DashboardShell';

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
    <DashboardShell caller={LEADER} current="moderation" waiting={2}>
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
    <DashboardShell caller={ADMIN} current="moderation">
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
    <DashboardShell caller={LEADER} current="moderation" waiting={2}>
      <p>content</p>
    </DashboardShell>,
  );

  expect(
    screen.getByRole('link', { name: /2 people are waiting on you/ }),
  ).toBeVisible();
});

test('nothing waiting shows no badge at all', () => {
  render(
    <DashboardShell caller={LEADER} current="moderation" waiting={0}>
      <p>content</p>
    </DashboardShell>,
  );

  expect(screen.queryByText(/waiting on you/)).toBeNull();
});
