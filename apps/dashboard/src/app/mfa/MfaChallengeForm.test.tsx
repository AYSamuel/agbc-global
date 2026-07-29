import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';

import { expectNoA11yViolations } from '@/test/a11y';

import { MfaChallengeForm } from './MfaChallengeForm';

test('the challenge asks for a code with a real label and no axe violations', async () => {
  const { container } = render(<MfaChallengeForm next="/" />);

  const field = screen.getByLabelText('Six-digit code');
  expect(field).toHaveAttribute('autocomplete', 'one-time-code');
  expect(field).toHaveAttribute('inputmode', 'numeric');
  // Authentication is never a cognitive test, and paste is never blocked: nothing here
  // intercepts input beyond a length cap.
  expect(field).toHaveAttribute('maxlength', '6');

  await expectNoA11yViolations(container);
});

test('an empty code is refused locally, with focus moved to the field', async () => {
  const user = userEvent.setup();
  render(<MfaChallengeForm next="/" />);

  await user.click(screen.getByRole('button', { name: 'Confirm' }));

  const field = screen.getByLabelText('Six-digit code');
  expect(
    screen.getByText('Enter the six-digit code from your authenticator app.'),
  ).toBeInTheDocument();
  await waitFor(() => {
    expect(field).toHaveFocus();
  });
});
