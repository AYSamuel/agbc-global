import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';

import { ToastProvider } from '@/components/ui';
import i18n from '@/i18n';
import { ThemeScope } from '@/theme';

import { useRehomePromptStore } from '../prompted';

import RehomeScreen from '../../../../app/rehome';

import type { BranchSummary } from '@/features/onboarding/branches-snapshot';

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access --
   documented jest.mock factory shapes */
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access */

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    back: jest.fn(),
    canGoBack: () => true,
    replace: jest.fn(),
  }),
}));

const mockMutate = jest.fn();
const mockBranchHasClosed = {
  closed: true,
  branch: { id: 'emmen', name: 'AGBC Emmen', status: 'archived' },
};
jest.mock('../queries', () => ({
  useBranchHasClosed: () => mockBranchHasClosed,
  useRehome: () => ({ mutate: mockMutate }),
}));

const mockBranches: BranchSummary[] = [
  {
    id: 'glasgow',
    slug: 'glasgow',
    name: 'AGBC Glasgow',
    city: 'Glasgow',
    country: 'Scotland',
    is_hq: true,
    email: 'hello@example.test',
    youtube_channel_id: null,
    timezone: 'Europe/London',
    address: null,
    service_times: null,
    lat: 0,
    lng: 0,
    order: 0,
  },
  {
    id: 'berlin',
    slug: 'berlin',
    name: 'AGBC Lighthouse Berlin',
    city: 'Berlin',
    country: 'Germany',
    is_hq: false,
    email: 'hello@example.test',
    youtube_channel_id: null,
    timezone: 'Europe/Berlin',
    address: null,
    service_times: null,
    lat: 0,
    lng: 0,
    order: 1,
  },
];
jest.mock('@/features/onboarding/useBranches', () => ({
  useBranchesQuery: () => ({ data: mockBranches }),
}));

/**
 * RE-HOME (W3.5 slice 5c): what a member meets when their branch has closed.
 *
 * The database owns the act itself, and pgTAP `047` proves it against a real database: the
 * archived precondition, the cooldown it ignores, the audit row it writes. None of that is
 * re-tested here.
 *
 * What IS here is the half with no other home: that HQ is the branch offered first, that
 * selecting a row is not yet a decision, and that "once per launch" means once per LAUNCH.
 * Each of those is a decision taken with Ayo rather than an implementation detail, and each
 * is a line somebody could reasonably tidy away later.
 */

/**
 * The radio state a screen reader announces, read without reaching into `any`.
 *
 * Typed structurally rather than as `ReactTestInstance`: that type lives in
 * `react-test-renderer`, which this workspace does not carry types for.
 */
function isSelected(node: { props: unknown }): boolean {
  const props = node.props as { accessibilityState?: { selected?: boolean } };
  return props.accessibilityState?.selected ?? false;
}

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

beforeEach(() => {
  mockPush.mockClear();
  mockMutate.mockClear();
  useRehomePromptStore.getState().reset();
});

function renderScreen() {
  return render(
    // The screen reaches for a toast when nothing is selected yet, so it needs the real
    // provider: a stubbed one would prove this test agrees with the stub.
    <ThemeScope name="light">
      <ToastProvider>
        <RehomeScreen />
      </ToastProvider>
    </ThemeScope>,
  );
}

test('it names the branch that closed, and offers HQ first', async () => {
  await renderScreen();

  expect(await screen.findByText('AGBC Emmen has closed')).toBeTruthy();

  // `02` asks for HQ preselected by name. Asserted through the row's own accessibility
  // state rather than a style, so it survives a redesign of the check mark.
  expect(isSelected(screen.getByRole('radio', { name: /AGBC Glasgow/ }))).toBe(
    true,
  );
  expect(
    isSelected(screen.getByRole('radio', { name: /Lighthouse Berlin/ })),
  ).toBe(false);
});

test('choosing a branch asks first, and only then writes', async () => {
  await renderScreen();

  await fireEvent.press(
    screen.getByRole('radio', { name: /Lighthouse Berlin/ }),
  );
  // Selecting a row must NOT confirm on its own: exploring the list is not a decision.
  expect(screen.queryByText('Make AGBC Lighthouse Berlin home?')).toBeNull();
  expect(mockMutate).not.toHaveBeenCalled();

  await fireEvent.press(
    screen.getByRole('button', { name: 'Make this my home branch' }),
  );

  expect(
    await screen.findByText('Make AGBC Lighthouse Berlin home?'),
  ).toBeTruthy();
  // The sentence that makes this act unlike every other branch change.
  expect(screen.getByText(/takes effect straight away/)).toBeTruthy();

  await fireEvent.press(
    screen.getByRole('button', { name: 'Yes, this is home' }),
  );
  await waitFor(() => {
    expect(mockMutate).toHaveBeenCalledTimes(1);
  });
  const [destination] = mockMutate.mock.calls[0] as [
    { id: string; timezone: string },
  ];
  expect(destination).toMatchObject({
    id: 'berlin',
    timezone: 'Europe/Berlin',
  });
});

test('the prompt is once per launch, not once ever', () => {
  expect(useRehomePromptStore.getState().prompted).toBe(false);

  useRehomePromptStore.getState().markPrompted();
  expect(useRehomePromptStore.getState().prompted).toBe(true);

  // Nothing persists it: a fresh launch starts a fresh store, which is what makes "put it
  // off" mean "ask me again next time" rather than "never ask me again".
  useRehomePromptStore.getState().reset();
  expect(useRehomePromptStore.getState().prompted).toBe(false);
});
