import { act, fireEvent, render, screen } from '@testing-library/react-native';

import i18n from '@/i18n';
import { ThemeScope } from '@/theme';
import { useThemePrefStore } from '@/theme/store';

import More from '../../../../app/(tabs)/more';
import Settings from '../../../../app/settings';
import PickLanguage from '../../../../app/settings/language';

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access --
   documented jest.mock factory shapes */
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access */

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));

jest.mock('expo-localization', () => ({
  getLocales: jest.fn(() => [{ languageCode: 'en' }]),
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '1.0.0' } },
}));

const mockOpenBrowser = jest.fn<Promise<object>, [string]>(() =>
  Promise.resolve({}),
);
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: (url: string) => mockOpenBrowser(url),
}));

function inTheme(ui: React.ReactElement) {
  return render(<ThemeScope name="light">{ui}</ThemeScope>);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('MORE hub (docs/spec/04 tab 5): every row navigates', () => {
  const rowRoutes: [string, string][] = [
    ['Grace Academy', '/academy'],
    ['Daily devotional', '/plan'],
    ['Branches', '/branches'],
    ['Events', '/events'],
    ['About the church', '/about'],
    ['Contact', '/contact'],
    ['Bookstore', '/store'],
    ['Settings', '/settings'],
  ];

  test.each(rowRoutes)('%s routes to %s', async (label, route) => {
    await inTheme(<More />);
    await fireEvent.press(screen.getByRole('button', { name: label }));
    expect(mockPush).toHaveBeenCalledWith(route);
  });

  test('the guest sign-in card CTA routes to the auth placeholder', async () => {
    await inTheme(<More />);
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(mockPush).toHaveBeenCalledWith('/auth');
  });

  test('My Library is locked for guests and routes to the auth placeholder', async () => {
    await inTheme(<More />);
    await fireEvent.press(screen.getByRole('button', { name: 'My Library' }));
    expect(mockPush).toHaveBeenCalledWith('/auth');
  });
});

describe('SETTINGS, guest level (docs/spec/16)', () => {
  afterEach(() => {
    useThemePrefStore.getState().setPref('system');
  });

  test('theme segments write the pref instantly', async () => {
    await inTheme(<Settings />);
    await fireEvent.press(screen.getByRole('tab', { name: 'Dark' }));
    expect(useThemePrefStore.getState().pref).toBe('dark');
    await fireEvent.press(screen.getByRole('tab', { name: 'System' }));
    expect(useThemePrefStore.getState().pref).toBe('system');
  });

  test('language row shows the current language and opens the picker', async () => {
    await inTheme(<Settings />);
    const row = screen.getByRole('button', { name: 'Language' });
    expect(screen.getByText('English')).toBeOnTheScreen();
    await fireEvent.press(row);
    expect(mockPush).toHaveBeenCalledWith('/settings/language');
  });

  test('legal links open in the browser, never dead-end', async () => {
    await inTheme(<Settings />);
    await fireEvent.press(screen.getByRole('button', { name: 'Privacy' }));
    expect(mockOpenBrowser).toHaveBeenCalledWith(
      expect.stringContaining('privacy'),
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Legal' }));
    expect(mockOpenBrowser).toHaveBeenCalledWith(
      expect.stringContaining('terms'),
    );
  });

  test('guest sees Sign in and the app version line', async () => {
    await inTheme(<Settings />);
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    expect(mockPush).toHaveBeenCalledWith('/auth');
    expect(screen.getByText('AGBC · v1.0.0')).toBeOnTheScreen();
  });
});

describe('language picker relocalizes instantly (docs/spec/16)', () => {
  test('choosing Nederlands switches the UI language in place', async () => {
    await i18n.changeLanguage('en');
    await inTheme(<PickLanguage />);
    await fireEvent.press(screen.getByRole('radio', { name: 'Nederlands' }));
    expect(i18n.language).toBe('nl');
    // The screen itself re-rendered in Dutch.
    expect(screen.getByRole('header', { name: 'Taal' })).toBeOnTheScreen();
    await act(() => i18n.changeLanguage('en'));
  });
});
