import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ThemeScope } from '@/theme';

import { NavRail } from '../NavRail';
import type { TabItem } from '../TabBar';

/**
 * The tablet nav rail (W4.7 slice 4, mockup `.railnav`).
 *
 * What matters here is that it is the SAME navigation as the bottom bar wearing
 * a different shape: same roots, same selected semantics, same control-label
 * rule. A rail that drifted from the bar would give a tablet a different app.
 */

jest.mock(
  'react-native-safe-area-context',
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access -- documented jest.mock factory shape
  () => require('react-native-safe-area-context/jest/mock').default,
);

type Key = 'home' | 'watch' | 'more';

const items: TabItem<Key>[] = [
  { key: 'home', label: 'Home' },
  { key: 'watch', label: 'Watch' },
  { key: 'more', label: 'More', badge: 3 },
];

// RNTL v14: render and events are async (React 19 act semantics); always await.
async function renderRail(activeKey: Key = 'home', onPress = jest.fn()) {
  await render(
    <ThemeScope name="light">
      <NavRail
        items={items}
        activeKey={activeKey}
        onPress={onPress}
        accessibilityLabel="Main navigation"
        avatar={<Text>AV</Text>}
      />
    </ThemeScope>,
  );
  return onPress;
}

test('every root is a tab, and only the current one is selected', async () => {
  await renderRail('watch');
  for (const label of ['Home', 'Watch']) {
    expect(screen.getByRole('tab', { name: label })).toBeOnTheScreen();
  }
  expect(
    screen.getByRole('tab', { name: 'Watch' }).props.accessibilityState,
  ).toMatchObject({ selected: true });
  expect(
    screen.getByRole('tab', { name: 'Home' }).props.accessibilityState,
  ).toMatchObject({ selected: false });
});

test('it announces itself, since a rail carries no visible heading', async () => {
  await renderRail();
  // By label rather than by role: the rail is a container, so it is not itself
  // an accessibility element and RNTL's role query will not reach it. The role
  // is still set, and TalkBack reads it from the node.
  expect(screen.getByLabelText('Main navigation')).toHaveProp(
    'accessibilityRole',
    'tablist',
  );
});

test('a badge is spoken, not just drawn', async () => {
  await renderRail();
  // Same recipe as the bottom bar: the count joins the accessible name so a
  // screen reader says what the dot means.
  expect(screen.getByRole('tab', { name: 'More, 3 new' })).toBeOnTheScreen();
});

test('tapping a root navigates to it', async () => {
  const onPress = await renderRail('home');
  await fireEvent.press(screen.getByRole('tab', { name: 'Watch' }));
  expect(onPress).toHaveBeenCalledWith('watch');
});

test('rail labels hold one line and cap their scale, like the bar', async () => {
  await renderRail();
  // `05` + #76: control labels cap at 1.3x and ellipsize. The rail is a fixed
  // 96 wide, so a wrapped label would push the icons out of alignment exactly
  // as it did in the bottom bar.
  const label = screen.getByText('Home');
  expect(label).toHaveProp('numberOfLines', 1);
  expect(label).toHaveProp('maxFontSizeMultiplier', 1.3);
});

test('the avatar sits in the rail when one is given', async () => {
  await renderRail();
  expect(screen.getByText('AV')).toBeOnTheScreen();
});
