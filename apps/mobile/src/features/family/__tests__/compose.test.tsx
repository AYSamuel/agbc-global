import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';

import i18n from '@/i18n';
import { ToastProvider } from '@/components/ui';
import { useAuthStore } from '@/state/auth';
import { ThemeScope } from '@/theme';

import { ComposeFlow } from '../ComposeFlow';
import { draftKey } from '../drafts';

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

const mockBack = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    back: mockBack,
    replace: mockReplace,
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

// Screen tests mock the query module rather than Supabase reads (the family
// convention); the WRITE is mocked at the client, because the payload the
// composer sends is exactly what these tests exist to pin down.
/** The origin request a linked composer reads (W2.5). Set per test; undefined means the
 * composer was not opened from a prayer, which is every other test in this file. */
let mockOriginPrayer:
  { id: string; body: string; is_mine: boolean } | undefined;

jest.mock('../queries', () => ({
  // The composer refreshes only the surfaces its post belongs to (W2.4).
  TESTIMONY_SURFACE_KEYS: [['family', 'testimonies']],
  PRAYER_SURFACE_KEYS: [['family', 'prayers']],
  useTestimonyCategoriesQuery: () => ({
    data: [
      { id: '40000000-0000-4000-8000-000000000001', key: 'healing' },
      { id: '40000000-0000-4000-8000-000000000002', key: 'provision' },
    ],
  }),
  usePrayerQuery: () => ({ data: mockOriginPrayer }),
}));

// The photo pipeline is mocked at its own seam rather than at the picker: what
// these tests care about is the CONSENT the composer records once a photo is
// attached, not how the bytes got there (photo.test.tsx owns that half).
const PHOTO_PATH =
  '93000000-0000-4000-8000-00000000000a/11111111-2222-4333-8444-555555555555.jpg';
const mockDiscard = jest.fn();
jest.mock('../photo', () => ({
  photoPickingAvailable: true,
  pickAndUploadTestimonyPhoto: () =>
    Promise.resolve({
      ok: true,
      path: '93000000-0000-4000-8000-00000000000a/11111111-2222-4333-8444-555555555555.jpg',
      bytes: 204800,
      previewUri: 'file:///cache/photo.jpg',
    }),
  discardTestimonyPhoto: (path: string) => {
    mockDiscard(path);
    return Promise.resolve();
  },
}));

const mockInsert = jest.fn<Promise<{ error: unknown }>, [unknown]>();
const mockFrom = jest.fn<unknown, [string]>();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () =>
        Promise.resolve({ data: { session: { user: { id: 'user-1' } } } }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => undefined } },
      }),
    },
    from: (table: string) => {
      mockFrom(table);
      return { insert: (row: unknown) => mockInsert(row) };
    },
  },
}));

// RNTL v14 events are async and MUST be awaited (see the auth flow suite).
async function press(element: Parameters<typeof fireEvent.press>[0]) {
  await fireEvent.press(element);
}

async function renderFlow(
  target: 'testimony' | 'prayer',
  fromPrayerId?: string,
) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ThemeScope name="light">
        <ToastProvider>
          <ComposeFlow target={target} fromPrayerId={fromPrayerId} />
        </ToastProvider>
      </ThemeScope>
    </QueryClientProvider>,
  );
}

async function writeBody(label: string, text: string) {
  const field = screen.getByLabelText(label);
  await fireEvent.changeText(field, text);
}

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  mockOriginPrayer = undefined;
  mockInsert.mockResolvedValue({ error: null });
  useAuthStore.setState({
    status: 'member',
    profile: {
      displayName: 'Ayo',
      branchId: '00000000-0000-4000-8000-000000000001',
      language: 'en',
      role: 'member',
    },
  });
});

