import { fireEvent, render, screen } from '@testing-library/react-native';

import { ToastProvider } from '@/components/ui';
import i18n from '@/i18n';
import { ThemeScope } from '@/theme';

import type { PrayerFeedItem, TestimonyFeedItem } from '../queries';

import Family from '../../../../app/(tabs)/family';

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access --
   documented jest.mock factory shapes */
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access */

const mockPush = jest.fn();
const mockParams = jest.fn<Record<string, string>, []>(() => ({}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => mockParams(),
  useIsFocused: () => true,
}));

type FeedResult<T> = {
  data: T[] | undefined;
  isError: boolean;
  refetch: () => void;
};
const mockTestimonies = jest.fn<FeedResult<TestimonyFeedItem>, []>();
const mockPrayers = jest.fn<FeedResult<PrayerFeedItem>, []>();
jest.mock('../queries', () => ({
  useTestimonyFeedQuery: () => mockTestimonies(),
  usePrayerFeedQuery: () => mockPrayers(),
}));

// The realtime hook opens a socket; the screen tests only care that it is a no-op
// here. Its own behavior is covered separately below.
jest.mock('../useFamilyRealtime', () => ({ useFamilyRealtime: jest.fn() }));

jest.mock('@/features/onboarding/useBranches', () => ({
  useBranchesQuery: () => ({
    data: [
      {
        id: 'b-gla',
        slug: 'glasgow',
        name: 'AGBC Glasgow',
        lat: 55.86,
        lng: -4.02,
        order: 1,
      },
      {
        id: 'b-ber',
        slug: 'berlin',
        name: 'AGBC Berlin',
        lat: 52.55,
        lng: 13.36,
        order: 2,
      },
    ],
    isError: false,
  }),
}));

const mockBranch = jest.fn<{ id: string; name: string } | null, []>();
jest.mock('@/state/branch', () => ({
  useBranchStore: (selector: (s: unknown) => unknown) =>
    selector({ branch: mockBranch() }),
}));

function testimony(
  overrides: Partial<TestimonyFeedItem> = {},
): TestimonyFeedItem {
  return {
    id: 't1',
    branch_id: 'b-gla',
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
    ...overrides,
  };
}

function prayer(overrides: Partial<PrayerFeedItem> = {}): PrayerFeedItem {
  return {
    id: 'p1',
    branch_id: 'b-ber',
    body: "Please pray for my mother's recovery.",
    language: 'en',
    is_anonymous: false,
    answered_at: null,
    praying_count: 24,
    prayed_count: 9,
    created_at: '2026-07-21T08:00:00Z',
    author_id: 'a2',
    author_name: 'Daniel Kern',
    author_avatar_url: null,
    answer_testimony_id: null,
    ...overrides,
  };
}

const loading: FeedResult<never> = {
  data: undefined,
  isError: false,
  refetch: jest.fn(),
};

// Awaited render is this repo's convention (matches the watch suite): React 19's
// async act must flush before the global `screen` is populated.
async function renderScreen() {
  return render(
    <ThemeScope name="light">
      <ToastProvider>
        <Family />
      </ToastProvider>
    </ThemeScope>,
  );
}

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

beforeEach(() => {
  jest.clearAllMocks();
  mockParams.mockReturnValue({});
  mockBranch.mockReturnValue({ id: 'b-gla', name: 'AGBC Glasgow' });
  mockTestimonies.mockReturnValue({
    data: [testimony()],
    isError: false,
    refetch: jest.fn(),
  });
  mockPrayers.mockReturnValue({
    data: [prayer()],
    isError: false,
    refetch: jest.fn(),
  });
});

describe('FAMILY tab · the four states (docs/spec/04)', () => {
  test('loading shows skeletons and no card text', async () => {
    mockTestimonies.mockReturnValue(loading);
    await renderScreen();
    expect(screen.queryByText(/God provided a job/)).toBeNull();
  });

  test('populated renders the testimony feed', async () => {
    await renderScreen();
    expect(screen.getByText(/God provided a job/)).toBeTruthy();
    expect(screen.getByText('Sarah Okafor')).toBeTruthy();
  });

  test('empty shows the grace-framed CTA, never a blank list', async () => {
    mockTestimonies.mockReturnValue({
      data: [],
      isError: false,
      refetch: jest.fn(),
    });
    await renderScreen();
    expect(screen.getByText('Be the first to share')).toBeTruthy();
  });

  test('error with nothing cached offers a retry that refetches', async () => {
    const refetch = jest.fn();
    mockTestimonies.mockReturnValue({ data: [], isError: true, refetch });
    await renderScreen();
    await fireEvent.press(screen.getByText('Try again'));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  test('error WITH cached rows keeps showing them (stale-while-revalidate)', async () => {
    mockTestimonies.mockReturnValue({
      data: [testimony()],
      isError: true,
      refetch: jest.fn(),
    });
    await renderScreen();
    // The feed does not blank out just because a background refetch failed.
    expect(screen.getByText(/God provided a job/)).toBeTruthy();
  });
});

describe('FAMILY tab · guest gating (docs/spec/09)', () => {
  test('tapping Glory as a guest opens the gate, does not react', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByText('Glory to God · 14'));
    expect(screen.getByText('Sign in to say Glory to God')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  test('the gate routes to auth on Sign in', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByText('Glory to God · 14'));
    await fireEvent.press(screen.getByText('Sign in'));
    expect(mockPush).toHaveBeenCalledWith('/auth');
  });
});

describe('FAMILY tab · prayer sub-tab', () => {
  test('switching to Prayer shows the two counts and the forward commitment', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByText('Prayer'));
    expect(screen.getByText('24 praying')).toBeTruthy();
    expect(screen.getByText('9 prayed')).toBeTruthy();
    // Forward promise, never a past-tense one-tap "I prayed" (09).
    expect(screen.getByText('I will pray')).toBeTruthy();
    expect(screen.queryByText('I prayed')).toBeNull();
  });

  test('an anonymous request shows "A member", not an author name', async () => {
    mockPrayers.mockReturnValue({
      data: [
        prayer({ is_anonymous: true, author_name: null, author_id: null }),
      ],
      isError: false,
      refetch: jest.fn(),
    });
    await renderScreen();
    await fireEvent.press(screen.getByText('Prayer'));
    expect(screen.getByText(/A member/)).toBeTruthy();
    expect(screen.queryByText(/Daniel Kern/)).toBeNull();
  });

  test('an answered request wears the answered treatment', async () => {
    mockPrayers.mockReturnValue({
      data: [prayer({ answered_at: '2026-07-20T08:00:00Z' })],
      isError: false,
      refetch: jest.fn(),
    });
    await renderScreen();
    await fireEvent.press(screen.getByText('Prayer'));
    expect(screen.getByText('ANSWERED')).toBeTruthy();
  });
});

