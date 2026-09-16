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

// The one sender behind CONTACT (W4.18 slice 3). The send itself is mocked, the
// key rule is the real one (`keyFor` from the actual module), and the key it
// mints is handed out here, so a test can say which key a retry must reuse.
const mockSend = jest.fn<Promise<string>, [unknown, string]>(() =>
  Promise.resolve('sent'),
);
let minted = 0;
const mockMint = jest.fn<string, []>(() => `key-${String(++minted)}`);

/* eslint-disable @typescript-eslint/no-unsafe-return --
   documented jest.mock factory shape: requireActual is untyped */
jest.mock('@/lib/contactForm', () => ({
  ...jest.requireActual('@/lib/contactForm'),
  sendContactMessage: (body: unknown, key: string) => mockSend(body, key),
}));
/* eslint-enable @typescript-eslint/no-unsafe-return */
jest.mock('@/lib/contactKey', () => ({
  mintContactKey: () => mockMint(),
}));
// The real `contactForm` module (loaded above for `keyFor`) imports the client,
// which refuses to construct without env; nothing here ever calls it.
jest.mock('@/lib/supabase', () => ({
  supabase: { functions: { invoke: jest.fn() } },
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
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('an unanswered send says so, keeps the draft, and never claims "offline" (docs/spec/04)', async () => {
    // W4.18 slice 3. The answer not arriving is not the same as the email not going:
    // on 2026-09-16 one message typed once reached the inbox twice because the app
    // called the first attempt "offline" and the member did the only sensible thing.
    mockSend.mockResolvedValue('unconfirmed');
    await renderUi(<Contact />);
    await fillValidForm();
    await fireEvent.press(screen.getByText('Send message'));
    await waitFor(() => {
      expect(
        screen.getByText(/We couldn't confirm your message was sent/),
      ).toBeTruthy();
    });
    expect(screen.queryByText(/You're offline/)).toBeNull();
    // The draft survives the failure, ready to retry.
    expect(screen.getByDisplayValue('Ada')).toBeTruthy();
    expect(screen.getByDisplayValue('Planning a visit.')).toBeTruthy();
  });

  it('a refusal the function made is a failure, with the draft kept', async () => {
    mockSend.mockResolvedValue('failed');
    await renderUi(<Contact />);
    await fillValidForm();
    await fireEvent.press(screen.getByText('Send message'));
    await waitFor(() => {
      expect(
        screen.getByText(/Your message didn't send\. Your draft is safe here/),
      ).toBeTruthy();
    });
    expect(screen.getByDisplayValue('Planning a visit.')).toBeTruthy();
  });

  it('the same words retry under the same key, so a retry cannot arrive twice', async () => {
    mockSend.mockResolvedValueOnce('unconfirmed').mockResolvedValueOnce('sent');
    await renderUi(<Contact />);
    await fillValidForm();
    await fireEvent.press(screen.getByText('Send message'));
    await screen.findByText(/We couldn't confirm your message was sent/);
    await fireEvent.press(screen.getByText('Send message'));
    await waitFor(() => {
      expect(screen.getByText('Message sent')).toBeTruthy();
    });

    expect(mockSend).toHaveBeenCalledTimes(2);
    const [, firstKey] = mockSend.mock.calls[0];
    const [, secondKey] = mockSend.mock.calls[1];
    expect(secondKey).toBe(firstKey);
  });

  it('changed words mint a new key, so a rephrased message is never swallowed', async () => {
    mockSend.mockResolvedValueOnce('unconfirmed').mockResolvedValueOnce('sent');
    await renderUi(<Contact />);
    await fillValidForm();
    await fireEvent.press(screen.getByText('Send message'));
    await screen.findByText(/We couldn't confirm your message was sent/);
    await fireEvent.changeText(
      screen.getByLabelText('Message'),
      'Planning a visit, and bringing my family.',
    );
    await fireEvent.press(screen.getByText('Send message'));
    await waitFor(() => {
      expect(screen.getByText('Message sent')).toBeTruthy();
    });

    const [, firstKey] = mockSend.mock.calls[0];
    const [, secondKey] = mockSend.mock.calls[1];
    expect(secondKey).not.toBe(firstKey);
  });

  it('success clears into the sent state', async () => {
    mockSend.mockResolvedValue('sent');
    await renderUi(<Contact />);
    await fillValidForm();
    await fireEvent.press(screen.getByText('Send message'));
    await waitFor(() => {
      expect(screen.getByText('Message sent')).toBeTruthy();
    });
  });
});
