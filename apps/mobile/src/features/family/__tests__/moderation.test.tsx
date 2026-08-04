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
import { useGateStore } from '@/state/gate';
import { ThemeScope } from '@/theme';

import { PostActionsMenu } from '../PostActionsMenu';

/**
 * The `...` menu (W2.6): which menu opens, and what each row actually sends.
 *
 * The writes are mocked at the CLIENT rather than at the feature module, the same way
 * the composer's are, because the payload is the thing worth pinning: a report carries
 * the stable reason key and nothing else, and a delete is an `update` of `deleted_at`
 * and never the DELETE verb (which would cascade the reports about that post away).
 *
 * What the DATABASE does with those writes is proven in pgTAP, not here: the forced
 * reporter, the forced `open` status, the 20-per-day cap and the two-way block filter
 * are `009` and `010`, and an author's edit re-pending their post is `009` line 147.
 */

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access --
   documented jest.mock factory shapes */
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access */

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
}));

interface WriteResult {
  error: { code?: string; message: string } | null;
}

const mockInsert = jest.fn<Promise<WriteResult>, [string, unknown]>(() =>
  Promise.resolve({ error: null }),
);
const mockUpdate = jest.fn<Promise<WriteResult>, [string, unknown]>(() =>
  Promise.resolve({ error: null }),
);

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: 'me-1' } } }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => undefined } },
      }),
    },
    from: (table: string) => ({
      insert: (row: unknown) => mockInsert(table, row),
      update: (row: unknown) => ({
        eq: () => mockUpdate(table, row),
      }),
      delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
      select: () => ({
        order: () => Promise.resolve({ data: [], error: null }),
      }),
    }),
  },
}));

const onGone = jest.fn();

function renderMenu(
  props: Partial<React.ComponentProps<typeof PostActionsMenu>> = {},
) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ThemeScope name="light">
        <ToastProvider>
          <PostActionsMenu
            target="testimony"
            postId="post-1"
            isMine={false}
            authorId="them-1"
            authorName="Tunde A."
            onGone={onGone}
            {...props}
          />
        </ToastProvider>
      </ThemeScope>
    </QueryClientProvider>,
  );
}

/** RNTL v14 events are async and MUST be awaited. */
async function press(name: string) {
  await fireEvent.press(screen.getByRole('button', { name }));
}

async function openMenu() {
  await press('Post actions');
}

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ status: 'member' });
  useGateStore.setState({ pending: null, dismissedKinds: [] });
});

describe('which menu opens (frames POST-ACTIONS and REPORT / Block)', () => {
  test("someone else's post offers Report and Block, never Edit or Delete", async () => {
    await renderMenu();
    await openMenu();

    expect(screen.getByText('This post')).toBeOnTheScreen();
    expect(screen.getByText('Report post')).toBeOnTheScreen();
    expect(screen.getByText('Block this member')).toBeOnTheScreen();
    expect(screen.queryByText('Edit')).toBeNull();
    expect(screen.queryByText('Delete')).toBeNull();
  });

  test('own post offers Edit and Delete, and says what editing costs', async () => {
    await renderMenu({ isMine: true, authorId: 'me-1', authorName: 'Me' });
    await openMenu();

    expect(screen.getByText('Your post')).toBeOnTheScreen();
    expect(screen.getByText('Edit')).toBeOnTheScreen();
    // The warning belongs on the row, before the composer opens: it is why there is no
    // separate "this will be reviewed again" screen inside the editor.
    expect(
      screen.getByText('Editing sends this back for review'),
    ).toBeOnTheScreen();
    expect(screen.queryByText('Report post')).toBeNull();
  });

  test('an anonymous request offers Report but nobody to block', async () => {
    // The row that reaches this menu has had its author stripped by prayer_feed. There
    // is no member to name in a confirm sheet and none to write to blocked_users, so the
    // row is absent rather than present and broken.
    await renderMenu({
      target: 'prayer',
      isMine: false,
      authorId: null,
      authorName: null,
    });
    await openMenu();

    expect(screen.getByText('Report post')).toBeOnTheScreen();
    expect(screen.queryByText('Block this member')).toBeNull();
  });

  test('Edit opens the composer on this post rather than an empty one', async () => {
    await renderMenu({ isMine: true, authorId: 'me-1' });
    await openMenu();
    await press('Edit. Editing sends this back for review');

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/testimony/compose',
      params: { edit: 'post-1' },
    });
  });
});

