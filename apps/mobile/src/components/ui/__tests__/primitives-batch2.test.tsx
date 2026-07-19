import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Text } from 'react-native';

import { ThemeScope } from '@/theme';

import { AppHeader } from '../AppHeader';
import { EmptyState } from '../EmptyState';
import { GateSheet } from '../GateSheet';
import { Skeleton } from '../Skeleton';
import { TabBar } from '../TabBar';
import { ToastProvider, useToast } from '../Toast';

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access --
   the library's documented jest.mock factory shape */
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access */

function inTheme(ui: React.ReactElement) {
  return render(<ThemeScope name="light">{ui}</ThemeScope>);
}

describe('AppHeader', () => {
  test('exposes the title as a header and a labeled back button', async () => {
    const onBack = jest.fn();
    await inTheme(<AppHeader title="Watch" onBack={onBack} backLabel="Back" />);
    expect(screen.getByRole('header', { name: 'Watch' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe('TabBar', () => {
  const items = [
    { key: 'home', label: 'Home' },
    { key: 'family', label: 'Family', badge: 3 },
  ] as const;

  test('tabs expose selection and badge counts in the label (05 contract)', async () => {
    const onPress = jest.fn();
    await inTheme(<TabBar items={items} activeKey="home" onPress={onPress} />);
    expect(screen.getByRole('tab', { name: 'Home' })).toBeSelected();
    const family = screen.getByRole('tab', { name: 'Family, 3 new' });
    await fireEvent.press(family);
    expect(onPress).toHaveBeenCalledWith('family');
  });
});

describe('EmptyState', () => {
  test('never a bare list: icon slot hidden, copy + action present', async () => {
    const onAction = jest.fn();
    await inTheme(
      <EmptyState
        title="No testimonies yet"
        body="Be the first to share what God has done."
        actionLabel="Share a testimony"
        onAction={onAction}
      />,
    );
    expect(screen.getByText('No testimonies yet')).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', { name: 'Share a testimony' }),
    );
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});

describe('Skeleton', () => {
  test('is hidden from assistive technology (05 contract)', async () => {
    await inTheme(<Skeleton width={120} />);
    // RNTL excludes AT-hidden elements from queries by default, which itself proves
    // the contract; opt in to inspect the props.
    const skeleton = screen.getByTestId('skeleton', {
      includeHiddenElements: true,
    });
    expect(skeleton.props.accessibilityElementsHidden).toBe(true);
    expect(skeleton.props.importantForAccessibility).toBe(
      'no-hide-descendants',
    );
  });
});

describe('Toast', () => {
  function Trigger() {
    const { show } = useToast();
    return (
      <Text
        onPress={() => {
          show('Copied');
        }}
      >
        trigger
      </Text>
    );
  }

  test('announces via the live region and auto-dismisses without focus calls', async () => {
    jest.useFakeTimers();
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    await inTheme(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    await fireEvent.press(screen.getByText('trigger'));
    expect(screen.getByText('Copied')).toBeOnTheScreen();
    expect(announce).toHaveBeenCalledWith('Copied');
    await act(() => {
      jest.runAllTimers();
    });
    expect(screen.queryByText('Copied')).toBeNull();
    jest.useRealTimers();
  });
});

describe('GateSheet', () => {
  const props = {
    visible: true,
    title: 'Sign in to say Glory to God',
    body: 'Join the family to react, share testimonies, RSVP, and track your rhythm.',
    signInLabel: 'Sign in',
    dismissLabel: 'Not now',
    dismissAnnouncement: 'Dismissed',
  };

  test('frames the title to the action and fires sign in', async () => {
    const onSignIn = jest.fn();
    await inTheme(
      <GateSheet {...props} onSignIn={onSignIn} onDismiss={jest.fn()} />,
    );
    expect(
      screen.getByRole('header', { name: 'Sign in to say Glory to God' }),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(onSignIn).toHaveBeenCalledTimes(1);
  });

  test('dismissal announces per the contract', async () => {
    const onDismiss = jest.fn();
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    await inTheme(
      <GateSheet {...props} onSignIn={jest.fn()} onDismiss={onDismiss} />,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Not now' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith('Dismissed');
  });
});
