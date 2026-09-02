import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ToastProvider } from '@/components/ui';
import i18n from '@/i18n';
import { useAnalyticsConsentStore } from '@/lib/analytics';
import { useAuthStore } from '@/state/auth';
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

// SETTINGS now reads the auth store to decide whether to show its member rows (W2.7),
// and the store's module scope reaches the real Supabase client, which refuses to build
// without env. Same stub the family screen tests use; the real store stays.
const mockSignOut = jest.fn(() => Promise.resolve({ error: null }));
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      signOut: () => mockSignOut(),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => undefined } },
      }),
    },
    from: () => ({}),
  },
}));

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));

// W4.7 slice 1: two MORE rows and a whole section now sit behind a flag until
// their features are built. A GETTER, because `jest.mock` is hoisted above the
// `More` import and the factory would otherwise capture this const before it is
// initialised.
const mockFeatures = { store: false, devotionalPlan: false };
jest.mock('@/lib/features', () => ({
  get features() {
    return mockFeatures;
  },
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

// SETTINGS reads server state since W2.6 (the count on the Blocked members row), so a
// real QueryClient stands here rather than a stub of one: the claim under test is that
// these screens use the library correctly, and a hand-rolled cache would only prove the
// screens match our belief about it (~/.claude/standards/qa-testing.md).
function inTheme(ui: React.ReactElement) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ThemeScope name="light">
        <ToastProvider>{ui}</ToastProvider>
      </ThemeScope>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFeatures.store = false;
  mockFeatures.devotionalPlan = false;
});

describe('MORE hub (docs/spec/04 tab 5): every row navigates', () => {
  const rowRoutes: [string, string][] = [
    ['Grace Academy', '/academy'],
    ['Branches', '/branches'],
    ['Events', '/events'],
    ['About the church', '/about'],
    ['Contact', '/contact'],
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
});

// The rows the MVP does not draw. `04`'s "every row navigates" guarantee still has
// to hold for them, or W4.2 and W4.4 would delete their flag and reveal rows that
// nothing has covered since W1.2. Driven with the flags ON, which is the only way
// these rows can be reached at all.
describe('MORE hub: the rows waiting on their feature (W4.7 slice 1)', () => {
  const deferredRoutes: [string, string][] = [
    ['Daily devotional', '/plan'],
    ['Bookstore', '/store'],
  ];

  test.each(deferredRoutes)(
    '%s routes to %s once its feature ships',
    async (label, route) => {
      mockFeatures.store = true;
      mockFeatures.devotionalPlan = true;
      await inTheme(<More />);
      await fireEvent.press(screen.getByRole('button', { name: label }));
      expect(mockPush).toHaveBeenCalledWith(route);
    },
  );

  test('My Library is locked for guests and routes to the auth placeholder', async () => {
    mockFeatures.store = true;
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

  // The analytics switch (W2.10, mockup SETTINGS "Privacy & data"; ADR 0020). It lives in
  // the GUEST block deliberately: consent is per device and has to be reversible without an
  // account, since first run has no account and a guest's taps are what the funnel measures.
  describe('the analytics switch', () => {
    afterEach(() => {
      useAnalyticsConsentStore.setState({ consent: 'unasked' });
    });

    test('reads off until somebody has agreed, and on once they have', async () => {
      await inTheme(<Settings />);
      // Queried BY its accessibility state, so this also pins that a screen reader is told
      // which way the switch is set.
      expect(
        screen.getByRole('switch', {
          name: 'Help improve the app',
          checked: false,
        }),
      ).toBeOnTheScreen();

      // Driven by the tap rather than by writing the store from outside React, which needs
      // an act() wrapper to repaint and tests the store instead of the screen.
      await fireEvent.press(
        screen.getByRole('switch', { name: 'Help improve the app' }),
      );
      expect(
        screen.getByRole('switch', {
          name: 'Help improve the app',
          checked: true,
        }),
      ).toBeOnTheScreen();
    });

    test('turning it on records consent; turning it off withdraws it', async () => {
      await inTheme(<Settings />);
      const row = screen.getByRole('switch', { name: 'Help improve the app' });

      await fireEvent.press(row);
      expect(useAnalyticsConsentStore.getState().consent).toBe('granted');

      await fireEvent.press(row);
      // 'denied' rather than 'unasked': the member has answered, and the first-run sheet
      // must not reappear because they switched it off here.
      expect(useAnalyticsConsentStore.getState().consent).toBe('denied');
    });

    test('says plainly that crash reports are not part of the choice', async () => {
      await inTheme(<Settings />);

      // `20`'s lawful-basis table was corrected to match this: crash reports are always
      // sent, scrubbed, so the screen has to say so where the switch is.
      expect(
        screen.getByText(/Crash reports are always sent/i),
      ).toBeOnTheScreen();
    });
  });
});

// docs/spec/16 §19 names both states of this control, and until W2.8 only the guest
// one existed: a signed-in member met a "Sign in" button that pushed them at AUTH-1.
describe('SETTINGS, member level: signing out (docs/spec/16, 03)', () => {
  beforeEach(() => {
    useAuthStore.setState({
      status: 'member',
      email: 'grace@example.test',
      profile: {
        displayName: 'Grace Bello',
        branchId: 'b1',
        language: 'en',
        role: 'member',
      },
    });
  });

  afterEach(() => {
    useAuthStore.setState({ status: 'guest', email: null, profile: null });
  });

  test('a member is offered Sign out, never Sign in', async () => {
    await inTheme(<Settings />);
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull();
  });

  test('it ends the session and says so, staying on a browsable app', async () => {
    await inTheme(<Settings />);
    await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockSignOut).toHaveBeenCalled();
    expect(useAuthStore.getState().status).toBe('guest');
    // It stays on Settings rather than routing anywhere: browsing is free, so
    // there is nothing to be thrown out of (docs/spec/16 "keeps guest browse").
    expect(mockPush).not.toHaveBeenCalled();
    expect(
      screen.getByText('Signed out. You can keep browsing.'),
    ).toBeOnTheScreen();
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
