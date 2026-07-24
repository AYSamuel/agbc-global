import { fireEvent, render, screen } from '@testing-library/react-native';

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
    image_url: null,
    glory_count: 32,
    created_at: '2026-07-24T10:00:00Z',
    author_id: 'a1',
    author_name: 'Ayo Samuel',
    author_avatar_url: null,
    from_prayer_id: null,
    origin_prayer_id: null,
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
    ...o,
  };
}

function renderScreen(ui: React.ReactElement) {
  return render(<ThemeScope name="light">{ui}</ThemeScope>);
}

beforeAll(async () => {
  await i18n.changeLanguage('en');
});
beforeEach(() => {
  jest.clearAllMocks();
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
