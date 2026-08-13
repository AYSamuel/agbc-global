import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';

import { ToastProvider } from '@/components/ui';
import i18n from '@/i18n';
import { useAuthStore } from '@/state/auth';
import { ThemeScope } from '@/theme';

import { ComposeFlow } from '../ComposeFlow';

/**
 * Edit and resubmit (W2.6): the same composer, opened on words that already exist.
 *
 * That the save RE-PENDS the post is the database's job and is proven in `009` ("any
 * author edit to approved content resets it to pending"). What is proven here is the
 * half the app owns, and each of these is a rule the database would otherwise refuse:
 *
 *   - the box opens holding the existing words, not empty (an empty box would post a
 *     second, near-identical testimony and leave the first one live);
 *   - the update carries no consent evidence, which is immutable on this path;
 *   - the update does not set `status`, because the trigger owns it;
 *   - a `removed` post is not offered an editor at all.
 */

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access --
   documented jest.mock factory shapes */
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access */

jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: jest.fn(),
    replace: jest.fn(),
    push: jest.fn(),
    canGoBack: () => true,
  }),
  router: { push: jest.fn() },
}));

jest.mock('expo-localization', () => ({
  getLocales: jest.fn(() => [{ languageCode: 'en' }]),
}));

jest.mock('@/lib/queryPersist', () => ({
  queryClient: { invalidateQueries: () => Promise.resolve() },
}));

jest.mock('../queries', () => ({
  TESTIMONY_SURFACE_KEYS: [['family', 'testimonies']],
  PRAYER_SURFACE_KEYS: [['family', 'prayers']],
  useTestimonyCategoriesQuery: () => ({ data: [] }),
  // An EDIT never carries a prayer link (W2.5: `from_prayer_id` counts as content on
  // update, and there is no frame for adding one), so the composer disables this read
  // outright. It is here because the mock has to answer the call, not because an edit
  // has an answer.
  usePrayerQuery: () => ({ data: undefined }),
}));

jest.mock('../photo', () => ({
  photoPickingAvailable: true,
  pickAndUploadTestimonyPhoto: () =>
    Promise.resolve({ ok: false, reason: 'cancelled' }),
  discardTestimonyPhoto: () => Promise.resolve(),
}));

interface ExistingRow {
  id: string;
  body: string;
  category_id: string | null;
  image_path: string | null;
  status: string;
}

// W2.10: the edit path must fire NO analytics event; asserted on our own seam.
const mockTrack = jest.fn();
jest.mock('@/lib/analytics', () => ({
  track: (...args: unknown[]) => {
    mockTrack(...args);
  },
}));

const mockExisting = jest.fn<
  { data: ExistingRow | null; error: unknown },
  []
>();
const mockUpdate = jest.fn<Promise<{ error: unknown }>, [string, unknown]>(() =>
  Promise.resolve({ error: null }),
);

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () =>
        Promise.resolve({ data: { session: { user: { id: 'me-1' } } } }),
      getUser: () => Promise.resolve({ data: { user: { id: 'me-1' } } }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => undefined } },
      }),
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          is: () => ({ maybeSingle: () => Promise.resolve(mockExisting()) }),
        }),
      }),
      update: (row: unknown) => ({ eq: () => mockUpdate(table, row) }),
      insert: () => Promise.resolve({ error: null }),
    }),
  },
}));

/**
 * RNTL v14 renders async, so every call site awaits this. The editor also paints its
 * loading state first (the row it is about to change has to arrive), so tests that mean
 * to act on the composer wait for the save button rather than for the header, which both
 * states draw.
 */
async function renderEditor(editId = 'post-1') {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ThemeScope name="light">
        <ToastProvider>
          <ComposeFlow target="testimony" editId={editId} />
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
  useAuthStore.setState({
    status: 'member',
    profile: {
      displayName: 'Me',
      branchId: 'b-gla',
      language: 'en',
      role: 'member',
    },
  });
  mockExisting.mockReturnValue({
    data: {
      id: 'post-1',
      body: 'God provided a job after months of waiting.',
      category_id: null,
      image_path: null,
      status: 'approved',
    },
    error: null,
  });
});

test('the composer opens holding the words it is about to change', async () => {
  await renderEditor();
  const save = await screen.findByRole('button', { name: 'Save and resubmit' });

  expect(screen.getByText('Edit testimony')).toBeOnTheScreen();
  expect(
    screen.getByDisplayValue('God provided a job after months of waiting.'),
  ).toBeOnTheScreen();
  expect(save).toBeOnTheScreen();
  // The verb says what happens next; POST-ACTIONS' row has already said that saving
  // sends the post back for review.
});

test('saving sends only what an author may change, and never the consent evidence', async () => {
  await renderEditor();
  await screen.findByRole('button', { name: 'Save and resubmit' });

  await fireEvent.changeText(
    screen.getByDisplayValue('God provided a job after months of waiting.'),
    'God provided a job, and the family prayed me through it.',
  );
  await fireEvent.press(
    screen.getByRole('button', { name: 'Save and resubmit' }),
  );

  await waitFor(() => {
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });
  const [table, row] = mockUpdate.mock.calls[0];
  expect(table).toBe('testimonies');
  expect(row).toEqual({
    body: 'God provided a job, and the family prayed me through it.',
    category_id: null,
    image_path: null,
    language: 'en',
  });
  // Absent on purpose, all four: consent_version and consented_at are immutable on
  // update, author_id and branch_id are the row's identity, and `status` belongs to
  // the trigger that re-pends the post.
  const sent = row as Record<string, unknown>;
  expect(sent).not.toHaveProperty('consent_version');
  expect(sent).not.toHaveProperty('consented_at');
  expect(sent).not.toHaveProperty('status');
  expect(sent).not.toHaveProperty('author_id');
  // W2.10: a re-submission is not a second post, so the edit path fires no
  // testimony_posted (the plan counts posts, not saves).
  expect(mockTrack).not.toHaveBeenCalled();
});

test('an edit does not re-run the consent step, because there is nothing to record', async () => {
  await renderEditor();
  await fireEvent.press(
    await screen.findByRole('button', { name: 'Save and resubmit' }),
  );

  // Straight from the box to "Sent for review": no CONSENT screen in between.
  expect(await screen.findByText('Sent for review')).toBeOnTheScreen();
  expect(screen.queryByText('Before you share')).toBeNull();
});

test('a photo cannot be added to a post that never carried one', async () => {
  // The photo gate refuses it (20260727120000): the recorded consent does not mention
  // photos and cannot be updated. So the control is absent rather than refused.
  await renderEditor();
  await screen.findByRole('button', { name: 'Save and resubmit' });

  expect(screen.queryByText('Add a photo')).toBeNull();
});

test('a removed post is not offered an editor it would be refused', async () => {
  mockExisting.mockReturnValue({
    data: {
      id: 'post-1',
      body: 'God moved powerfully in my workplace this month.',
      category_id: null,
      image_path: null,
      status: 'removed',
    },
    error: null,
  });
  await renderEditor();

  expect(await screen.findByText('This cannot be edited')).toBeOnTheScreen();
  expect(screen.getByText(/contact your branch leader/i)).toBeOnTheScreen();
  expect(mockUpdate).not.toHaveBeenCalled();
});

test('a post that is already gone says so rather than opening an empty box', async () => {
  mockExisting.mockReturnValue({ data: null, error: null });
  await renderEditor();

  expect(await screen.findByText('This cannot be edited')).toBeOnTheScreen();
  expect(
    screen.getByText('It may have been deleted already.'),
  ).toBeOnTheScreen();
});
