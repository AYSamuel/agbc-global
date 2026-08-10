import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';

import { ToastProvider } from '@/components/ui';
import '@/i18n';
import { ThemeScope } from '@/theme';

import type { Course, RegistrationRow } from '../queries';

import Academy from '../../../../app/academy';
import CourseDetail from '../../../../app/course/[slug]';

// The ACADEMY and COURSE screens across their states (mockup frames reworked/
// composed 2026-08-10; docs/spec/13, ADR 0017). What is asserted is what each
// state PROMISES: an upcoming course never shows a dead Register, a registered
// member sees their place instead of a second checkout, a guest's tap gates
// rather than the control hiding, and cancelling is a conversation.

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access --
   documented jest.mock factory shapes */
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockParams = jest.fn<Record<string, string>, []>(() => ({}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: mockReplace }),
  useLocalSearchParams: () => mockParams(),
  router: { push: jest.fn(), replace: jest.fn() },
}));

jest.mock('expo-localization', () => ({
  getLocales: jest.fn(() => [{ languageCode: 'en', languageTag: 'en-GB' }]),
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => undefined } },
      }),
    },
  },
}));

type QueryResult<T> = {
  data: T | undefined;
  isError: boolean;
  refetch: () => void;
};
// Every state-bearing mock is re-established in beforeEach: a mockReturnValue
// set inside one test PERSISTS through clearAllMocks, and an Enrolled fixture
// leaking into the open-state tests cost this suite its first red run.
const mockCourses = jest.fn<QueryResult<Course[]>, []>();
const mockFees = jest.fn<QueryResult<unknown[]>, []>();
const mockRegistrations = jest.fn<QueryResult<RegistrationRow[]>, []>();
const mockInterest = jest.fn<QueryResult<string[]>, []>();
const mockInvalidateRegistrations = jest.fn();

jest.mock('../queries', () => {
  const actual = jest.requireActual<typeof import('../queries')>('../queries');
  return {
    ...actual,
    useCoursesQuery: () => mockCourses(),
    useRegionalFeesQuery: () => mockFees(),
    useRegistrationsQuery: () => mockRegistrations(),
    useInterestQuery: () => mockInterest(),
    invalidateRegistrations: (...args: unknown[]) =>
      mockInvalidateRegistrations(...args),
  };
});
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access */

const mockOpenRegistration = jest.fn<
  Promise<'opened' | 'already_registered'>,
  [string, string]
>();
jest.mock('../handoff', () => ({
  openCourseRegistration: (slug: string, language: string) =>
    mockOpenRegistration(slug, language),
}));

const mockToggleMutate = jest.fn();
jest.mock('../interest', () => ({
  useToggleInterest: () => ({ mutate: mockToggleMutate, isPending: false }),
}));

const mockSend = jest.fn<Promise<string>, [unknown]>();
jest.mock('../registrationContact', () => ({
  sendRegistrationMessage: (input: unknown) => mockSend(input),
  registrationMessage: jest.fn(),
}));

interface MockAuthState {
  status: string;
  email: string | null;
  profile: { displayName: string } | null;
}
const mockAuthState = jest.fn<MockAuthState, []>(() => ({
  status: 'guest',
  email: null,
  profile: null,
}));
jest.mock('@/state/auth', () => ({
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector(mockAuthState()),
}));

function course(overrides: Partial<Course> = {}): Course {
  return {
    id: 'c-reset',
    slug: 'grace-reset',
    name: 'Grace Reset',
    level: '01',
    levelName: 'Foundations',
    step: 'Level One · Start here',
    summary: { en: 'Eight classes that ground you in grace.' },
    pathwaySummary: { en: 'Eight classes on the gospel of grace.' },
    outlineTitles: [
      'Forgiveness of sin and righteousness by faith',
      'Eternal salvation and new creation reality',
    ],
    gains: [{ en: 'Settled assurance of forgiveness' }],
    formats: [
      { key: 'intensive', duration: { en: '2 weeks' } },
      { key: 'part_time', duration: { en: '4 weeks' } },
    ],
    prereqSlug: null,
    feeMinor: 2500,
    feeCurrency: 'GBP',
    feeNote: { en: 'workbook included' },
    upcoming: false,
    ...overrides,
  };
}

