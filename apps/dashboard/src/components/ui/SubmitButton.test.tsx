import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { expectNoA11yViolations } from '@/test/a11y';

import { SubmitButton } from './SubmitButton';

/**
 * `useFormStatus` reads React's own form context, which is why this button has to be its
 * own component. The hook is stubbed here rather than a real submission driven, because what
 * is under test is the BUTTON's response to a pending form, not React's ability to report
 * one.
 */
const pending = { value: false };
vi.mock('react-dom', async () => {
  const actual = await vi.importActual<typeof import('react-dom')>('react-dom');
  return { ...actual, useFormStatus: () => ({ pending: pending.value }) };
});

describe('SubmitButton', () => {
  it('shows its label and stays live when the form is idle', () => {
    pending.value = false;
    render(<SubmitButton label="Approve and send" pendingLabel="Sending..." />);

    const button = screen.getByRole('button', { name: 'Approve and send' });
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute('aria-busy', 'true');
  });

  it('disables itself while the form is submitting', () => {
    // The point of the whole component: a control that stays live while it works is a
    // control that invites the second click, and on the broadcast queue that second click
    // is another attempt to release a message to the whole ministry.
    pending.value = true;
    render(<SubmitButton label="Approve and send" pendingLabel="Sending..." />);

    const button = screen.getByRole('button', { name: 'Sending...' });
    expect(button).toBeDisabled();
  });

  it('announces itself as busy, not only greys out', () => {
    pending.value = true;
    render(<SubmitButton label="Approve and send" pendingLabel="Sending..." />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true');
  });

  it('says what is happening rather than "Loading"', () => {
    pending.value = true;
    render(<SubmitButton label="Stop sending" pendingLabel="Stopping..." />);
    expect(screen.getByText('Stopping...')).toBeInTheDocument();
  });

  it('keeps the variant it was given', () => {
    pending.value = false;
    render(
      <SubmitButton
        variant="secondary"
        label="Send back"
        pendingLabel="Sending back..."
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Send back' }),
    ).toBeInTheDocument();
  });

  it('has no accessibility violations in either state', async () => {
    pending.value = false;
    const idle = render(
      <SubmitButton label="Approve and send" pendingLabel="Sending..." />,
    );
    await expectNoA11yViolations(idle.container);

    pending.value = true;
    const busy = render(
      <SubmitButton label="Approve and send" pendingLabel="Sending..." />,
    );
    await expectNoA11yViolations(busy.container);
  });
});
