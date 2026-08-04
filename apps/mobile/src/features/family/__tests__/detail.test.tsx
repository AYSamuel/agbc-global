import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { ToastProvider } from '@/components/ui';
import i18n from '@/i18n';
import { ThemeScope } from '@/theme';

import type { PrayerFeedItem, TestimonyFeedItem } from '../queries';

import PrayerDetail from '../../../../app/prayer/[id]';
import TestimonyDetail from '../../../../app/testimony/[id]';

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access --
   documented jest.mock factory shapes */
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access */

// The mark-answered write (W2.5). Mocked at the client, like the composer's insert,
// because the payload PRAYER-DETAIL sends is part of what these tests pin down.
const mockUpdate = jest.fn<Promise<{ error: unknown }>, [unknown]>();

// TESTIMONY-DETAIL renders the optional photo, which reaches the storage client
// through useSignedPhotoUrl. These fixtures carry no photo, so nothing signs
// anything; the mock exists only so importing the screen does not construct a
// real client (src/lib/supabase throws without EXPO_PUBLIC_* config).
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => undefined } },
      }),
    },
    from: () => ({
      update: (values: unknown) => ({
        eq: () => mockUpdate(values),
      }),
    }),
    storage: {
      from: () => ({
        createSignedUrl: () =>
          Promise.resolve({ data: null, error: new Error('not in tests') }),
      }),
    },
  },
}));

const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: mockReplace }),
  useLocalSearchParams: () => ({ id: 'x1' }),
}));

const mockTestimony = jest.fn<
  {
    data: TestimonyFeedItem | null | undefined;
    isError: boolean;
    refetch: () => void;
  },
  []
>();
const mockPrayer = jest.fn<
  {
    data: PrayerFeedItem | null | undefined;
    isError: boolean;
    refetch: () => void;
  },
  []
>();
jest.mock('../queries', () => ({
  useTestimonyQuery: () => mockTestimony(),
  usePrayerQuery: () => mockPrayer(),
}));

const mockShareToWhatsApp = jest.fn();
const mockShareText = jest.fn();
jest.mock('../share', () => ({
  shareToWhatsApp: (m: string) => {
    mockShareToWhatsApp(m);
  },
  shareText: (m: string) => {
    mockShareText(m);
  },
  testimonyShareText: () => 'share-text',
}));

jest.mock('@/features/onboarding/useBranches', () => ({
  useBranchesQuery: () => ({
    data: [{ id: 'b-gla', slug: 'glasgow', name: 'AGBC Glasgow', order: 1 }],
    isError: false,
  }),
}));

function testimony(o: Partial<TestimonyFeedItem> = {}): TestimonyFeedItem {
  return {
    id: 'x1',
    branch_id: 'b-gla',
    body: 'God provided a job after months of waiting.',
    language: 'en',
    category_key: null,
    image_path: null,
    glory_count: 32,
    created_at: '2026-07-24T10:00:00Z',
    author_id: 'a1',
    author_name: 'Ayo Samuel',
    author_avatar_url: null,
    from_prayer_id: null,
    origin_prayer_id: null,
    reacted_by_me: false,
    is_mine: false,
    ...o,
  };
}

function prayer(o: Partial<PrayerFeedItem> = {}): PrayerFeedItem {
  return {
    id: 'x1',
    branch_id: 'b-gla',
    body: "Please pray for my mother's recovery.",
    language: 'en',
    is_anonymous: false,
    answered_at: null,
    praying_count: 24,
    prayed_count: 9,
    created_at: '2026-07-24T10:00:00Z',
    author_id: 'a2',
    author_name: 'Daniel Kern',
    author_avatar_url: null,
    answer_testimony_id: null,
    my_answer_testimony_status: null,
    my_intercession_state: null,
    is_mine: false,
    ...o,
  };
}

// Both detail headers carry the `...` menu since W2.6, which reaches for the toast and
// for react-query's cache to do its work. Both are real here rather than stubbed: the
// screens' claim is that they use those libraries correctly.
function renderScreen(ui: React.ReactElement) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ThemeScope name="light">
        <ToastProvider>{ui}</ToastProvider>
      </ThemeScope>
    </QueryClientProvider>,
  );
}

/** Press the LAST element carrying this text. Used where a sheet's confirm button repeats
 * the words of the control that opened it, which is the frame's own wording. */
async function pressLast(text: string) {
  const matches = screen.getAllByText(text);
  await fireEvent.press(matches[matches.length - 1]);
}

