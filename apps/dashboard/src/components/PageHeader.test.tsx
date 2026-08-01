import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';

import { expectNoA11yViolations } from '@/test/a11y';

import { PageHeader } from './PageHeader';

test('every dashboard page carries a way out, and it is a POST', async () => {
  // The gap this component closed: `/` had a sign-out and redirects straight to
  // `/moderation`, so a signed-in leader had no way out of the dashboard at all. Pinned
  // here rather than left to whoever writes the next page header.
  const { container } = render(
    <PageHeader title="People" scope="AGBC Glasgow" />,
  );

  expect(screen.getByRole('heading', { name: 'People' })).toBeVisible();
  expect(screen.getByText('AGBC Glasgow')).toBeVisible();

  const button = screen.getByRole('button', { name: 'Sign out' });
  expect(button).toHaveAttribute('type', 'submit');

  // A GET sign-out is triggerable by any image tag on any page.
  const form = button.closest('form');
  expect(form).toHaveAttribute('method', 'post');
  expect(form).toHaveAttribute('action', '/auth/sign-out');

  await expectNoA11yViolations(container);
});
