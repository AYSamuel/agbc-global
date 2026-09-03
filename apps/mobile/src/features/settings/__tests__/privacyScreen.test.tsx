import { fireEvent, render, screen } from '@testing-library/react-native';

import i18n from '@/i18n';
import { useAuthStore } from '@/state/auth';
import { ThemeScope } from '@/theme';

import Privacy from '../../../../app/settings/privacy';

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access --
   documented jest.mock factory shapes */
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access */

// The auth store reaches the real Supabase client at module scope, which refuses
// to build without env. Same stub the other settings tests use; the store is real.
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => undefined } },
      }),
    },
    from: () => ({}),
  },
}));

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
    replace: mockReplace,
    canGoBack: () => true,
  }),
}));

const mockOpenBrowser = jest.fn<Promise<object>, [string]>(() =>
  Promise.resolve({}),
);
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: (url: string) => mockOpenBrowser(url),
}));

jest.mock('expo-localization', () => ({
  getLocales: jest.fn(() => [{ languageCode: 'en' }]),
}));

function draw() {
  return render(
    <ThemeScope name="light">
      <Privacy />
    </ThemeScope>,
  );
}

// The language is reset HERE rather than at the end of the test that changes it.
// RNTL has already unmounted by now, so nothing re-renders; doing it inside the
// test updates a still-mounted tree outside `act` and warns.
beforeEach(async () => {
  jest.clearAllMocks();
  useAuthStore.setState({ status: 'guest' });
  await i18n.changeLanguage('en');
});

/**
 * PRIVACY (frame `PRIVACY · plain-language`, `16` §PRIVACY, `20`).
 */
describe('the plain-language privacy summary', () => {
  test('says what is collected, and only what this app actually collects', async () => {
    await draw();

    expect(screen.getByText('What we collect')).toBeOnTheScreen();
    expect(
      screen.getByText('Your email address (to sign in)'),
    ).toBeOnTheScreen();
    expect(
      screen.getByText('Your device, while notifications are switched on'),
    ).toBeOnTheScreen();
  });

  /**
   * THE POINT OF THIS ITEM, and the reason the frame was corrected rather than
   * copied. Three of its claims were untrue of this app: there is no profile
   * photo (`profiles.avatar_url` has no writer and the `avatars` bucket has never
   * existed), and no reading progress (`reading_state` has no writer until the
   * reader ships). A notice that overstates collection is as wrong as one that
   * understates it, and only a person reading the screen would ever catch it.
   *
   * These assertions are deliberately about the WORDS, not the keys: a key can be
   * renamed harmlessly, and a sentence promising something false cannot.
   */
  test('claims nothing the app does not do', async () => {
    await draw();
    // The WHOLE tree, not the text nodes: an untrue claim is just as untrue in
    // an accessibility label as in a paragraph, and this reads both.
    const rendered = JSON.stringify(screen.toJSON());

    expect(rendered).not.toMatch(/optional photo/i);
    expect(rendered).not.toMatch(/reading progress/i);
    // The photo it DOES collect is the one attached to a post, and it says so.
    expect(
      screen.getByText(/testimonies, prayer requests, and any photo/i),
    ).toBeOnTheScreen();
  });

  // `20`: "The privacy notice says this plainly" about opt-in analytics and
  // scrubbed crash reports. It was absent from the frame entirely.
  test('states that analytics is opt-in and crash reports are scrubbed', async () => {
    await draw();
    expect(
      screen.getByText(/only if you say yes.*your words left out/i),
    ).toBeOnTheScreen();
  });

  test('the full policy opens in the reader language', async () => {
    await i18n.changeLanguage('de');
    await draw();

    await fireEvent.press(
      screen.getByRole('link', {
        name: 'Vollständige Datenschutzerklärung lesen',
      }),
    );
    expect(mockOpenBrowser).toHaveBeenCalledWith(
      'https://www.agbcglobal.com/de/privacy',
    );
  });

  test('the data-request route is the contact form, not a dead end', async () => {
    await draw();
    await fireEvent.press(
      screen.getByRole('button', { name: 'Contact us about my data' }),
    );
    expect(mockPush).toHaveBeenCalledWith('/contact');
  });
});

describe('the delete line is a state, not decoration', () => {
  test('a guest is not offered it, having no account to remove', async () => {
    useAuthStore.setState({ status: 'guest' });
    await draw();
    expect(screen.queryByText(/Want to remove your account/i)).toBeNull();
  });

  test('a member gets it, and the whole line is the target', async () => {
    useAuthStore.setState({ status: 'member' });
    await draw();

    // Queried by the label rather than by the red words: the frame draws a 12px
    // inline link, and W4.7 spent a slice on targets that small. The accessible
    // name carries the whole sentence because the whole line is pressable.
    await fireEvent.press(
      screen.getByRole('button', {
        name: 'Want to remove your account and data? Delete account',
      }),
    );
    expect(mockPush).toHaveBeenCalledWith('/settings/delete');
  });
});
