import { fireEvent, render } from '@testing-library/react-native';

import i18n from '@/i18n';
import { ThemeScope } from '@/theme';

import { BranchWelcome, shortBranchName } from '../BranchWelcome';
import { PendingBranchNote } from '../PendingBranchNote';
import { useBranchOutcomeStore } from '../seen';

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access --
   documented jest.mock factory shapes */
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access */

/**
 * The outcomes a member meets after asking (docs/spec/16, ADR 0015).
 *
 * The interesting property in all three is the same one: each is shown ONCE, and "once"
 * is keyed by the request rather than by a flag, so a second move months later still gets
 * its own welcome.
 */

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

beforeEach(() => {
  useBranchOutcomeStore.setState({ acknowledged: [], dismissed: [] });
});

describe('arriving', () => {
  test('the welcome names the branch in both the short and the full form', async () => {
    const view = await render(
      <ThemeScope name="light">
        <BranchWelcome
          visible
          branchName="AGBC Lighthouse Berlin"
          shortName={shortBranchName('AGBC Lighthouse Berlin')}
          onContinue={jest.fn()}
        />
      </ThemeScope>,
    );

    // A welcome uses the name people say; the sentence underneath carries the full one.
    expect(view.getByText('Welcome to Berlin')).toBeTruthy();
    expect(view.getByText(/AGBC Lighthouse Berlin/)).toBeTruthy();
  });

  test('continuing takes the welcome away', async () => {
    const onContinue = jest.fn();
    const view = await render(
      <ThemeScope name="light">
        <BranchWelcome
          visible
          branchName="AGBC Lighthouse Berlin"
          shortName="Berlin"
          onContinue={onContinue}
        />
      </ThemeScope>,
    );

    await fireEvent.press(view.getByText('Continue'));
    expect(onContinue).toHaveBeenCalledTimes(1);

    // And an acknowledged welcome is gone rather than merely hidden behind Home: the
    // Modal it lives in renders nothing at all once it is not visible.
    await view.rerender(
      <ThemeScope name="light">
        <BranchWelcome
          visible={false}
          branchName="AGBC Lighthouse Berlin"
          shortName="Berlin"
          onContinue={onContinue}
        />
      </ThemeScope>,
    );
    expect(view.queryByText('Welcome to Berlin')).toBeNull();
  });

  test('continuing acknowledges that request, and only that request', () => {
    const store = useBranchOutcomeStore.getState();
    store.acknowledge('request-1');

    expect(useBranchOutcomeStore.getState().acknowledged).toEqual([
      'request-1',
    ]);
    // A later move is a different request, so it still gets its own welcome.
    expect(
      useBranchOutcomeStore.getState().acknowledged.includes('request-2'),
    ).toBe(false);
  });

  test('acknowledging twice does not grow the record', () => {
    useBranchOutcomeStore.getState().acknowledge('request-1');
    useBranchOutcomeStore.getState().acknowledge('request-1');

    expect(useBranchOutcomeStore.getState().acknowledged).toEqual([
      'request-1',
    ]);
  });
});

describe('the quiet line on Home', () => {
  test('says where the request is, and can be dismissed', async () => {
    const onDismiss = jest.fn();
    const view = await render(
      <ThemeScope name="light">
        <PendingBranchNote
          shortName="Berlin"
          branchName="AGBC Lighthouse Berlin"
          onDismiss={onDismiss}
        />
      </ThemeScope>,
    );

    // One line now, not a kicker over a body: the lead names the branch and the rest
    // says where the request is.
    expect(view.getByText('Asked to join Berlin.')).toBeTruthy();
    expect(
      view.getByText(
        ' Your request is with the team at AGBC Lighthouse Berlin.',
      ),
    ).toBeTruthy();

    await fireEvent.press(view.getByText('Dismiss'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  test('it promises no outcome and names no person', async () => {
    const view = await render(
      <ThemeScope name="light">
        <PendingBranchNote
          shortName="Berlin"
          branchName="AGBC Lighthouse Berlin"
          onDismiss={jest.fn()}
        />
      </ThemeScope>,
    );

    // Decision 3: the member is told the outcome and nothing else, and never who decides.
    expect(view.queryByText(/approv/i)).toBeNull();
    expect(view.queryByText(/leader/i)).toBeNull();
  });
});

describe('the short branch name', () => {
  test.each([
    ['AGBC Lighthouse Berlin', 'Berlin'],
    ['AGBC Glasgow', 'Glasgow'],
    ['AGBC Emmen', 'Emmen'],
  ])('%s reads as %s', (full, short) => {
    expect(shortBranchName(full)).toBe(short);
  });
});