const masterclass = () =>
  course({
    id: 'c-mc',
    slug: 'grace-masterclass',
    name: 'Grace Masterclass',
    level: '02',
    levelName: 'Deeper training',
    step: 'Level Two · Next step after Grace Reset',
    summary: { en: 'Eleven classes on the hard passages.' },
    pathwaySummary: { en: 'Eleven classes, plus training to teach.' },
    prereqSlug: 'grace-reset',
    feeMinor: 4000,
    formats: [
      { key: 'intensive', duration: { en: '3 weeks' } },
      { key: 'part_time', duration: { en: '6 weeks' } },
    ],
  });

const further = () =>
  course({
    id: 'c-further',
    slug: 'further',
    name: 'Further levels',
    level: '+',
    levelName: 'The journey continues',
    step: '',
    summary: { en: 'The pathway continues into leadership training.' },
    pathwaySummary: null,
    outlineTitles: [],
    gains: [],
    formats: [],
    feeMinor: null,
    feeCurrency: null,
    feeNote: null,
    upcoming: true,
  });

function registration(
  overrides: Partial<RegistrationRow> = {},
): RegistrationRow {
  return {
    id: 'r1-abcdef',
    course: 'grace-reset',
    courseId: 'c-reset',
    format: 'Part-time (4 weeks)',
    branch: null,
    amount: 2500,
    currency: 'gbp',
    status: 'pending',
    createdAt: '2026-08-01T00:00:00Z',
    ...overrides,
  };
}

function renderUi(ui: ReactElement) {
  return render(
    <ThemeScope name="light">
      <ToastProvider>{ui}</ToastProvider>
    </ThemeScope>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCourses.mockReturnValue({
    data: [course(), masterclass(), further()],
    isError: false,
    refetch: jest.fn(),
  });
  mockFees.mockReturnValue({
    data: [
      {
        courseId: 'c-reset',
        countryCode: 'NG',
        feeMinor: 500000,
        currency: 'NGN',
      },
    ],
    isError: false,
    refetch: jest.fn(),
  });
  mockRegistrations.mockReturnValue({
    data: [],
    isError: false,
    refetch: jest.fn(),
  });
  mockInterest.mockReturnValue({
    data: [],
    isError: false,
    refetch: jest.fn(),
  });
  mockAuthState.mockReturnValue({
    status: 'guest',
    email: null,
    profile: null,
  });
  mockParams.mockReturnValue({ slug: 'grace-reset' });
});

describe('ACADEMY · the pathway', () => {
  test('renders the catalog as cards, coming soon included', async () => {
    await renderUi(<Academy />);
    expect(screen.getByText('Grace Reset')).toBeOnTheScreen();
    expect(screen.getByText('Grace Masterclass')).toBeOnTheScreen();
    expect(screen.getByText('Further levels')).toBeOnTheScreen();
    expect(screen.getByText('Coming soon')).toBeOnTheScreen();
    // The card blurb is pathway_summary (docs/spec/02), not the detail summary.
    expect(
      screen.getByText('Eight classes on the gospel of grace.'),
    ).toBeOnTheScreen();
    // Masterclass wears its prerequisite lock line.
    expect(screen.getByText('Complete Grace Reset first')).toBeOnTheScreen();
  });

  test('a live registration turns the card chip to Enrolled', async () => {
    mockAuthState.mockReturnValue({
      status: 'member',
      email: 'dev.grace@example.test',
      profile: { displayName: 'Grace Bello' },
    });
    mockRegistrations.mockReturnValue({
      data: [registration()],
      isError: false,
      refetch: jest.fn(),
    });
    await renderUi(<Academy />);
    expect(screen.getByText('Enrolled')).toBeOnTheScreen();
  });

  test('every card navigates to its course', async () => {
    await renderUi(<Academy />);
    await fireEvent.press(
      screen.getByRole('button', {
        name: 'Further levels · The journey continues · Coming soon',
      }),
    );
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/course/[slug]',
      params: { slug: 'further' },
    });
  });

  test('error blanks only when nothing is cached', async () => {
    mockCourses.mockReturnValue({
      data: undefined,
      isError: true,
      refetch: jest.fn(),
    });
    await renderUi(<Academy />);
    expect(screen.getByText('Something went wrong')).toBeOnTheScreen();
  });
});

