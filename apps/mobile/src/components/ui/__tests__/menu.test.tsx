import { fireEvent, render, screen } from '@testing-library/react-native';

import { ThemeScope } from '@/theme';

import { MenuCard, MenuLabel, MenuRow } from '../Menu';

function inTheme(ui: React.ReactElement) {
  return render(<ThemeScope name="light">{ui}</ThemeScope>);
}

describe('MenuRow', () => {
  test('is a labeled button and fires onPress', async () => {
    const onPress = jest.fn();
    await inTheme(<MenuRow icon="📍" label="Branches" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Branches' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('renders a trailing value and a lock badge', async () => {
    await inTheme(
      <MenuCard>
        <MenuRow
          icon="🌐"
          label="Language"
          value="English"
          onPress={jest.fn()}
        />
        <MenuRow
          icon="📚"
          label="My Library"
          badge="Sign in"
          onPress={jest.fn()}
        />
      </MenuCard>,
    );
    expect(screen.getByText('English')).toBeOnTheScreen();
    expect(screen.getByText('Sign in')).toBeOnTheScreen();
  });
});

describe('MenuLabel', () => {
  test('renders the section label', async () => {
    await inTheme(<MenuLabel label="Church" />);
    expect(screen.getByText('Church')).toBeOnTheScreen();
  });
});