beforeAll(async () => {
  await i18n.changeLanguage('en');
});
beforeEach(() => {
  jest.clearAllMocks();
  mockUpdate.mockResolvedValue({ error: null });
  mockTestimony.mockReturnValue({
    data: testimony(),
    isError: false,
    refetch: jest.fn(),
  });
  mockPrayer.mockReturnValue({
    data: prayer(),
    isError: false,
    refetch: jest.fn(),
  });
});

describe('TESTIMONY-DETAIL (mockup frame)', () => {
  test('renders the quote body, author, Glory count and WhatsApp share', async () => {
    await renderScreen(<TestimonyDetail />);
    expect(screen.getByText(/God provided a job/)).toBeTruthy();
    expect(screen.getByText('Ayo Samuel')).toBeTruthy();
    expect(screen.getByText('Glory to God · 32')).toBeTruthy();
    expect(screen.getByText('Share to WhatsApp')).toBeTruthy();
  });

  test('the Glory pill gates for guests', async () => {
    await renderScreen(<TestimonyDetail />);
    await fireEvent.press(screen.getByText('Glory to God · 32'));
    expect(screen.getByText('Sign in to say Glory to God')).toBeTruthy();
  });

  test('Share to WhatsApp shares (no gate) since sharing is outbound', async () => {
    await renderScreen(<TestimonyDetail />);
    await fireEvent.press(screen.getByText('Share to WhatsApp'));
    expect(mockShareToWhatsApp).toHaveBeenCalledWith('share-text');
    expect(screen.queryByText('Sign in to say Glory to God')).toBeNull();
  });

  test('the ribbon links when the origin prayer is still public', async () => {
    mockTestimony.mockReturnValue({
      data: testimony({ from_prayer_id: 'p9', origin_prayer_id: 'p9' }),
      isError: false,
      refetch: jest.fn(),
    });
    await renderScreen(<TestimonyDetail />);
    await fireEvent.press(screen.getByText('Born from an answered prayer'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/prayer/[id]',
      params: { id: 'p9' },
    });
  });

  test('the ribbon is a static label when the origin prayer is gone', async () => {
    mockTestimony.mockReturnValue({
      data: testimony({ from_prayer_id: 'p9', origin_prayer_id: null }),
      isError: false,
      refetch: jest.fn(),
    });
    await renderScreen(<TestimonyDetail />);
    // The label is present but is NOT a link (docs/spec/09 degradation rule).
    expect(screen.getByText('Born from an answered prayer')).toBeTruthy();
    expect(
      screen.queryByRole('link', { name: 'Born from an answered prayer' }),
    ).toBeNull();
  });

  test('a withdrawn testimony shows the gone state, not an error', async () => {
    mockTestimony.mockReturnValue({
      data: null,
      isError: false,
      refetch: jest.fn(),
    });
    await renderScreen(<TestimonyDetail />);
    expect(screen.getByText('This is no longer available')).toBeTruthy();
  });
});

