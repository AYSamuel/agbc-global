import { fireEvent, render, screen } from '@testing-library/react-native';

import { ToastProvider } from '@/components/ui';
import i18n from '@/i18n';
import { ThemeScope } from '@/theme';

import type { EventDetail, EventListItem } from '../queries';

import EventDetailScreen from '../../../../app/event/[id]';
import Events from '../../../../app/events';

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
}));

type QueryResult<T> = {
  data: T | undefined;
  isError: boolean;
  isRefetching?: boolean;
  refetch: () => void;
};
const mockList = jest.fn<QueryResult<EventListItem[]>, []>();
const mockDetail = jest.fn<QueryResult<EventDetail | null>, []>();
jest.mock('../queries', () => ({
  useEventsQuery: () => mockList(),
  useEventDetailQuery: () => mockDetail(),
}));

jest.mock('@/features/onboarding/useBranches', () => ({
  useBranchesQuery: () => ({
    data: [
      {
        id: 'b-ber',
        slug: 'berlin',
        name: 'AGBC Lighthouse Berlin',
        city: 'Berlin',
        country: 'Germany',
        lat: 52.55,
        lng: 13.36,
        order: 2,
      },
    ],
    isError: false,
  }),
}));

jest.mock('@/state/branch', () => ({
  useBranchStore: (selector: (s: unknown) => unknown) =>
    selector({ branch: { id: 'b-ber', name: 'AGBC Lighthouse Berlin' } }),
}));

// Far-future / far-past fixtures keep the upcoming/past split stable without
// faking timers across Intl (which fake clocks do not reach).
const FUTURE = '2096-08-24T19:00:00';
const PAST = '2020-08-24T19:00:00';

function event(overrides: Partial<EventListItem> = {}): EventListItem {
  return {
    id: 'e1',
    branch_id: 'b-ber',
    title: 'Night of Worship',
    starts_at_local: FUTURE,
    timezone: 'Europe/Berlin',
    location: 'Prinzenstr. 84',
    image_url: null,
    status: 'scheduled',
    rsvp_enabled: true,
    ...overrides,
  };
}

function detail(overrides: Partial<EventDetail> = {}): EventDetail {
  return {
    ...event(),
    description: 'An evening of worship and prayer.',
    ends_at_local: null,
    ...overrides,
  };
}

function renderUi(ui: React.ReactElement) {
  return render(
    <ThemeScope name="light">
      <ToastProvider>{ui}</ToastProvider>
    </ThemeScope>,
  );
}

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

beforeEach(() => {
  jest.clearAllMocks();
  mockList.mockReturnValue({ data: [], isError: false, refetch: jest.fn() });
  mockDetail.mockReturnValue({
    data: null,
    isError: false,
    refetch: jest.fn(),
  });
});

describe('EVENTS list: the four states', () => {
  it('shows skeletons while loading (no dead actions under them)', async () => {
    mockList.mockReturnValue({
      data: undefined,
      isError: false,
      refetch: jest.fn(),
    });
    await renderUi(<Events />);
    expect(screen.queryByText('Night of Worship')).toBeNull();
  });

  it('shows the empty state copy from docs/spec/11', async () => {
    await renderUi(<Events />);
    expect(screen.getByText('No events scheduled yet')).toBeTruthy();
    expect(screen.getByText('Check back soon.')).toBeTruthy();
  });

  it('shows error + retry when nothing is cached', async () => {
    const refetch = jest.fn();
    mockList.mockReturnValue({ data: undefined, isError: true, refetch });
    await renderUi(<Events />);
    await fireEvent.press(screen.getByText('Try again'));
    expect(refetch).toHaveBeenCalled();
  });

  it('keeps rendering cached rows when a refetch fails (offline)', async () => {
    mockList.mockReturnValue({
      data: [event()],
      isError: true,
      refetch: jest.fn(),
    });
    await renderUi(<Events />);
    expect(screen.getByText('Night of Worship')).toBeTruthy();
  });
});

describe('EVENTS list: scoping and rows', () => {
  it('tags branch and ministry-wide rows apart and routes to detail', async () => {
    mockList.mockReturnValue({
      data: [
        event(),
        event({ id: 'e2', branch_id: null, title: 'Global Family Sunday' }),
      ],
      isError: false,
      refetch: jest.fn(),
    });
    await renderUi(<Events />);
    expect(screen.getByText('Branch')).toBeTruthy();
    expect(screen.getByText('All nations')).toBeTruthy();
    // Branch rows carry the branch city (docs/spec/11 list line).
    expect(screen.getByText(/Berlin/)).toBeTruthy();

    await fireEvent.press(screen.getByText('Night of Worship'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/event/[id]',
      params: { id: 'e1' },
    });
  });

  it('moves started events under Past', async () => {
    mockList.mockReturnValue({
      data: [
        event({ id: 'e3', title: 'Night of Prayer', starts_at_local: PAST }),
      ],
      isError: false,
      refetch: jest.fn(),
    });
    await renderUi(<Events />);
    expect(screen.queryByText('Night of Prayer')).toBeNull();
    await fireEvent.press(screen.getByText('Past'));
    expect(screen.getByText('Night of Prayer')).toBeTruthy();
  });
});

describe('EVENT-DETAIL states', () => {
  beforeEach(() => {
    mockParams.mockReturnValue({ id: 'e1' });
  });

  it('gates RSVP for a guest and routes to auth', async () => {
    mockDetail.mockReturnValue({
      data: detail(),
      isError: false,
      refetch: jest.fn(),
    });
    await renderUi(<EventDetailScreen />);
    await fireEvent.press(screen.getByText("RSVP · I'm going"));
    // The gate sheet opens instead of a write (docs/spec/11 guest rule).
    expect(screen.getByText('Save your spot')).toBeTruthy();
    await fireEvent.press(screen.getByText('Sign in'));
    expect(mockPush).toHaveBeenCalledWith('/auth');
  });

  it('shows the cancelled treatment: banner, no RSVP, onward CTA', async () => {
    mockDetail.mockReturnValue({
      data: detail({ status: 'cancelled' }),
      isError: false,
      refetch: jest.fn(),
    });
    await renderUi(<EventDetailScreen />);
    expect(screen.getByText('Cancelled by the organiser')).toBeTruthy();
    expect(screen.queryByText("RSVP · I'm going")).toBeNull();
    expect(screen.getByText('See other events')).toBeTruthy();
  });

  it('disables RSVP honestly for past events', async () => {
    mockDetail.mockReturnValue({
      data: detail({ starts_at_local: PAST }),
      isError: false,
      refetch: jest.fn(),
    });
    await renderUi(<EventDetailScreen />);
    expect(screen.queryByText("RSVP · I'm going")).toBeNull();
    expect(
      screen.getByText('This event has already taken place.'),
    ).toBeTruthy();
  });

  it('shows the ministry-wide treatment with the viewer-local line', async () => {
    mockDetail.mockReturnValue({
      data: detail({ branch_id: null }),
      isError: false,
      refetch: jest.fn(),
    });
    await renderUi(<EventDetailScreen />);
    expect(screen.getByText(/the whole family/)).toBeTruthy();
    expect(screen.getByText(/your time/)).toBeTruthy();
  });

  it('lands a dead deep link on honest copy, never a 404', async () => {
    mockDetail.mockReturnValue({
      data: null,
      isError: false,
      refetch: jest.fn(),
    });
    await renderUi(<EventDetailScreen />);
    expect(screen.getByText("This event isn't available")).toBeTruthy();
    expect(screen.getByText('See other events')).toBeTruthy();
  });
});
