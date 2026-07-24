import { fireEvent, render, screen } from '@testing-library/react-native';

import '@/i18n'; // initialize translations (side effect) so keys resolve
import { ToastProvider } from '@/components/ui';
import { ThemeScope } from '@/theme';

import type { GivingConfig } from '../queries';
import { localizedGiveUrl } from '../url';

import Give from '../../../../app/(tabs)/give';
import GiveBank from '../../../../app/give/bank';

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
  useLocalSearchParams: () => ({}),
}));

jest.mock('expo-localization', () => ({
  getLocales: jest.fn(() => [{ languageCode: 'en' }]),
}));

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(() => Promise.resolve({})),
}));

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(() => Promise.resolve(true)),
}));

const mockConfig = jest.fn<
  { data: GivingConfig | undefined; isError: boolean; refetch: () => void },
  []
>();
jest.mock('../queries', () => ({
  useGivingConfigQuery: () => mockConfig(),
}));

const openBrowser = jest.requireMock<{ openBrowserAsync: jest.Mock }>(
  'expo-web-browser',
).openBrowserAsync;
const clipboard = jest.requireMock<{ setStringAsync: jest.Mock }>(
  'expo-clipboard',
).setStringAsync;

function givingConfig(overrides: Partial<GivingConfig> = {}): GivingConfig {
  return {
    giveUrl: 'https://www.agbcglobal.com/give',
    paypalUrl: 'https://paypal.me/agbcglobal',
    cancellationEmail: 'oami.gospel@gmail.com',
    accounts: [
      {
        code: 'GBP',
        symbol: '£',
        holder: 'Amazing Grace Bible Church Global Ltd',
        fields: [
          { label: 'Account number', value: '51672549' },
          { label: 'Sort code', value: '23-08-01' },
        ],
      },
      {
        code: 'EUR',
        symbol: '€',
        holder: 'Amazing Grace Bible Church Global Ltd',
        fields: [{ label: 'IBAN', value: 'BE53 9051 2105 0953' }],
      },
    ],
    ...overrides,
  };
}