describe('REPORT · the reason, in the reporter’s words', () => {
  test('Send waits for a choice, then sends the stable key', async () => {
    await renderMenu();
    await openMenu();
    await press('Report post');

    const send = screen.getByRole('button', { name: 'Send to a leader' });
    // Nothing is preselected: defaulting to the safeguarding option would file every
    // distracted tap as "someone may be at risk".
    expect(send).toBeDisabled();

    await fireEvent.press(
      screen.getByRole('radio', {
        name: /Private details about someone/,
      }),
    );
    await fireEvent.press(send);

    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalledWith('reports', {
        reporter_id: 'me-1',
        testimony_id: 'post-1',
        prayer_id: null,
        // The KEY, not the sentence: the dashboard queue owns the English.
        reason: 'private_details',
      });
    });
    expect(
      await screen.findByText('Thank you. A leader will look at this.'),
    ).toBeOnTheScreen();
  });

  test('reporting the same post twice says thank you and writes nothing new', async () => {
    // The partial uniques make the second insert a duplicate key. Telling somebody
    // "you already reported this" only invites them to wonder why nothing has happened.
    mockInsert.mockResolvedValueOnce({
      error: { code: '23505', message: 'duplicate key value' },
    });
    await renderMenu();
    await openMenu();
    await press('Report post');
    await fireEvent.press(
      screen.getByRole('radio', { name: /Hurtful or abusive/ }),
    );
    await fireEvent.press(
      screen.getByRole('button', { name: 'Send to a leader' }),
    );

    expect(
      await screen.findByText('Thank you. A leader will look at this.'),
    ).toBeOnTheScreen();
  });

  test('the twenty-first report of the day lands on the same thank you', async () => {
    // Same reasoning in the other direction: telling a flooder they hit a cap tells
    // them exactly what to work around.
    mockInsert.mockResolvedValueOnce({
      error: { code: '23514', message: 'daily report limit reached' },
    });
    await renderMenu();
    await openMenu();
    await press('Report post');
    await fireEvent.press(
      screen.getByRole('radio', { name: /Not for this space/ }),
    );
    await fireEvent.press(
      screen.getByRole('button', { name: 'Send to a leader' }),
    );

    expect(
      await screen.findByText('Thank you. A leader will look at this.'),
    ).toBeOnTheScreen();
  });

  test('a real failure is told honestly rather than thanked', async () => {
    mockInsert.mockResolvedValueOnce({
      error: { code: '08006', message: 'connection failure' },
    });
    await renderMenu();
    await openMenu();
    await press('Report post');
    await fireEvent.press(
      screen.getByRole('radio', { name: /Someone may be at risk/ }),
    );
    await fireEvent.press(
      screen.getByRole('button', { name: 'Send to a leader' }),
    );

    expect(
      await screen.findByText('That did not send. Please try again.'),
    ).toBeOnTheScreen();
  });
});

describe('BLOCK · what blocking actually does', () => {
  test('the confirm says both halves before anything is written', async () => {
    await renderMenu();
    await openMenu();
    await press('Block this member');

    expect(screen.getByText('Block Tunde A.?')).toBeOnTheScreen();
    // Two-way, silent, reversible, and not a report: all four are things nobody can
    // guess from a button that says "Block this member".
    const body = screen.getByText(/You will not see each other/);
    expect(body).toHaveTextContent(/they are not told/);
    expect(body).toHaveTextContent(/Blocked members/);
    expect(body).toHaveTextContent(/report it instead/);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  test('a block still lands when the post vanishes mid-write', async () => {
    // The regression from the device pass (2026-08-04). Blocking removes this very post
    // from the feed views, so the refetch that follows the write unmounts the menu with
    // the row it was drawn from. With per-call `mutate` callbacks, react-query drops
    // them when the observer goes, and the block worked silently: no toast, and the
    // member left staring at "This is no longer available". Here the unmount is forced
    // WHILE the write is in flight, which is the only order that catches it.
    let settle = () => {
      // Replaced below, once the promise hands over its resolver.
    };
    mockInsert.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          settle = () => {
            resolve({ error: null });
          };
        }),
    );

    const view = await renderMenu();
    await openMenu();
    await press('Block this member');
    // Awaited, and the write is STILL in flight afterwards: the insert above hands back
    // a promise nothing has resolved yet, which is what keeps the mutation pending
    // across the unmount below.
    await press('Block Tunde A.');

    // RNTL v14 unmounts async, like it renders.
    await view.unmount();
    settle();

    await waitFor(() => {
      expect(onGone).toHaveBeenCalledTimes(1);
    });
  });

  test('confirming writes the block and takes the reader off the post', async () => {
    await renderMenu();
    await openMenu();
    await press('Block this member');
    await press('Block Tunde A.');

    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalledWith('blocked_users', {
        blocker_id: 'me-1',
        blocked_id: 'them-1',
      });
    });
    // The post is invisible to them now, so staying on it would mean staring at
    // something the feed has already agreed they cannot see.
    expect(onGone).toHaveBeenCalledTimes(1);
  });
});

describe('DELETE · the confirm behind POST-ACTIONS', () => {
  test('deleting asks first, and says what it costs', async () => {
    await renderMenu({ isMine: true, authorId: 'me-1' });
    await openMenu();
    await press('Delete');

    expect(screen.getByText('Delete this testimony?')).toBeOnTheScreen();
    expect(
      screen.getByText(/the Glory others gave it goes with it/),
    ).toBeOnTheScreen();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test('a confirmed delete is a soft delete, so reports about it survive', async () => {
    await renderMenu({ isMine: true, authorId: 'me-1' });
    await openMenu();
    await press('Delete');
    await press('Delete');

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledTimes(1);
    });
    const [table, row] = mockUpdate.mock.calls[0];
    expect(table).toBe('testimonies');
    // `deleted_at`, never the DELETE verb: reports.testimony_id cascades, and a member
    // deleting their own post must not erase the record that somebody raised it.
    expect(row).toEqual({ deleted_at: expect.any(String) as unknown });
    expect(onGone).toHaveBeenCalledTimes(1);
  });
});

describe('a guest is gated, not refused', () => {
  test('Report opens the gate and remembers why', async () => {
    useAuthStore.setState({ status: 'guest' });
    await renderMenu();
    await openMenu();
    await press('Report post');

    expect(screen.getByText('Sign in to report this post')).toBeOnTheScreen();

    await press('Sign in');
    expect(useGateStore.getState().pending).toEqual({ kind: 'report' });
    expect(mockPush).toHaveBeenCalledWith('/auth');
    expect(mockInsert).not.toHaveBeenCalled();
  });

  test('Block opens the gate with its own wording', async () => {
    useAuthStore.setState({ status: 'guest' });
    await renderMenu();
    await openMenu();
    await press('Block this member');

    expect(screen.getByText('Sign in to block this member')).toBeOnTheScreen();
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