describe('PRAYER-DETAIL (mockup frame)', () => {
  test('renders the request card with body and both counts', async () => {
    await renderScreen(<PrayerDetail />);
    expect(screen.getByText(/mother's recovery/)).toBeTruthy();
    expect(screen.getByText('24 praying')).toBeTruthy();
    expect(screen.getByText('9 prayed')).toBeTruthy();
  });

  test('"I will pray" gates, and the reminder explainer is shown', async () => {
    await renderScreen(<PrayerDetail />);
    expect(screen.getByText(/We'll gently remind you/)).toBeTruthy();
    await fireEvent.press(screen.getByText('I will pray'));
    expect(screen.getByText('Sign in to pray with them')).toBeTruthy();
  });

  test('Share shares (no gate)', async () => {
    await renderScreen(<PrayerDetail />);
    await fireEvent.press(screen.getByText('Share'));
    expect(mockShareText).toHaveBeenCalledWith('share-text');
  });

  test('an answered request shows the tag and links to its testimony', async () => {
    mockPrayer.mockReturnValue({
      data: prayer({
        answered_at: '2026-07-23T10:00:00Z',
        answer_testimony_id: 't7',
        my_answer_testimony_status: null,
      }),
      isError: false,
      refetch: jest.fn(),
    });
    await renderScreen(<PrayerDetail />);
    expect(screen.getByText('ANSWERED')).toBeTruthy();
    await fireEvent.press(screen.getByText('Read how God answered'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/testimony/[id]',
      params: { id: 't7' },
    });
  });
});

// W2.5 · the loop, on the author's own request. Each state is what the ROW says, and the
// column that decides is `my_answer_testimony_status`: it reports a linked testimony in
// any state, while `answer_testimony_id` waits for a leader.
describe('PRAYER-DETAIL · own request (the loop)', () => {
  const mine = (o: Partial<PrayerFeedItem> = {}) =>
    prayer({ is_mine: true, author_id: 'me', author_name: 'You', ...o });

  function showPrayer(row: PrayerFeedItem) {
    mockPrayer.mockReturnValue({
      data: row,
      isError: false,
      refetch: jest.fn(),
    });
  }

  test('offers the loop, not the commitment', async () => {
    showPrayer(mine());
    await renderScreen(<PrayerDetail />);

    expect(screen.getByText('Mark as answered')).toBeTruthy();
    expect(screen.getByText('Share')).toBeTruthy();
    // You do not commit to pray for yourself, and Edit lives in the `...` menu (W2.6).
    expect(screen.queryByText('I will pray')).toBeNull();
    expect(screen.queryByText('Edit request')).toBeNull();
  });

  test('marking answered writes the timestamp and celebrates, then opens the linked composer', async () => {
    showPrayer(mine());
    await renderScreen(<PrayerDetail />);
    await fireEvent.press(screen.getByText('Mark as answered'));

    // A real timestamp, not just any truthy value: `answered_at` is what the ANSWERED tag
    // and the feed's ordering read.
    const payload = mockUpdate.mock.calls[0][0] as { answered_at: unknown };
    expect(typeof payload.answered_at).toBe('string');
    expect(Date.parse(String(payload.answered_at))).not.toBeNaN();
    // MARK-ANSWERED, the loop's celebration (docs/spec/09).
    expect(await screen.findByText('Answered! Glory to God')).toBeTruthy();

    await fireEvent.press(screen.getByText('Write a testimony'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/testimony/compose',
      params: { fromPrayer: 'x1' },
    });
  });

  test('answered with no testimony keeps the invitation open, and the undo works', async () => {
    showPrayer(mine({ answered_at: '2026-07-23T10:00:00Z' }));
    await renderScreen(<PrayerDetail />);

    expect(screen.getByText('Write a testimony')).toBeTruthy();

    await fireEvent.press(screen.getByText('Mark as not answered'));
    expect(screen.getByText('Mark as not answered?')).toBeTruthy();

    // The sheet's own button, not the link that opened it: the frame gives both the
    // same words, so they are told apart by which came last.
    await pressLast('Mark as not answered');
    expect(mockUpdate).toHaveBeenCalledWith({ answered_at: null });
  });

  test('a testimony still in the queue replaces the offer and explains the refusal', async () => {
    showPrayer(
      mine({
        answered_at: '2026-07-23T10:00:00Z',
        // Not approved, so the public reverse link is still empty...
        answer_testimony_id: null,
        // ...but the guard counts it, so the screen must too.
        my_answer_testimony_status: 'pending',
      }),
    );
    await renderScreen(<PrayerDetail />);

    // Offering it again would be a unique-constraint violation on from_prayer_id.
    expect(screen.queryByText('Write a testimony')).toBeNull();
    expect(screen.getByText(/Your testimony is with a leader/)).toBeTruthy();

    // docs/spec/09: "the confirm sheet says so". It explains rather than acting.
    await fireEvent.press(screen.getByText('Mark as not answered'));
    expect(screen.getByText('Your testimony is linked to this')).toBeTruthy();
    expect(screen.queryByText('Mark as not answered?')).toBeNull();

    await fireEvent.press(screen.getByText('Go to My posts'));
    expect(mockPush).toHaveBeenCalledWith('/my-posts');
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test('a rejected testimony says so rather than borrowing the queue copy', async () => {
    showPrayer(
      mine({
        answered_at: '2026-07-23T10:00:00Z',
        my_answer_testimony_status: 'rejected',
      }),
    );
    await renderScreen(<PrayerDetail />);
    expect(screen.getByText(/needs a change/)).toBeTruthy();
    expect(screen.queryByText(/with a leader/)).toBeNull();
  });

  test('once the testimony is approved the request links to it and asks for nothing more', async () => {
    showPrayer(
      mine({
        answered_at: '2026-07-23T10:00:00Z',
        answer_testimony_id: 't7',
        my_answer_testimony_status: 'approved',
      }),
    );
    await renderScreen(<PrayerDetail />);

    expect(screen.getByText('Read how God answered')).toBeTruthy();
    expect(screen.queryByText('Write a testimony')).toBeNull();
    expect(screen.queryByText(/with a leader/)).toBeNull();
  });
});
