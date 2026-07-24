import { fireEvent, render, screen } from '@testing-library/react-native';

import '@/i18n';
import { useBranchStore } from '@/state/branch';
import { ThemeScope } from '@/theme';

import { localDateKey } from '../queries';

import Home from '../../../../app/(tabs)/home';

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access --
   documented jest.mock factory shapes */
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access */

const mockPush = jest.fn<undefined, [unknown]>();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

jest.mock('expo-localization', () => ({
  getLocales: jest.fn(() => [{ languageCode: 'en' }]),
}));

// The queries module is partially mocked via requireActual, which pulls in the
// real client; it needs env that tests do not carry.
jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const mockVerse = jest.fn<
  { data: unknown; isError: boolean; refetch: () => void },
  []
>();
const mockServices = jest.fn<
  { data: unknown; isError: boolean; refetch: () => void },
  []
>();
const mockLatestTestimony = jest.fn<{ data: unknown; isError: boolean }, []>();
jest.mock('../queries', () => {
  const actual = jest.requireActual<typeof import('../queries')>('../queries');
  return {
    ...actual,
    useDailyVerseQuery: () => mockVerse(),
    useBranchServicesQuery: () => mockServices(),
  };
});

jest.mock('@/features/watch/queries', () => ({
  useSermonsQuery: () => ({ data: [], isError: false, refetch: jest.fn() }),
}));

// The "From the family" highlight reads the Family domain's latest-testimony
// query; mock it (and keep prefetchHome's options import resolvable).
jest.mock('@/features/family/queries', () => ({
  useLatestTestimonyQuery: () => mockLatestTestimony(),
  latestTestimonyQueryOptions: () => ({
    queryKey: ['family', 'latest-testimony'],
    queryFn: () => Promise.resolve(null),
  }),
}));

jest.mock('@/features/onboarding/useBranches', () => ({
  useBranchesQuery: () => ({ data: undefined, isError: true }),
}));

function renderHome() {
  return render(
    <ThemeScope name="light">
      <Home />
    </ThemeScope>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  useBranchStore.setState({
    branch: {
      id: '00000000-0000-4000-8000-000000000001',
      slug: 'glasgow',
      name: 'AGBC Glasgow',
      timezone: 'Europe/London',
    },
  });
  mockVerse.mockReturnValue({
    data: {
      date: '2026-07-20',
      reference: 'Psalm 23:1',
      text: 'Yahweh is my shepherd: I shall lack nothing.',
      translation: 'WEB',
    },
    isError: false,
    refetch: jest.fn(),
  });
  mockServices.mockReturnValue({
    data: [
      {
        weekday: 0,
        start_time: '12:00:00',
        duration_min: 120,
        kind: 'sunday',
        label: '',
      },
    ],
    isError: false,
    refetch: jest.fn(),
  });
  // Default: the family has posted nothing, so the highlight shows its fallback.
  mockLatestTestimony.mockReturnValue({ data: null, isError: false });
});

describe('localDateKey', () => {
  test('keys on the device-local date, not UTC (docs/spec/07 rollover)', () => {
    // 23:30 local on the 20th stays the 20th even though UTC has rolled over.
    const local = new Date(2026, 6, 20, 23, 30);
    expect(localDateKey(local)).toBe('2026-07-20');
  });
});

describe('HOME composition (docs/spec/07)', () => {
  test('renders the verse card with reference and translation', async () => {
    await renderHome();
    expect(
      screen.getByText('“Yahweh is my shepherd: I shall lack nothing.”'),
    ).toBeOnTheScreen();
    expect(screen.getByText('Psalm 23:1 · WEB')).toBeOnTheScreen();
  });

  test('the verse card carries no devotional CTA before Phase 4 (07 phasing)', async () => {
    await renderHome();
    expect(screen.queryByText(/devotional/i)).toBeNull();
  });

  test('the next-service card shows the computed service', async () => {
    await renderHome();
    expect(screen.getByText(/Sunday Service/)).toBeOnTheScreen();
  });

  test('zero branch_services rows falls back, never a broken card', async () => {
    mockServices.mockReturnValue({
      data: [],
      isError: false,
      refetch: jest.fn(),
    });
    await renderHome();
    expect(screen.getByText('Service times coming soon')).toBeOnTheScreen();
  });

  test('loading shows skeletons instead of an empty screen', async () => {
    mockServices.mockReturnValue({
      data: undefined,
      isError: false,
      refetch: jest.fn(),
    });
    mockVerse.mockReturnValue({
      data: undefined,
      isError: false,
      refetch: jest.fn(),
    });
    await renderHome();
    expect(
      screen.getAllByTestId('skeleton', { includeHiddenElements: true }).length,
    ).toBeGreaterThan(0);
  });

  test('a missing verse hides the card without breaking Home', async () => {
    mockVerse.mockReturnValue({
      data: null,
      isError: false,
      refetch: jest.fn(),
    });
    await renderHome();
    expect(screen.queryByText('Verse of the day')).toBeNull();
    expect(screen.getByText(/Sunday Service/)).toBeOnTheScreen();
  });

  test('quick actions route to their tabs', async () => {
    await renderHome();
    await fireEvent.press(screen.getByRole('button', { name: 'Give' }));
    expect(mockPush).toHaveBeenCalledWith('/give');
    await fireEvent.press(screen.getByRole('button', { name: 'Academy' }));
    expect(mockPush).toHaveBeenCalledWith('/academy');
  });

  test('the guest Join card is present; no member rhythm strip', async () => {
    await renderHome();
    expect(screen.getByText('Join the family')).toBeOnTheScreen();
  });

  test('the branch chip opens the switcher (browsing context, docs/spec/07)', async () => {
    await renderHome();
    await fireEvent.press(
      screen.getByRole('button', {
        name: 'Current branch AGBC Glasgow, change branch',
      }),
    );
    expect(
      screen.getByRole('header', { name: 'Switch branch' }),
    ).toBeOnTheScreen();
  });

  test('From the family shows the latest testimony and taps through (W1.5 wiring)', async () => {
    mockLatestTestimony.mockReturnValue({
      data: {
        id: 'th1',
        branch_id: '00000000-0000-4000-8000-000000000001',
        body: 'God provided a job after months of waiting.',
        language: 'en',
        category_key: null,
        image_url: null,
        glory_count: 14,
        created_at: '2026-07-21T10:00:00Z',
        author_id: 'a1',
        author_name: 'Sarah Okafor',
        author_avatar_url: null,
        from_prayer_id: null,
        origin_prayer_id: null,
      },
      isError: false,
    });
    await renderHome();
    expect(screen.getByText(/God provided a job/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByText(/God provided a job/));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/testimony/[id]',
      params: { id: 'th1' },
    });
  });

  test('From the family falls back gently when nothing is posted', async () => {
    // mockLatestTestimony defaults to { data: null }.
    await renderHome();
    expect(screen.getByText('Testimonies are coming')).toBeOnTheScreen();
  });

  test('From the family "See all" targets the Testimonies sub-tab', async () => {
    await renderHome();
    await fireEvent.press(
      screen.getByRole('link', { name: 'See all: From the family' }),
    );
    const arg = mockPush.mock.calls.at(-1)?.[0] as {
      pathname?: string;
      params?: { tab?: string };
    };
    expect(arg.pathname).toBe('/family');
    expect(arg.params?.tab).toBe('testimonies');
  });
});
