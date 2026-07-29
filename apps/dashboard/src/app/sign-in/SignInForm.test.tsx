import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';

import { expectNoA11yViolations } from '@/test/a11y';

import { SignInForm } from './SignInForm';

describe('the email step', () => {
  test('has a real label, the right input type, and no axe violations', async () => {
    const { container } = render(<SignInForm next="/" />);

    const field = screen.getByLabelText('Email address');
    expect(field).toHaveAttribute('type', 'email');
    // Lets a password manager and the OS fill it, which the standard requires and
    // which converts better than a bare field.
    expect(field).toHaveAttribute('autocomplete', 'email');

    await expectNoA11yViolations(container);
  });

  test('refuses an empty address without calling anything, and says which field', async () => {
    const user = userEvent.setup();
    render(<SignInForm next="/" />);

    await user.click(screen.getByRole('button', { name: 'Email me a code' }));

    const field = screen.getByLabelText('Email address');
    expect(screen.getByText('Enter your email address.')).toBeInTheDocument();
    // The error is tied to the input, so a screen reader reads it with the field rather
    // than leaving "something is wrong" floating on the page.
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field.getAttribute('aria-describedby')).toContain('email-error');
    await waitFor(() => {
      expect(field).toHaveFocus();
    });
  });

  test('refuses a malformed address', async () => {
    const user = userEvent.setup();
    render(<SignInForm next="/" />);

    await user.type(screen.getByLabelText('Email address'), 'not-an-address');
    await user.click(screen.getByRole('button', { name: 'Email me a code' }));

    expect(
      screen.getByText('That does not look like an email address.'),
    ).toBeInTheDocument();
  });

  test('is fully operable from the keyboard', async () => {
    const user = userEvent.setup();
    render(<SignInForm next="/" />);

    // Put focus somewhere known instead of inheriting whatever autoFocus left behind.
    // Two CI failures came from tabbing while focus sat on <body>: Tab then moved INTO
    // the field rather than out of it, so the assertion read the input and not the
    // button. Waiting for autoFocus first was not enough, because it can land and then
    // be dropped again before the tab. The claim under test is the tab ORDER, and that
    // does not need autoFocus to be involved at all. (autoFocus itself is verified in
    // the browser, where it is real; asserting it in jsdom only bought flakes.)
    const field = screen.getByLabelText('Email address');
    await user.click(field);
    expect(field).toHaveFocus();

    await user.tab();
    expect(
      screen.getByRole('button', { name: 'Email me a code' }),
    ).toHaveFocus();
  });
});

describe('account enumeration', () => {
  test('an address with no account gets the same response as one with an account', async () => {
    // A real call to the local Supabase, on purpose. This is the one behaviour where a
    // mock would prove nothing: the whole question is what the real auth server says
    // about an unknown address and whether this form leaks the difference.
    const user = userEvent.setup();
    render(<SignInForm next="/" />);

    await user.type(
      screen.getByLabelText('Email address'),
      'definitely-nobody-w27@test.local',
    );
    await user.click(screen.getByRole('button', { name: 'Email me a code' }));

    // Advances to the code step and shows the conditional wording, exactly as it would
    // for a real leader. Nothing on screen distinguishes the two cases.
    await waitFor(() => {
      expect(screen.getByLabelText('Six-digit code')).toBeInTheDocument();
    });
    expect(
      screen.getByText(
        /If definitely-nobody-w27@test.local has an AGBC account/,
      ),
    ).toBeInTheDocument();
  });
});

describe('the code step', () => {
  async function reachCodeStep() {
    const user = userEvent.setup();
    const view = render(<SignInForm next="/" />);
    await user.type(
      screen.getByLabelText('Email address'),
      'someone-w27@test.local',
    );
    await user.click(screen.getByRole('button', { name: 'Email me a code' }));
    await waitFor(() => {
      expect(screen.getByLabelText('Six-digit code')).toBeInTheDocument();
    });
    return { user, view };
  }

  test('offers the one-time-code autofill and no axe violations', async () => {
    const { view } = await reachCodeStep();

    const field = screen.getByLabelText('Six-digit code');
    expect(field).toHaveAttribute('autocomplete', 'one-time-code');
    expect(field).toHaveAttribute('inputmode', 'numeric');

    await expectNoA11yViolations(view.container);
  });

  test('lets someone go back and correct the address they typed', async () => {
    // WCAG 2.2: never make a user re-enter data they already gave in the same flow, and
    // never strand them on a step because of a typo two screens back.
    const { user } = await reachCodeStep();

    await user.click(
      screen.getByRole('button', { name: 'Use a different address' }),
    );

    expect(screen.getByLabelText('Email address')).toHaveValue(
      'someone-w27@test.local',
    );
  });
});