function renderScreen(ui: React.ReactElement) {
  return render(
    <ThemeScope name="light">
      <ToastProvider>{ui}</ToastProvider>
    </ThemeScope>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('localizedGiveUrl (docs/spec/12: match the giver language)', () => {
  const base = 'https://www.agbcglobal.com/give';

  test('English keeps the root path', () => {
    expect(localizedGiveUrl(base, 'en')).toBe(base);
  });

  test('other locales are prefixed', () => {
    expect(localizedGiveUrl(base, 'de')).toBe(
      'https://www.agbcglobal.com/de/give',
    );
    expect(localizedGiveUrl(base, 'fr')).toBe(
      'https://www.agbcglobal.com/fr/give',
    );
  });

  test('region-tagged locales resolve to their base language', () => {
    expect(localizedGiveUrl(base, 'nl-NL')).toBe(
      'https://www.agbcglobal.com/nl/give',
    );
  });
});

describe('GIVE tab (docs/spec/12)', () => {
  test('loading shows skeletons under the static hero', async () => {
    mockConfig.mockReturnValue({
      data: undefined,
      isError: false,
      refetch: jest.fn(),
    });
    await renderScreen(<Give />);
    // The hero and intro are static copy (mockup GIVE frame): they never wait.
    expect(screen.getByText('Give with joy')).toBeOnTheScreen();
    expect(
      screen.getAllByTestId('skeleton', { includeHiddenElements: true }).length,
    ).toBeGreaterThan(0);
  });

  test('error with no cache shows retry and refetches', async () => {
    const refetch = jest.fn();
    mockConfig.mockReturnValue({ data: undefined, isError: true, refetch });
    await renderScreen(<Give />);
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalled();
  });

  test('content shows the three ways to give', async () => {
    mockConfig.mockReturnValue({
      data: givingConfig(),
      isError: false,
      refetch: jest.fn(),
    });
    await renderScreen(<Give />);
    expect(screen.getByText('Give now')).toBeOnTheScreen();
    // The meta line shows the bare destination (mockup .givemeta).
    expect(
      screen.getByText('Opens agbcglobal.com/give · secure checkout'),
    ).toBeOnTheScreen();
    expect(screen.getByText('PayPal')).toBeOnTheScreen();
    expect(screen.getByText('Bank transfer')).toBeOnTheScreen();
    // Bank row subtitle lists the configured currencies (mockup .giverow .s).
    expect(screen.getByText('GBP · EUR · copyable details')).toBeOnTheScreen();
  });

  test('Give now opens the web giving page in the browser', async () => {
    mockConfig.mockReturnValue({
      data: givingConfig(),
      isError: false,
      refetch: jest.fn(),
    });
    await renderScreen(<Give />);
    await fireEvent.press(screen.getByRole('button', { name: 'Give now' }));
    expect(openBrowser).toHaveBeenCalledWith('https://www.agbcglobal.com/give');
  });

  test('PayPal opens the PayPal link', async () => {
    mockConfig.mockReturnValue({
      data: givingConfig(),
      isError: false,
      refetch: jest.fn(),
    });
    await renderScreen(<Give />);
    await fireEvent.press(screen.getByRole('button', { name: 'PayPal' }));
    expect(openBrowser).toHaveBeenCalledWith('https://paypal.me/agbcglobal');
  });

  test('Bank transfer navigates to the bank detail screen', async () => {
    mockConfig.mockReturnValue({
      data: givingConfig(),
      isError: false,
      refetch: jest.fn(),
    });
    await renderScreen(<Give />);
    await fireEvent.press(
      screen.getByRole('button', { name: 'Bank transfer' }),
    );
    expect(mockPush).toHaveBeenCalledWith('/give/bank');
  });

  test('a config with no ways to give is friendly, never blank', async () => {
    mockConfig.mockReturnValue({
      data: givingConfig({ giveUrl: null, paypalUrl: null, accounts: [] }),
      isError: false,
      refetch: jest.fn(),
    });
    await renderScreen(<Give />);
    expect(screen.getByText('Giving is being set up')).toBeOnTheScreen();
  });
});

describe('GIVE-BANK (docs/spec/12)', () => {
  test('shows currencies and the selected account details', async () => {
    mockConfig.mockReturnValue({
      data: givingConfig(),
      isError: false,
      refetch: jest.fn(),
    });
    await renderScreen(<GiveBank />);
    expect(screen.getByRole('tab', { name: 'GBP' })).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'EUR' })).toBeOnTheScreen();
    // GBP is the default: its fields render.
    expect(screen.getByText('51672549')).toBeOnTheScreen();
    expect(screen.getByText('23-08-01')).toBeOnTheScreen();
    // The reference-guidance row (mockup GIVE-BANK fourth copyrow).
    expect(screen.getByText('Your name · Tithe or Offering')).toBeOnTheScreen();
  });

  test('switching currency swaps the account', async () => {
    mockConfig.mockReturnValue({
      data: givingConfig(),
      isError: false,
      refetch: jest.fn(),
    });
    await renderScreen(<GiveBank />);
    expect(screen.queryByText('BE53 9051 2105 0953')).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('tab', { name: 'EUR' }));
    expect(screen.getByText('BE53 9051 2105 0953')).toBeOnTheScreen();
    expect(screen.queryByText('51672549')).not.toBeOnTheScreen();
  });

  test('copying a field writes to the clipboard and confirms', async () => {
    mockConfig.mockReturnValue({
      data: givingConfig(),
      isError: false,
      refetch: jest.fn(),
    });
    await renderScreen(<GiveBank />);
    await fireEvent.press(
      screen.getByRole('button', { name: 'Copy: Sort code' }),
    );
    expect(clipboard).toHaveBeenCalledWith('23-08-01');
    expect(await screen.findByText('Sort code copied')).toBeOnTheScreen();
  });

  test('error with no cache shows retry', async () => {
    const refetch = jest.fn();
    mockConfig.mockReturnValue({ data: undefined, isError: true, refetch });
    await renderScreen(<GiveBank />);
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalled();
  });
});