describe('COURSE · open (Grace Reset)', () => {
  test('hero, per-format chips, fee, note and regional line, outline, gains', async () => {
    await renderUi(<CourseDetail />);
    expect(screen.getByText('Level One · Start here')).toBeOnTheScreen();
    expect(screen.getByText('Grace Reset')).toBeOnTheScreen();
    expect(screen.getByText('2 weeks')).toBeOnTheScreen();
    expect(screen.getByText('4 weeks')).toBeOnTheScreen();
    expect(screen.getByText('£25')).toBeOnTheScreen();
    // fee_note + the NG override, one quiet line (decided 2026-08-10).
    expect(screen.getByText(/Workbook included/)).toBeOnTheScreen();
    expect(screen.getByText(/in Nigeria/)).toBeOnTheScreen();
    expect(
      screen.getByText('Forgiveness of sin and righteousness by faith'),
    ).toBeOnTheScreen();
    expect(
      screen.getByText('Settled assurance of forgiveness'),
    ).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Register' })).toBeOnTheScreen();
  });

  test("a guest's Register tap gates rather than the button hiding", async () => {
    await renderUi(<CourseDetail />);
    await fireEvent.press(screen.getByRole('button', { name: 'Register' }));
    expect(screen.getByText('Sign in to register')).toBeOnTheScreen();
    expect(mockOpenRegistration).not.toHaveBeenCalled();
  });

  test("a member's Register tap mints and opens", async () => {
    mockAuthState.mockReturnValue({
      status: 'member',
      email: 'dev.grace@example.test',
      profile: { displayName: 'Grace Bello' },
    });
    mockOpenRegistration.mockResolvedValue('opened');
    await renderUi(<CourseDetail />);
    await fireEvent.press(screen.getByRole('button', { name: 'Register' }));
    expect(mockOpenRegistration).toHaveBeenCalledWith('grace-reset', 'en');
  });

  test('an already_registered refusal refetches instead of opening a second checkout', async () => {
    mockAuthState.mockReturnValue({
      status: 'member',
      email: 'dev.grace@example.test',
      profile: { displayName: 'Grace Bello' },
    });
    mockOpenRegistration.mockResolvedValue('already_registered');
    await renderUi(<CourseDetail />);
    await fireEvent.press(screen.getByRole('button', { name: 'Register' }));
    expect(mockInvalidateRegistrations).toHaveBeenCalled();
  });
});

describe('COURSE · prerequisite (Grace Masterclass)', () => {
  test('the banner informs and links, and never blocks Register', async () => {
    mockParams.mockReturnValue({ slug: 'grace-masterclass' });
    await renderUi(<CourseDetail />);
    expect(
      screen.getByText(/Grace Masterclass builds on Grace Reset/),
    ).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Register' })).toBeOnTheScreen();

    await fireEvent.press(
      screen.getByRole('link', { name: /start with Grace Reset/ }),
    );
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/course/[slug]',
      params: { slug: 'grace-reset' },
    });
  });
});

