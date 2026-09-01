import { render, screen } from '@testing-library/react-native';

import { ToastProvider } from '@/components/ui';
import i18n from '@/i18n';
import { useAuthStore } from '@/state/auth';
import { ThemeScope } from '@/theme';

import { SignedOutToast } from '../SignedOutToast';

/**
 * The two ways a session ends without the member asking (docs/spec/03, W4.5).
 *
 * They are one transition with two sentences, and the sentences are the whole point: an
 * erased account is not a session that lapsed, and "please sign in again" would send
 * somebody to a door that no longer opens.
 *
 * Asserted here rather than on the device because a toast lives for a few seconds and
 * screenshotting one reliably is luck. What the device DID verify is the transition around
 * it: after an account was erased elsewhere, the phone came back a guest, with the member
 * rows and the Delete row gone from Settings.
 *
 * AWAIT the render: it returns a thenable here, and un-awaited leaves `screen` empty. See
 * the harness note in features/settings/__tests__/deleteAccount.test.tsx.
 */

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access --
   documented jest.mock factory shapes */
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access */

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => undefined } },
      }),
      signOut: () => Promise.resolve({ error: null }),
    },
  },
}));

async function renderToast() {
  return render(
    <ThemeScope name="light">
      <ToastProvider>
        <SignedOutToast />
      </ToastProvider>
    </ThemeScope>,
  );
}

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

test('a lapsed session asks the member to sign in again', async () => {
  useAuthStore.setState({ endedSession: 'signed-out' });
  await renderToast();

  expect(
    await screen.findByText("You've been signed out. Please sign in again."),
  ).toBeOnTheScreen();
});

test('an erased account says there is nothing to sign in to', async () => {
  useAuthStore.setState({ endedSession: 'deleted' });
  await renderToast();

  expect(
    await screen.findByText('This account no longer exists.'),
  ).toBeOnTheScreen();
  // NOT the other sentence: pointing somebody at a sign-in they cannot complete is the
  // failure this second reason exists to prevent.
  expect(
    screen.queryByText("You've been signed out. Please sign in again."),
  ).toBeNull();
});

test('and the reason is consumed, so the notice never shows twice', async () => {
  useAuthStore.setState({ endedSession: 'deleted' });
  await renderToast();

  await screen.findByText('This account no longer exists.');
  expect(useAuthStore.getState().endedSession).toBeNull();
});