describe('TESTIMONY-COMPOSE', () => {
  test('an empty body cannot continue to consent', async () => {
    await renderFlow('testimony');
    await press(screen.getByText('Continue'));
    expect(await screen.findByText('Please write something to share.'));
    expect(screen.queryByText('Before you share')).toBeNull();
  });

  test('a body over the ceiling is refused with the length copy', async () => {
    await renderFlow('testimony');
    await writeBody('Share a testimony', 'x'.repeat(2001));
    await press(screen.getByText('Continue'));
    expect(
      await screen.findByText(
        "That's a little long. Please shorten it to 2000 characters.",
      ),
    ).toBeTruthy();
  });

  test('consent gates the post, then the insert carries the consent version', async () => {
    await renderFlow('testimony');
    await writeBody('Share a testimony', 'God provided a job.');
    await press(screen.getByText('Continue'));

    expect(await screen.findByText('Before you share')).toBeTruthy();

    // Posting without agreeing is refused client-side and never reaches the API.
    await press(screen.getByText('Post testimony'));
    expect(
      await screen.findByText('Please agree before posting.'),
    ).toBeTruthy();
    expect(mockInsert).not.toHaveBeenCalled();

    await press(screen.getByLabelText('I agree to share this publicly.'));
    await press(screen.getByText('Post testimony'));

    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalledTimes(1);
    });
    expect(mockFrom).toHaveBeenCalledWith('testimonies');
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        body: 'God provided a job.',
        language: 'en',
        consent_version: 'content-share-v1',
        category_id: null,
      }),
    );
    expect(await screen.findByText('Sent for review')).toBeTruthy();
  });

  test('a photo changes the consent shown AND the version recorded', async () => {
    await renderFlow('testimony');
    await writeBody('Share a testimony', 'God provided, and here we are.');

    // Without a photo the consent step is the three words-only points.
    await press(screen.getByText('Continue'));
    expect(screen.queryByText(/Your photo, their permission\./)).toBeNull();
    await press(screen.getByLabelText('Back'));

    await press(screen.getByLabelText('Add a photo'));
    await waitFor(() => {
      expect(screen.getByLabelText('Remove photo')).toBeTruthy();
    });

    await press(screen.getByText('Continue'));
    expect(
      await screen.findByText(/Your photo, their permission\./),
    ).toBeTruthy();
    await press(screen.getByLabelText('I agree to share this publicly.'));
    await press(screen.getByText('Post testimony'));

    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          image_path: PHOTO_PATH,
          // The pairing the database also enforces: a row with a photo may only
          // record wording that mentions photos (docs/spec/20 §Photos).
          consent_version: 'content-share-photo-v1',
        }),
      );
    });
  });

  test('removing a photo takes the object with it and restores the wordless consent', async () => {
    await renderFlow('testimony');
    await writeBody('Share a testimony', 'Words are enough after all.');
    await press(screen.getByLabelText('Add a photo'));
    await waitFor(() => {
      expect(screen.getByLabelText('Remove photo')).toBeTruthy();
    });

    await press(screen.getByLabelText('Remove photo'));
    // The author changed their mind before anyone else could see it, so the
    // uploaded object goes too rather than lingering in the bucket.
    await waitFor(() => {
      expect(mockDiscard).toHaveBeenCalledWith(PHOTO_PATH);
    });

    await press(screen.getByText('Continue'));
    expect(screen.queryByText(/Your photo, their permission\./)).toBeNull();
    await press(screen.getByLabelText('I agree to share this publicly.'));
    await press(screen.getByText('Post testimony'));

    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          image_path: null,
          consent_version: 'content-share-v1',
        }),
      );
    });
  });

  test('a selected category rides along, and tapping it again clears it', async () => {
    await renderFlow('testimony');
    await writeBody('Share a testimony', 'God healed my mother.');
    await press(screen.getByText('Healing'));
    await press(screen.getByText('Healing'));
    await press(screen.getByText('Provision'));
    await press(screen.getByText('Continue'));
    await press(screen.getByLabelText('I agree to share this publicly.'));
    await press(screen.getByText('Post testimony'));

    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          category_id: '40000000-0000-4000-8000-000000000002',
        }),
      );
    });
  });

  test('the daily quota refusal shows grace-framed copy and stays on consent', async () => {
    mockInsert.mockResolvedValue({
      error: { code: '23514', message: 'daily sharing limit reached' },
    });
    await renderFlow('testimony');
    await writeBody('Share a testimony', 'One more testimony.');
    await press(screen.getByText('Continue'));
    await press(screen.getByLabelText('I agree to share this publicly.'));
    await press(screen.getByText('Post testimony'));

    expect(
      await screen.findByText(
        "You've shared a lot with the family today. Please come back tomorrow to share more.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText('Sent for review')).toBeNull();
  });
});

