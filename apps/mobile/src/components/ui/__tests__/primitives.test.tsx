import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ThemeScope } from '@/theme';

import { Button } from '../Button';
import { Card } from '../Card';
import { Chip } from '../Chip';
import { Eyebrow } from '../Eyebrow';
import { Screen } from '../Screen';
import { SegmentedControl } from '../SegmentedControl';

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access --
   the library's documented jest.mock factory shape */
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access */

// RNTL v14: render and events are async (React 19 act semantics); always await.
function inTheme(ui: React.ReactElement) {
  return render(<ThemeScope name="light">{ui}</ThemeScope>);
}

describe('Button', () => {
  test('has button role, label, and fires onPress', async () => {
    const onPress = jest.fn();
    await inTheme(<Button label="Send code" onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'Send code' });
    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('disabled state is exposed and blocks presses', async () => {
    const onPress = jest.fn();
    await inTheme(<Button label="Send" disabled onPress={onPress} />);
    const button = screen.getByRole('button', { name: 'Send' });
    expect(button).toBeDisabled();
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  test('loading exposes busy state', async () => {
    await inTheme(<Button label="Saving" loading />);
    expect(screen.getByRole('button', { name: 'Saving' })).toBeBusy();
  });
});

describe('Card', () => {
  test('static card renders children without a button role', async () => {
    await inTheme(
      <Card>
        <Text>Body</Text>
      </Card>,
    );
    expect(screen.getByText('Body')).toBeOnTheScreen();
    expect(screen.queryByRole('button')).toBeNull();
  });

  test('pressable card gets a button role and fires', async () => {
    const onPress = jest.fn();
    await inTheme(
      <Card onPress={onPress} accessibilityLabel="Open sermon">
        <Text>Body</Text>
      </Card>,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Open sermon' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('Chip', () => {
  test('exposes the 05 branch label recipe and selected state', async () => {
    await inTheme(
      <Chip
        label="AGBC Berlin"
        selected
        onPress={jest.fn()}
        accessibilityLabel="Current branch AGBC Berlin, change branch"
      />,
    );
    expect(
      screen.getByRole('button', {
        name: 'Current branch AGBC Berlin, change branch',
      }),
    ).toBeSelected();
  });
});

describe('SegmentedControl', () => {
  const segments = [
    { key: 'everywhere', label: 'Everywhere' },
    { key: 'branch', label: 'My branch' },
  ] as const;

  test('is a labeled tablist whose tabs expose selection', async () => {
    const onChange = jest.fn();
    await inTheme(
      <SegmentedControl
        accessibilityLabel="Scope"
        segments={segments}
        value="everywhere"
        onChange={onChange}
      />,
    );
    // The tablist container is deliberately NOT an accessibility element (that would
    // flatten the tabs for TalkBack), so byRole cannot find it; assert the role prop.
    const tablist = screen.getByLabelText('Scope');
    expect(
      (tablist.props as { accessibilityRole?: string }).accessibilityRole,
    ).toBe('tablist');
    expect(screen.getByRole('tab', { name: 'Everywhere' })).toBeSelected();
    await fireEvent.press(screen.getByRole('tab', { name: 'My branch' }));
    expect(onChange).toHaveBeenCalledWith('branch');
  });
});

describe('Eyebrow', () => {
  test('renders its label', async () => {
    await inTheme(<Eyebrow label="Verse of the day" />);
    expect(screen.getByText('Verse of the day')).toBeOnTheScreen();
  });
});

describe('Screen', () => {
  test('scrollable screen renders children', async () => {
    await inTheme(
      <Screen testID="screen">
        <Text>Content</Text>
      </Screen>,
    );
    expect(screen.getByText('Content')).toBeOnTheScreen();
  });

  test('static screen renders children', async () => {
    await inTheme(
      <Screen scroll={false} testID="screen">
        <Text>Player</Text>
      </Screen>,
    );
    expect(screen.getByText('Player')).toBeOnTheScreen();
  });
});
