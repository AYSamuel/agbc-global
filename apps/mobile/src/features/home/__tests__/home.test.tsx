import { fireEvent, render, screen } from '@testing-library/react-native';

import '@/i18n';
import { ToastProvider } from '@/components/ui';
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
// The auth store subscribes at module scope, and the Glory hook pulls it in
// through TestimonyCard (W2.4).
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => undefined } },
      }),
    },
  },
}));

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

const mockSermons = jest.fn<
  { data: unknown; isError: boolean; refetch: () => void },
  []
>();
jest.mock('@/features/watch/queries', () => ({
  useSermonsQuery: () => mockSermons(),
}));

// This suite is the GUEST composition; the member's rhythm read belongs to
// memberHome.test.tsx, and a guest never issues it (docs/spec/07).
jest.mock('@/features/rhythm/queries', () => ({
  useRhythmQuery: () => ({
    data: undefined,
    isError: false,
    refetch: jest.fn(),
  }),
}));

jest.mock('@/features/notifications/nc', () => ({
  useUnreadCount: () => ({ data: 0 }),
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

// W2.7: Home carries the quiet line while a branch request is open, and the welcome once
// one is approved. These compositions are about neither, so the member has no requests.
jest.mock('@/features/branch-change/queries', () => ({
  useMyBranchRequests: () => ({
    data: { pending: null, lastApproved: null, lastRejected: null },
    isPending: false,
  }),
}));

// W3.5 slice 5c: Home asks two closure questions, and they are not the same one. The member's
// own branch drives the prompt and the card (their tests live in `features/rehome`); the
// BROWSED branch decides whether there is a service to show at all, which is this file's.
const mockBrowsedClosed = jest.fn<{ closed: boolean }, []>();
jest.mock('@/features/rehome/queries', () => ({
  useBranchHasClosed: () => ({ closed: false, branch: null }),
  useBranchClosed: () => mockBrowsedClosed(),
}));

function renderHome() {
  return render(
    <ThemeScope name="light">
      <ToastProvider>
        <Home />
      </ToastProvider>
    </ThemeScope>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  // Open unless a test says otherwise, which is every test but one.
  mockBrowsedClosed.mockReturnValue({ closed: false });
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
  // Default: no sermons synced yet, so the latest-message block stays hidden
  // (docs/spec/07 states). Tests that need the block set their own row.
  mockSermons.mockReturnValue({ data: [], isError: false, refetch: jest.fn() });
});

const sermonRow = {
  id: 'aaa',
  title: 'Grace That Carries You',
  speaker: 'Rev Olayinka Ademiluka',
  youtube_id: 'yt-1',
  audio_path: null,
  artwork_path: null,
  duration_sec: 2280,
  thumbnail_url: '',
  series: null,
  published_at: '2026-07-18T10:00:00Z',
  kind: 'video',
  status: 'available',
};

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

  // The device found this one, and the shape of the bug is why it asserts ABSENCE.
  // `archive_branch()` leaves `branch_services` alone and the services query has no status
  // filter, so a closed branch went on drawing "THIS SUNDAY · 11:00 AM" and a "Plan a visit"
  // that dead-ended, one card below a banner saying the branch had closed.
  //
  // The frame's answer is the whole screen rather than the hero alone: Home IS the branch's
  // front page, so with no branch there is only the ask and the verse. Every line below is
  // something a later change could put back without noticing, which is the point of pinning
  // them together.
  test('a branch that has closed leaves only the card and the verse', async () => {
    mockBrowsedClosed.mockReturnValue({ closed: true });
    await renderHome();

    // The verse stays: it belongs to the whole family, not to any branch.
    expect(
      screen.getByText('“Yahweh is my shepherd: I shall lack nothing.”'),
    ).toBeTruthy();

    // The service card, in all three of its shapes.
    expect(screen.queryByText(/Sunday Service/)).toBeNull();
    expect(screen.queryByText('Service times coming soon')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Plan a visit' })).toBeNull();
    // And everything else the screen would normally carry.
    expect(screen.queryByText('From the family')).toBeNull();
    expect(screen.queryByText('Latest message')).toBeNull();

    // Not a gate: the way out is still on screen, and every tab is untouched.
    expect(screen.getByLabelText(/Current branch/)).toBeTruthy();
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

  // The section order is a decision (docs/spec/07, "Why this order"), not an
  // accident of how the JSX was typed, so it is asserted rather than left to
  // review. Home's only two headers are these sections, and getAllByRole
  // returns them in render order, which is the order a reader scrolls through.
  test('From the family comes before Latest message (docs/spec/07)', async () => {
    mockSermons.mockReturnValue({
      data: [sermonRow],
      isError: false,
      refetch: jest.fn(),
    });
    await renderHome();
    const headers = screen
      .getAllByRole('header')
      .map((node) => node.props.children as string);
    expect(headers).toEqual(['From the family', 'Latest message']);
  });

  // The tile row that used to sit between the service card and the verse was
  // removed on 2026-08-11: every destination it held is reachable without it
  // (Plan a visit on the hero, Watch and Give as tabs, Academy in More), and
  // 07 says not to reintroduce a shortcut grid without a frame.
  test('no quick-actions tile row', async () => {
    await renderHome();
    expect(screen.queryByRole('button', { name: 'Academy' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Visit' })).toBeNull();
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
        image_path: null,
        glory_count: 14,
        created_at: '2026-07-21T10:00:00Z',
        author_id: 'a1',
        author_name: 'Sarah Okafor',
        author_avatar_url: null,
        from_prayer_id: null,
        origin_prayer_id: null,
        reacted_by_me: false,
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
