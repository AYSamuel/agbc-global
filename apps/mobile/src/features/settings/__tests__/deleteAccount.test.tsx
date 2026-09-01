import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';

import { ToastProvider } from '@/components/ui';
import i18n from '@/i18n';
import { useAuthStore } from '@/state/auth';
import { ThemeScope } from '@/theme';

import DeleteAccount from '../../../../app/settings/delete';

/**
 * DELETE (frame `DELETE · account deletion`; docs/spec/16 §DELETE).
 *
 * WHAT IS WORTH TESTING HERE IS THE FRICTION, because the friction is the feature. Every
 * other screen in this app can be undone by tapping again; this one cannot be undone at all,
 * and the two gates in front of the button are the only thing between a bad moment and an
 * irreversible one. So most of what follows asserts what the screen REFUSES to do.
 *
 * What is NOT tested here, deliberately: what the erasure actually removes. That is `054`'s,
 * over the real database, where a claim about twenty tables can be checked against twenty
 * tables. A component test that mocked the RPC and then asserted about attendance rows would
 * only be asserting about its own mock.
 *
 * HARNESS NOTE, and it cost this file a full rebuild before it was understood. IN THIS
 * PROJECT'S RNTL, BOTH `render` AND `fireEvent` ARE ASYNC, and neither is obviously so:
 *
 *   * `render()` returns a THENABLE, not a RenderResult. Un-awaited it hands back an object
 *     with no query methods on it and leaves `screen` as its uninitialised stub, so every
 *     query answers "`render` function has not been called" after a render that plainly
 *     succeeded.
 *   * `fireEvent` returns a promise too. Un-awaited, its state update lands after the test
 *     that fired it has finished, and the symptom appears in the NEXT test rather than in
 *     the one at fault: the following render never becomes the tree `screen` answers about,
 *     and queries come back "unable to find" text that is plainly on the screen. The first
 *     two tests in a file pass and everything after them fails, which points at exactly the
 *     wrong place.
 *
 * So: await the render, wrap each interaction in `await act(async () => { await fireEvent…
 * })`, and assert through `waitFor`. Proven by a probe, not guessed at: this screen renders
 * four times over with no interactions and no trouble at all.
 */

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access --
   documented jest.mock factory shapes */
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access */

const mockReplace = jest.fn<undefined, [string]>();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
    replace: mockReplace,
    canGoBack: () => true,
  }),
}));

const mockRpc = jest.fn<
  Promise<{ error: { message: string } | null }>,
  [string, Record<string, unknown>]
>(() => Promise.resolve({ error: null }));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => undefined } },
      }),
    },
    rpc: (name: string, args: Record<string, unknown>) => mockRpc(name, args),
  },
}));

const mockSignOut = jest.fn<Promise<void>, []>(() => Promise.resolve());

/** AWAITED. See the harness note above; that is the whole reason it is a helper. */
async function renderScreen() {
  const view = await render(
    <ThemeScope name="light">
      <ToastProvider>
        <DeleteAccount />
      </ToastProvider>
    </ThemeScope>,
  );
  // And then wait for THIS tree to be the one `screen` answers about. Awaiting the render
  // is necessary and, from the third test in a file onward, not sufficient: the previous
  // test's tree was still the registered one, and queries for text plainly on screen came
  // back "unable to find". `findBy` retries, so it settles on the new tree.
  await screen.findByLabelText(
    i18n.t('settings:delete.typeToConfirm', {
      word: i18n.t('settings:delete.confirmWord'),
    }),
  );
  return view;
}

/**
 * The word field, found by the prompt each language actually renders.
 *
 * Built through i18n rather than hardcoded, because the prompt AND the word both change with
 * the language: the first draft looked for "Type LÖSCHEN to confirm", which is a sentence no
 * screen has ever drawn.
 */
function wordField() {
  return screen.getByLabelText(
    i18n.t('settings:delete.typeToConfirm', {
      word: i18n.t('settings:delete.confirmWord'),
    }),
  );
}

function deleteButton(label = 'Delete my account') {
  return screen.getByLabelText(label);
}

/** Both gates, in the order somebody actually does them. */
async function arm() {
  await act(async () => {
    await fireEvent.changeText(wordField(), 'DELETE');
  });
  await act(async () => {
    await fireEvent.press(screen.getByText('I understand this is permanent.'));
  });
  await waitFor(() => {
    expect(deleteButton()).toBeEnabled();
  });
}

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ signOut: mockSignOut } as never);
});

/**
 * `cleanup` is async here too, like everything else in this library. Unmounting between
 * tests is what keeps each render the one `screen` answers about.
 */
afterEach(async () => {
  await cleanup();
});