describe('TESTIMONY-COMPOSE from an answered prayer (W2.5)', () => {
  const PRAYER_ID = '83000000-0000-4000-8000-00000000000a';
  const MINE = {
    id: PRAYER_ID,
    body: "Please pray for my mother's recovery after her surgery this week.",
    is_mine: true,
  };

  test('the banner quotes the request, and the row carries the link', async () => {
    mockOriginPrayer = MINE;
    await renderFlow('testimony', PRAYER_ID);

    // The frame's banner: the lead, then the request's own words truncated to one line.
    expect(
      await screen.findByText('Born from an answered prayer.', {
        exact: false,
      }),
    ).toBeTruthy();
    // The frame's own excerpt, verbatim: cut on a word boundary, then an ellipsis.
    expect(
      screen.getByText("“Please pray for my mother's recovery…”"),
    ).toBeTruthy();

    await writeBody('Share a testimony', 'God answered! She is recovering.');
    await press(screen.getByText('Continue'));
    await press(screen.getByLabelText('I agree to share this publicly.'));
    await press(screen.getByText('Post testimony'));

    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalled();
    });
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        body: 'God answered! She is recovering.',
        from_prayer_id: PRAYER_ID,
      }),
    );
  });

  test("someone else's request composes a plain testimony, with no claim on it", async () => {
    // `assert_prayer_link_allowed` refuses this link server-side, so the honest thing on
    // screen is a composer with no banner rather than one that fails on Post.
    mockOriginPrayer = { ...MINE, is_mine: false };
    await renderFlow('testimony', PRAYER_ID);

    await writeBody('Share a testimony', 'Not my prayer to answer.');
    expect(screen.queryByText('Born from an answered prayer.')).toBeNull();

    await press(screen.getByText('Continue'));
    await press(screen.getByLabelText('I agree to share this publicly.'));
    await press(screen.getByText('Post testimony'));

    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalled();
    });
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ from_prayer_id: null }),
    );
  });

  // A linked draft has its own key. Restored into a PLAIN composer it would publish the
  // same words with no ribbon and no way for the author to see what was lost, so the two
  // halves are asserted separately: it does not leak out, and it does come back.
  async function storeLinkedDraft() {
    await AsyncStorage.setItem(
      draftKey('testimony', undefined, PRAYER_ID),
      JSON.stringify({
        body: 'Half an answer.',
        categoryId: null,
        isAnonymous: false,
        savedAt: 1,
      }),
    );
  }

  test('a linked draft does not leak into a plain composer', async () => {
    await storeLinkedDraft();
    await renderFlow('testimony');

    expect(await screen.findByLabelText('Share a testimony')).toBeTruthy();
    expect(screen.queryByDisplayValue('Half an answer.')).toBeNull();
  });

  test('and comes back when the same request is answered again', async () => {
    await storeLinkedDraft();
    mockOriginPrayer = MINE;
    await renderFlow('testimony', PRAYER_ID);

    expect(await screen.findByDisplayValue('Half an answer.')).toBeTruthy();
  });
});

describe('PRAYER-COMPOSE', () => {
  test('the anonymity choice is sent to the server, not applied in the UI', async () => {
    await renderFlow('prayer');
    await writeBody('Share a prayer request', 'Please pray for my mother.');
    await press(screen.getByLabelText('Post anonymously as “A member”'));
    await press(screen.getByText('Continue'));
    await press(screen.getByLabelText('I agree to share this publicly.'));
    await press(screen.getByText('Post prayer request'));

    await waitFor(() => {
      expect(mockFrom).toHaveBeenCalledWith('prayers');
    });
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        body: 'Please pray for my mother.',
        is_anonymous: true,
        consent_version: 'content-share-v1',
      }),
    );
  });
});

describe('drafts', () => {
  test('a stored draft restores into the composer, and consent does NOT carry over', async () => {
    await AsyncStorage.setItem(
      draftKey('testimony'),
      JSON.stringify({
        body: 'A half-written testimony.',
        categoryId: null,
        isAnonymous: false,
        savedAt: 1,
      }),
    );
    await renderFlow('testimony');

    expect(await screen.findByDisplayValue('A half-written testimony.'));
    await press(screen.getByText('Continue'));
    // The consent step re-runs unticked: a carried-over agreement would record
    // Art. 9 consent this submission never received (docs/spec/09 §3).
    expect(await screen.findByText('Before you share')).toBeTruthy();
    expect(
      screen.getByRole('checkbox', {
        name: 'I agree to share this publicly.',
        checked: false,
      }),
    ).toBeTruthy();
  });

  test('a post made mid-keystroke does not resurrect its own draft', async () => {
    // The save is debounced, so a Post within that window schedules a write that
    // would otherwise land after the submit cleared it.
    jest.useFakeTimers();
    try {
      await renderFlow('testimony');
      await writeBody('Share a testimony', 'Posted immediately.');
      await press(screen.getByText('Continue'));
      await press(screen.getByLabelText('I agree to share this publicly.'));
      await press(screen.getByText('Post testimony'));
      await waitFor(() => {
        expect(mockInsert).toHaveBeenCalled();
      });
      jest.runOnlyPendingTimers();
    } finally {
      jest.useRealTimers();
    }
    expect(await AsyncStorage.getItem(draftKey('testimony'))).toBeNull();
  });

  test('a successful post clears the draft', async () => {
    await renderFlow('testimony');
    await writeBody('Share a testimony', 'God is faithful.');
    await press(screen.getByText('Continue'));
    await press(screen.getByLabelText('I agree to share this publicly.'));
    await press(screen.getByText('Post testimony'));

    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalled();
    });
    await waitFor(async () => {
      expect(await AsyncStorage.getItem(draftKey('testimony'))).toBeNull();
    });
  });
});