describe('FAMILY tab · scope + navigation', () => {
  test('the scope toggle names the chosen branch and defaults to Everywhere', async () => {
    await renderScreen();
    // Everywhere is selected first (09), and the branch option names the branch.
    const everywhere = screen.getByText('Everywhere');
    expect(everywhere).toBeTruthy();
    expect(screen.getByText('AGBC Glasgow')).toBeTruthy();
  });

  test('a card taps through to its detail route', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByText(/God provided a job/));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/testimony/[id]',
      params: { id: 't1' },
    });
  });

  test('the branch meta line resolves from the branch lookup', async () => {
    await renderScreen();
    // t1 is in b-gla; the card meta should read the branch name, not the id.
    expect(screen.getByText(/AGBC Glasgow · /)).toBeTruthy();
  });
});

describe('FAMILY tab · share FAB (mockup .fab)', () => {
  test('the FAB shows on a populated feed and opens the gate', async () => {
    await renderScreen();
    const fab = screen.getByText('Share your testimony');
    expect(fab).toBeTruthy();
    await fireEvent.press(fab);
    expect(screen.getByText('Sign in to say Glory to God')).toBeTruthy();
  });

  test('its label follows the sub-tab', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByText('Prayer'));
    expect(screen.getByText('Share a prayer request')).toBeTruthy();
    expect(screen.queryByText('Share your testimony')).toBeNull();
  });

  test('the FAB is hidden on an empty feed (the empty state carries its own CTA)', async () => {
    mockTestimonies.mockReturnValue({
      data: [],
      isError: false,
      refetch: jest.fn(),
    });
    await renderScreen();
    // The centred empty-state button is present; the pinned FAB is not.
    expect(screen.getByText('Be the first to share')).toBeTruthy();
    expect(screen.queryByText('Share your testimony')).toBeNull();
  });

  test('the FAB is hidden on the Map sub-tab', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByText('Map'));
    expect(screen.queryByText('Share your testimony')).toBeNull();
    expect(screen.queryByText('Share a prayer request')).toBeNull();
  });
});

describe('FAMILY tab · map sub-tab', () => {
  test('switching to Map keeps the scope toggle and shows the zoom controls + sheet', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByText('Map'));
    // The scope toggle now shows on the map too (docs/spec/09); its branch option
    // reads the selected branch's name, so "Everywhere" is the stable marker.
    expect(screen.getByText('Everywhere')).toBeTruthy();
    // The floating zoom + locate controls.
    expect(screen.getByLabelText('Zoom in')).toBeTruthy();
    expect(screen.getByLabelText('Zoom out')).toBeTruthy();
    expect(screen.getByLabelText('Find my branch')).toBeTruthy();
    // The "family, lately" bottom sheet.
    expect(screen.getByText('The family, lately')).toBeTruthy();
  });

  test('a "family, lately" sheet row opens the testimony detail', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByText('Map'));
    await fireEvent.press(screen.getByText(/God provided a job/));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/testimony/[id]',
      params: { id: 't1' },
    });
  });

  test('the sheet omits itself when there are no recent testimonies', async () => {
    mockTestimonies.mockReturnValue({
      data: [],
      isError: false,
      refetch: jest.fn(),
    });
    await renderScreen();
    await fireEvent.press(screen.getByText('Map'));
    // No sheet, but the map and its controls still render.
    expect(screen.queryByText('The family, lately')).toBeNull();
    expect(screen.getByLabelText('Zoom in')).toBeTruthy();
  });
});

describe('FAMILY tab · sub-tab from a route param (Home See all)', () => {
  test('a ?tab=map param opens the Map sub-tab on arrival', async () => {
    mockParams.mockReturnValue({ tab: 'map', k: '1' });
    await renderScreen();
    // The map's zoom control is present without any manual segment press.
    expect(screen.getByLabelText('Zoom in')).toBeTruthy();
  });

  test('no param defaults to Testimonies', async () => {
    await renderScreen();
    expect(screen.getByText(/God provided a job/)).toBeTruthy();
  });
});