describe('COURSE · registered', () => {
  beforeEach(() => {
    mockAuthState.mockReturnValue({
      status: 'member',
      email: 'dev.grace@example.test',
      profile: { displayName: 'Grace Bello' },
    });
  });

  test("pending: the band, the ROW's chips, and the email action instead of Register", async () => {
    mockRegistrations.mockReturnValue({
      data: [registration()],
      isError: false,
      refetch: jest.fn(),
    });
    await renderUi(<CourseDetail />);
    expect(
      screen.getByText("You're registered · pending confirmation"),
    ).toBeOnTheScreen();
    expect(screen.getByText('Part-time (4 weeks)')).toBeOnTheScreen();
    expect(screen.getByText('£25')).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'Email us about this registration' }),
    ).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Register' })).toBeNull();
  });

  test('confirmed: the settled copy', async () => {
    mockRegistrations.mockReturnValue({
      data: [registration({ status: 'confirmed' })],
      isError: false,
      refetch: jest.fn(),
    });
    await renderUi(<CourseDetail />);
    expect(
      screen.getByText("You're registered · your place is confirmed"),
    ).toBeOnTheScreen();
    expect(
      screen.getByText('See you in class. Your branch will share the details.'),
    ).toBeOnTheScreen();
  });

  test('a cancelled row reads like it was never there (13: a new row registers again)', async () => {
    mockRegistrations.mockReturnValue({
      data: [registration({ status: 'cancelled' })],
      isError: false,
      refetch: jest.fn(),
    });
    await renderUi(<CourseDetail />);
    expect(screen.getByRole('button', { name: 'Register' })).toBeOnTheScreen();
    expect(screen.queryByText(/You're registered/)).toBeNull();
  });

  test('the email sheet opens with the editable prefill and sends', async () => {
    mockRegistrations.mockReturnValue({
      data: [registration()],
      isError: false,
      refetch: jest.fn(),
    });
    mockSend.mockResolvedValue('sent');
    await renderUi(<CourseDetail />);
    await fireEvent.press(
      screen.getByRole('button', { name: 'Email us about this registration' }),
    );
    expect(screen.getByText('About your registration')).toBeOnTheScreen();
    expect(
      screen.getByDisplayValue("I'd like to cancel my registration, please."),
    ).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Send' }));
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Grace Bello',
        email: 'dev.grace@example.test',
        courseName: 'Grace Reset',
        registrationId: 'r1-abcdef',
        text: "I'd like to cancel my registration, please.",
      }),
    );
  });
});

describe('COURSE · upcoming (Further levels)', () => {
  beforeEach(() => {
    mockParams.mockReturnValue({ slug: 'further' });
  });

  test('never a dead Register: Notify me, over a sparse honest screen', async () => {
    await renderUi(<CourseDetail />);
    expect(screen.getByText('The journey continues')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Notify me' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Register' })).toBeNull();
    // No invented sections: the row carries no outline, gains, formats or fee.
    expect(screen.queryByText('Outline')).toBeNull();
  });

  test("a guest's Notify me gates", async () => {
    await renderUi(<CourseDetail />);
    await fireEvent.press(screen.getByRole('button', { name: 'Notify me' }));
    expect(screen.getByText('Sign in to be notified')).toBeOnTheScreen();
    expect(mockToggleMutate).not.toHaveBeenCalled();
  });

  test("a member's Notify me records interest", async () => {
    mockAuthState.mockReturnValue({
      status: 'member',
      email: 'dev.grace@example.test',
      profile: { displayName: 'Grace Bello' },
    });
    await renderUi(<CourseDetail />);
    await fireEvent.press(screen.getByRole('button', { name: 'Notify me' }));
    expect(mockToggleMutate).toHaveBeenCalledWith(
      { courseId: 'c-further', interested: false },
      expect.anything(),
    );
  });

  test('interest recorded: the stat line and the way back out', async () => {
    mockAuthState.mockReturnValue({
      status: 'member',
      email: 'dev.grace@example.test',
      profile: { displayName: 'Grace Bello' },
    });
    mockInterest.mockReturnValue({
      data: ['c-further'],
      isError: false,
      refetch: jest.fn(),
    });
    await renderUi(<CourseDetail />);
    expect(
      screen.getByText(
        "You're on the list. We'll tell you the moment it opens.",
      ),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: 'Remove me from the list' }),
    ).toBeOnTheScreen();
  });
});

describe('COURSE · not found', () => {
  test('a deep link to an unknown slug lands on honest copy, never a 404', async () => {
    mockParams.mockReturnValue({ slug: 'no-such-course' });
    await renderUi(<CourseDetail />);
    expect(screen.getByText("This course isn't here")).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('button', { name: 'See the pathway' }),
    );
    expect(mockReplace).toHaveBeenCalledWith('/academy');
  });
});
