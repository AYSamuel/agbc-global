import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';

import { ToastProvider } from '@/components/ui';
import i18n from '@/i18n';
import { useAuthStore } from '@/state/auth';
import { ThemeScope } from '@/theme';

import Settings from '../../../../app/settings/index';

/**
 * SETTINGS (frame `SETTINGS · hub`, `16` §SETTINGS).
 *
 * What is asserted here is the hub's SHAPE, which is the one thing about this
 * screen no other test holds and the one thing a later session would undo
 * without noticing. On 2026-09-16 the hub lost an "About" section whose About
 * and Contact rows were a second door to MORE > Church, and Legal moved up to
 * sit above Privacy and Delete account. Both are decisions rather than
 * accidents (`16`, and the note on the frame), so both are written down where
 * the builder is looking: here.
 */

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access --
   documented jest.mock factory shapes */
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access */

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
    canGoBack: () => true,
  }),
}));

// The auth store reaches the real Supabase client at module scope, which refuses
// to build without env. The blocked-members query is answered with nothing: this
// test is about which rows exist, not about the count in one of them.
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => undefined } },
      }),
    },
    from: () => ({
      select: () => ({
        order: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
  },
}));

async function renderHub() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ThemeScope name="light">
        <ToastProvider>
          <Settings />
        </ToastProvider>
      </ThemeScope>
    </QueryClientProvider>,
  );
}

/** Every row, in the order the screen draws them. */
function rowOrder(): string[] {
  return screen
    .getAllByRole('button')
    .map((node) => String(node.props.accessibilityLabel ?? ''));
}

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ status: 'member' });
});

test('Legal sits above Privacy and Delete account', async () => {
  await renderHub();
  const rows = rowOrder();

  expect(rows).toContain('Legal');
  expect(rows).toContain('Privacy');
  expect(rows).toContain('Delete account');
  // Outward-in: the public documents, then what this app holds about you, then
  // the way out. Indexes rather than a snapshot, so adding a row elsewhere on
  // the screen does not fail this.
  expect(rows.indexOf('Legal')).toBeLessThan(rows.indexOf('Privacy'));
  expect(rows.indexOf('Privacy')).toBeLessThan(rows.indexOf('Delete account'));
});

test('the church is not reachable from here: About and Contact belong to MORE', async () => {
  await renderHub();
  const rows = rowOrder();

  expect(rows).not.toContain('About');
  expect(rows).not.toContain('Contact');
  // And the section that used to hold them is gone with them, rather than
  // standing empty over a single Legal row.
  expect(screen.queryByText('About')).toBeNull();
});

test('a guest gets Legal and Privacy, and no Delete account', async () => {
  useAuthStore.setState({ status: 'guest' });
  await renderHub();
  const rows = rowOrder();

  // Legal and Privacy are documents anybody may read; deletion needs an account
  // to delete. The card holds two rows for a guest, in the same order.
  expect(rows).toContain('Legal');
  expect(rows).toContain('Privacy');
  expect(rows).not.toContain('Delete account');
  expect(rows.indexOf('Legal')).toBeLessThan(rows.indexOf('Privacy'));
});
