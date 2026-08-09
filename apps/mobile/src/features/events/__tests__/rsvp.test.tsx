import { fireEvent, render, screen } from '@testing-library/react-native';

import '@/i18n';
import { RsvpControls } from '@/features/events/RsvpControls';
import { ThemeScope } from '@/theme';

// The three RSVP states (mockup W2.9 section; docs/spec/11 "Going / Interested /
// Cancel"). What is asserted is the shape the frames decided: one structure
// across every state, an answer already given that quietens rather than
// vanishing, and cancel kept one step back rather than sitting in the open.

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access --
   documented jest.mock factory shapes */
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access */

jest.mock('expo-localization', () => ({
  getLocales: jest.fn(() => [{ languageCode: 'en', languageTag: 'en-GB' }]),
}));

const onAnswer = jest.fn<undefined, [string]>();

function renderControls(answer: 'going' | 'interested' | 'cancelled' | null) {
  return render(
    <ThemeScope name="light">
      <RsvpControls answer={answer} onAnswer={onAnswer} />
    </ThemeScope>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('before an answer is given', () => {
  test('offers both, with going as the lead', async () => {
    await renderControls(null);
    expect(
      screen.getByRole('button', { name: "RSVP · I'm going" }),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: "I'm interested" }),
    ).toBeOnTheScreen();
  });

  test('a cancelled RSVP reads like one never given', async () => {
    // The row is remembered server-side (docs/spec/11) so the member's own list
    // can still show it, but the screen simply offers again rather than
    // reminding somebody they pulled out.
    await renderControls('cancelled');
    expect(
      screen.getByRole('button', { name: "RSVP · I'm going" }),
    ).toBeOnTheScreen();
    expect(screen.queryByText("You're going")).toBeNull();
  });

  test('each button answers with its own status', async () => {
    await renderControls(null);
    await fireEvent.press(
      screen.getByRole('button', { name: "I'm interested" }),
    );
    expect(onAnswer).toHaveBeenCalledWith('interested');
  });
});

describe('once the answer is in', () => {
  test('it quietens rather than vanishing, and keeps its place', async () => {
    await renderControls('going');
    expect(
      screen.getByRole('button', { name: "You're going" }),
    ).toBeOnTheScreen();
    // The offer is gone; the answer is what stands in its place.
    expect(
      screen.queryByRole('button', { name: "RSVP · I'm going" }),
    ).toBeNull();
  });

  test('cancel is one step back, never beside the commitment', async () => {
    await renderControls('going');
    expect(screen.queryByText('Cancel my RSVP')).toBeNull();

    await fireEvent.press(
      screen.getByRole('button', { name: 'Change or cancel' }),
    );
    expect(screen.getByText('Change your RSVP?')).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'Cancel my RSVP' }),
    ).toBeOnTheScreen();
  });

  test('the sheet offers the OTHER answer, not the one already given', async () => {
    await renderControls('going');
    await fireEvent.press(
      screen.getByRole('button', { name: 'Change or cancel' }),
    );
    // Somebody who is going is not asked whether they would like to be going.
    expect(
      screen.getByRole('button', { name: "I'm interested" }),
    ).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: "I'm going" })).toBeNull();
  });

  test('cancelling from the sheet actually cancels', async () => {
    // The sheet's secondary used to be the way OUT; here it is an action, and
    // that distinction is the difference between cancelling and doing nothing.
    await renderControls('interested');
    await fireEvent.press(
      screen.getByRole('button', { name: 'Change or cancel' }),
    );
    await fireEvent.press(
      screen.getByRole('button', { name: 'Cancel my RSVP' }),
    );
    expect(onAnswer).toHaveBeenCalledWith('cancelled');
  });

  test('and the copy never scolds somebody for changing their mind', async () => {
    await renderControls('interested');
    await fireEvent.press(
      screen.getByRole('button', { name: 'Change or cancel' }),
    );
    expect(
      screen.getByText(/Cancelling just removes your name from the list/),
    ).toBeOnTheScreen();
  });
});
