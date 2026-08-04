import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { ToastProvider } from '@/components/ui';
import i18n from '@/i18n';
import { useAuthStore } from '@/state/auth';
import { ThemeScope } from '@/theme';

import BlockedMembers from '../../../../app/settings/blocked';

/**
 * SETTINGS > Blocked members (frames `Settings > Blocked members` and `nobody blocked`).
 *
 * The screen reads `blocked_members`, the security-definer view whose
 * `blocker_id = auth.uid()` predicate IS the boundary (migration 20260803160000). That it
 * cannot be asked about anybody else's blocks, or about who blocked the caller, is
 * asserted in `027`; what is asserted here is that the screen names people, offers one
 * action each, and does not go looking for rows with a filter of its own.
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

interface Row {
  blocked_id: string;
  display_name: string;
}

const mockRows = jest.fn<{ data: Row[] | null; error: unknown }, []>(() => ({
  data: [],
  error: null,
}));
const mockSelect = jest.fn<undefined, [string]>();
const mockDeleteEq = jest.fn<undefined, [string, string]>();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => undefined } },
      }),
    },
    from: (table: string) => ({
      select: (columns: string) => {
        mockSelect(columns);
        return { order: () => Promise.resolve(mockRows()) };
      },
      delete: () => ({
        eq: (column: string, value: string) => {
          mockDeleteEq(column, value);
          return Promise.resolve({ error: null });
        },
      }),
      _table: table,
    }),
  },
}));

/** RNTL v14 renders async, so every call site awaits this. */
async function renderScreen() {
  // Retries off: the app wants them, but a test that means to see the error state
  // should not wait out three exponential backoffs to reach it.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ThemeScope name="light">
        <ToastProvider>
          <BlockedMembers />
        </ToastProvider>
      </ThemeScope>
    </QueryClientProvider>,
  );
}

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ status: 'member' });
});

test('the list names the people it is about, because a uuid cannot be unblocked', async () => {
  mockRows.mockReturnValue({
    data: [
      { blocked_id: 'b-1', display_name: 'Tunde A.' },
      { blocked_id: 'b-2', display_name: 'Daniel K.' },
    ],
    error: null,
  });
  await renderScreen();

  expect(await screen.findByText('Tunde A.')).toBeOnTheScreen();
  expect(screen.getByText('Daniel K.')).toBeOnTheScreen();
  // The line under the title repeats what blocking does: somebody arriving here weeks
  // later is deciding whether to undo it.
  expect(
    screen.getByText(/do not see each other's posts. They are not told./),
  ).toBeOnTheScreen();
  // No date and no count of what they are missing (frame note): both invite
  // second-guessing a decision already made.
  expect(screen.queryByText(/blocked on/i)).toBeNull();
});

test('the query asks for its two columns and adds no filter of its own', async () => {
  mockRows.mockReturnValue({
    data: [{ blocked_id: 'b-1', display_name: 'Tunde A.' }],
    error: null,
  });
  await renderScreen();
  await screen.findByText('Tunde A.');

  // Whose rows these are is the view's answer, not a `.eq()` this screen could forget.
  expect(mockSelect).toHaveBeenCalledWith('blocked_id, display_name');
});

test('each row unblocks its own member, and says whose button it is', async () => {
  mockRows.mockReturnValue({
    data: [
      { blocked_id: 'b-1', display_name: 'Tunde A.' },
      { blocked_id: 'b-2', display_name: 'Daniel K.' },
    ],
    error: null,
  });
  await renderScreen();
  await screen.findByText('Daniel K.');

  // Three "Unblock" buttons in a column need to say which member each one is about.
  await fireEvent.press(
    screen.getByRole('button', { name: 'Unblock Daniel K.' }),
  );
  expect(mockDeleteEq).toHaveBeenCalledWith('blocked_id', 'b-2');
  expect(await screen.findByText('Daniel K. is unblocked.')).toBeOnTheScreen();
});

test('nobody blocked is an explanation, not a blank screen', async () => {
  mockRows.mockReturnValue({ data: [], error: null });
  await renderScreen();

  expect(await screen.findByText('Nobody is blocked')).toBeOnTheScreen();
  // It says where the control lives, since a member who has never blocked anyone has
  // no reason to know.
  expect(
    screen.getByText(/you can block a member from the post actions menu/),
  ).toBeOnTheScreen();
});

test('a failed read offers a retry rather than an empty list', async () => {
  mockRows.mockReturnValue({ data: null, error: { message: 'offline' } });
  await renderScreen();

  expect(await screen.findByText('Something went wrong')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Try again' })).toBeOnTheScreen();
});