test('it names what goes, rather than saying "your data"', async () => {
  await renderScreen();

  expect(
    screen.getByText(
      "This can't be undone. Deleting removes your account and your personal data from AGBC.",
    ),
  ).toBeOnTheScreen();
  // The four bullets. Somebody weighing this needs to know their streak and their purchases
  // go, which "your data" would never tell them.
  expect(
    screen.getByText('Your profile, name, photo and email'),
  ).toBeOnTheScreen();
  expect(
    screen.getByText(
      'Your attendance, streak, milestones and reading progress',
    ),
  ).toBeOnTheScreen();
  expect(
    screen.getByText('Your registrations and library entitlements'),
  ).toBeOnTheScreen();
  expect(
    screen.getByText(
      'Any pending testimonies or prayers (they will not be published)',
    ),
  ).toBeOnTheScreen();
  // And what is KEPT, because "some records are kept" with no explanation invites somebody
  // to assume the worst.
  expect(
    screen.getByText(
      /some records \(like reports\) are kept for a limited time/,
    ),
  ).toBeOnTheScreen();
});

test('neither gate alone opens the door', async () => {
  await renderScreen();
  expect(deleteButton()).toBeDisabled();

  // The word alone.
  await act(async () => {
    await fireEvent.changeText(wordField(), 'DELETE');
  });
  await waitFor(() => {
    expect(deleteButton()).toBeDisabled();
  });

  // The checkbox alone, with the word cleared again.
  await act(async () => {
    await fireEvent.changeText(wordField(), '');
  });
  await act(async () => {
    await fireEvent.press(screen.getByText('I understand this is permanent.'));
  });
  await waitFor(() => {
    expect(deleteButton()).toBeDisabled();
  });

  // Both.
  await act(async () => {
    await fireEvent.changeText(wordField(), 'DELETE');
  });
  await waitFor(() => {
    expect(deleteButton()).toBeEnabled();
  });
});

test('a near miss is still a miss', async () => {
  await renderScreen();
  await act(async () => {
    await fireEvent.press(screen.getByText('I understand this is permanent.'));
  });

  for (const attempt of ['DELET', 'DELETED', 'REMOVE', '']) {
    await act(async () => {
      await fireEvent.changeText(wordField(), attempt);
    });
    await waitFor(() => {
      expect(deleteButton()).toBeDisabled();
    });
  }

  // Trimmed and case-insensitive on purpose: somebody who typed it in lower case has still
  // decided, and the gate is deliberateness rather than spelling.
  await act(async () => {
    await fireEvent.changeText(wordField(), '  delete ');
  });
  await waitFor(() => {
    expect(deleteButton()).toBeEnabled();
  });
});

test('remove is the default, and the choice reaches the server as made', async () => {
  await renderScreen();
  await arm();
  await act(async () => {
    await fireEvent.press(deleteButton());
  });

  await waitFor(() => {
    expect(mockRpc).toHaveBeenCalledWith('delete_my_account', {
      p_keep_posts: false,
    });
  });
});

test('keeping the posts is carried through rather than assumed', async () => {
  await renderScreen();
  await act(async () => {
    await fireEvent.press(screen.getByText('Keep my approved posts'));
  });
  await arm();
  await act(async () => {
    await fireEvent.press(deleteButton());
  });

  await waitFor(() => {
    expect(mockRpc).toHaveBeenCalledWith('delete_my_account', {
      p_keep_posts: true,
    });
  });
});

test('the device is signed out and sent to a guest screen', async () => {
  await renderScreen();
  await arm();
  await act(async () => {
    await fireEvent.press(deleteButton());
  });

  await waitFor(() => {
    expect(mockSignOut).toHaveBeenCalled();
  });
  // Home, not Settings: every member surface behind them is about to fail its reads, and
  // landing on one of those would be the app arguing with itself.
  expect(mockReplace).toHaveBeenCalledWith('/');
});

test('a failure says nothing happened, and leaves the session alone', async () => {
  mockRpc.mockResolvedValueOnce({ error: { message: 'network' } });
  await renderScreen();
  await arm();
  await act(async () => {
    await fireEvent.press(deleteButton());
  });

  expect(
    await screen.findByText(
      /We couldn't delete your account. Nothing has changed./,
    ),
  ).toBeOnTheScreen();
  // THE IMPORTANT HALF. `16` asks for the offline case to be queued and this screen refuses
  // to: an irreversible action held locally is one that can replay days later, after the
  // person changed their mind. A failure signs nobody out and leaves nothing pending.
  expect(mockSignOut).not.toHaveBeenCalled();
  expect(mockReplace).not.toHaveBeenCalled();
  // And it stays armed, so the retry is one tap rather than the whole ritual again.
  await waitFor(() => {
    expect(deleteButton()).toBeEnabled();
  });
});

test('the word to type is the language being read, not English', async () => {
  await i18n.changeLanguage('de');
  await renderScreen();

  // Asking a German member to type an English word would turn the friction into a puzzle.
  await act(async () => {
    await fireEvent.press(
      screen.getByText('Mir ist klar, dass das endgültig ist.'),
    );
  });
  await act(async () => {
    await fireEvent.changeText(wordField(), 'DELETE');
  });
  await waitFor(() => {
    expect(deleteButton('Mein Konto löschen')).toBeDisabled();
  });

  await act(async () => {
    await fireEvent.changeText(wordField(), 'LÖSCHEN');
  });
  await waitFor(() => {
    expect(deleteButton('Mein Konto löschen')).toBeEnabled();
  });

  await i18n.changeLanguage('en');
});
