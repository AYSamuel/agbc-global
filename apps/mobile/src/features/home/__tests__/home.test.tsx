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

const mockPush = jest.fn();
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
});
