import { fireEvent, render } from '@testing-library/react-native';

import i18n from '@/i18n';
import { ThemeScope } from '@/theme';

import { ClosedBranchNote } from '../ClosedBranchNote';

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access --
   documented jest.mock factory shapes */
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access */

/**
 * HOME's card, when a member's branch has closed (W3.5 slice 5c).
 *
 * Its own file rather than a fourth case beside the screen's tests, and the reason is
 * mechanical: rendering this component after two full-screen renders in one file produced an
 * empty tree, so the assertion failed for a harness reason rather than a product one. One
 * component, one file, no shared roots.
 *
 * The claim under test is the decision taken with Ayo on 2026-08-20: the launch prompt can
 * be put off, so this card must NOT be dismissible. Once it has been dismissed there is
 * nothing left in the app that would ever ask again.
 */

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

test('the card on Home has no way to dismiss it', async () => {
  const chose = jest.fn();
  const view = await render(
    <ThemeScope name="light">
      <ClosedBranchNote branchName="AGBC Emmen" onChoose={chose} />
    </ThemeScope>,
  );

  // The lead is its own <Text> run inside the sentence (NoteBanner splits it so the bold
  // opening can carry the accent colour), so it is matched exactly rather than across the
  // whole line.
  expect(view.getByText('AGBC Emmen has closed.')).toBeTruthy();
  expect(view.queryByRole('button', { name: /dismiss/i })).toBeNull();

  await fireEvent.press(
    view.getByRole('button', { name: 'Choose a new home branch' }),
  );
  expect(chose).toHaveBeenCalled();
});
