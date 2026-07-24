import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';

import { ToastProvider } from '@/components/ui';
import i18n from '@/i18n';
import { ThemeScope } from '@/theme';

import type { BranchContact } from '../queries';

import Branches from '../../../../app/branches';
import Contact from '../../../../app/contact';

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
  useLocalSearchParams: () => ({}),
}));

const BRANCH_FIXTURES = [
  {
    id: 'b-gla',
    slug: 'glasgow',
    name: 'AGBC Glasgow',
    city: 'Glasgow',
    country: 'Scotland, UK',
    is_hq: true,
    youtube_channel_id: null,
    timezone: 'Europe/London',
    address: null,
    lat: 55.86,
    lng: -4.02,
    order: 1,
  },
  {
    id: 'b-ber',
    slug: 'berlin',
    name: 'AGBC Lighthouse Berlin',
    city: 'Berlin',
    country: 'Germany',
    is_hq: false,
    youtube_channel_id: null,
    timezone: 'Europe/Berlin',
    address: null,
    lat: 52.55,
    lng: 13.36,
    order: 2,
  },
];

type BranchesResult = {
  data: typeof BRANCH_FIXTURES | undefined;
  isError: boolean;
};
const mockBranches = jest.fn<BranchesResult, []>(() => ({
  data: BRANCH_FIXTURES,
  isError: false,
}));
jest.mock('@/features/onboarding/useBranches', () => ({
  useBranchesQuery: () => mockBranches(),
}));

type ContactsResult = {
  data: BranchContact[] | undefined;
  isError: boolean;
};
const mockContacts = jest.fn<ContactsResult, []>(() => ({
  data: [],
  isError: false,
}));
jest.mock('../queries', () => {
  const actual = jest.requireActual<typeof import('../queries')>('../queries');
  return {
    ...actual,
    useBranchContactsQuery: () => mockContacts(),
    useBranchDetailQuery: jest.fn(),
  };
});

const mockInvoke = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => mockInvoke(...args) as unknown,
    },
  },
}));

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
  mockBranches.mockReturnValue({ data: BRANCH_FIXTURES, isError: false });
  mockContacts.mockReturnValue({ data: [], isError: false });
});

describe('BRANCHES list', () => {
  it('renders every branch with the count line and HQ badge', async () => {
    await renderUi(<Branches />);
    expect(screen.getByText('2 branches · 2 nations')).toBeTruthy();
    expect(screen.getByText('AGBC Glasgow')).toBeTruthy();
    expect(screen.getByText('HQ')).toBeTruthy();
  });

  it('search filters by city and clears to no-results copy honestly', async () => {
    await renderUi(<Branches />);
    const input = screen.getByPlaceholderText('Search branches or cities');
    await fireEvent.changeText(input, 'berl');
    expect(screen.queryByText('AGBC Glasgow')).toBeNull();
    expect(screen.getByText('AGBC Lighthouse Berlin')).toBeTruthy();
    await fireEvent.changeText(input, 'zzz');
    expect(screen.getByText('No branches found')).toBeTruthy();
  });

  it('routes a row to BRANCH-INFO', async () => {
    await renderUi(<Branches />);
    await fireEvent.press(screen.getByText('AGBC Lighthouse Berlin'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/branch/[id]',
      params: { id: 'b-ber' },
    });
  });

  it('falls back to the bundled snapshot offline, with the saved-list note', async () => {
    mockBranches.mockReturnValue({ data: undefined, isError: true });
    await renderUi(<Branches />);
    expect(
      screen.getByText('Showing saved branches. Connect to refresh.'),
    ).toBeTruthy();
    expect(screen.getByText('AGBC Glasgow')).toBeTruthy();
  });
});

describe('CONTACT form', () => {
  const fillValidForm = async () => {
    await fireEvent.changeText(screen.getByPlaceholderText('Full name'), 'Ada');
    await fireEvent.changeText(
      screen.getByPlaceholderText('you@example.com'),
      'ada@example.com',
    );
    await fireEvent.changeText(
      screen.getByPlaceholderText('How can we help?'),
      'Planning a visit.',
    );
  };

  it('validates inline without losing input', async () => {
    await renderUi(<Contact />);
    await fireEvent.changeText(screen.getByPlaceholderText('Full name'), 'Ada');
    await fireEvent.press(screen.getByText('Send message'));
    expect(screen.getByText('Please use a valid email address.')).toBeTruthy();
    expect(screen.getByText('Please write a message.')).toBeTruthy();
    expect(screen.getByDisplayValue('Ada')).toBeTruthy();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('a failed send preserves the draft (docs/spec/04)', async () => {
    // A fetch-level error (no FunctionsHttpError instance) takes the offline
    // branch; the copy differs by cause, the draft guarantee does not.
    mockInvoke.mockResolvedValue({ data: null, error: new Error('boom') });
    await renderUi(<Contact />);
    await fillValidForm();
    await fireEvent.press(screen.getByText('Send message'));
    await waitFor(() => {
      expect(
        screen.getByText(
          "You're offline. Your draft is safe; reconnect to send.",
        ),
      ).toBeTruthy();
    });
    // The draft survives the failure, ready to retry.
    expect(screen.getByDisplayValue('Ada')).toBeTruthy();
    expect(screen.getByDisplayValue('Planning a visit.')).toBeTruthy();
  });

  it('success clears into the sent state', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: true }, error: null });
    await renderUi(<Contact />);
    await fillValidForm();
    await fireEvent.press(screen.getByText('Send message'));
    await waitFor(() => {
      expect(screen.getByText('Message sent')).toBeTruthy();
    });
  });
});
