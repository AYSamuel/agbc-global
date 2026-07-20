import { fireEvent, render, screen } from '@testing-library/react-native';

import i18n from '@/i18n';
import { useBranchStore } from '@/state/branch';
import { resolveEntryRoute } from '@/state/launch';
import { ThemeScope } from '@/theme';

import { resolveBranchList } from '../branchList';
import { BRANCHES_SNAPSHOT, type BranchSummary } from '../branches-snapshot';

import PickBranch from '../../../../app/onboarding/branch';
import PickLanguage from '../../../../app/onboarding/language';

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
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

jest.mock('expo-localization', () => ({
  getLocales: jest.fn(() => [{ languageCode: 'en' }]),
}));

// The query hook is mocked entirely (its module imports the supabase client, which
// requires env); resolveBranchList lives in the pure branchList module and is tested
// for real.
const mockQuery = jest.fn<
  { data: BranchSummary[] | undefined; isError: boolean },
  []
>();
jest.mock('../useBranches', () => ({
  useBranchesQuery: () => mockQuery(),
}));

function inTheme(ui: React.ReactElement) {
  return render(<ThemeScope name="light">{ui}</ThemeScope>);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('entry routing (docs/spec/06)', () => {
  test('first launch goes to onboarding; returning users go home', () => {
    expect(resolveEntryRoute(false)).toBe('/onboarding/welcome');
    expect(resolveEntryRoute(true)).toBe('/home');
  });
});

describe('resolveBranchList four states', () => {
  test('pending yields no list (skeleton state)', () => {
    expect(resolveBranchList({ data: undefined, isError: false })).toEqual({
      branches: null,
      usingSnapshot: false,
    });
  });

  test('error falls back to the bundled snapshot', () => {
    const r = resolveBranchList({ data: undefined, isError: true });
    expect(r.usingSnapshot).toBe(true);
    expect(r.branches).toHaveLength(4);
  });

  test('empty server result also falls back (never a dead end)', () => {
    const r = resolveBranchList({ data: [], isError: false });
    expect(r.usingSnapshot).toBe(true);
  });

  test('server data wins', () => {
    const r = resolveBranchList({ data: BRANCHES_SNAPSHOT, isError: false });
    expect(r.usingSnapshot).toBe(false);
    expect(r.branches).toHaveLength(4);
  });
});

describe('ONB-2 pick branch', () => {
  test('loading shows skeletons and a disabled Continue', async () => {
    mockQuery.mockReturnValue({ data: undefined, isError: false });
    await inTheme(<PickBranch />);
    expect(
      screen.getAllByTestId('skeleton', { includeHiddenElements: true }).length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });

  test('offline fallback renders the snapshot with a notice, fully selectable', async () => {
    mockQuery.mockReturnValue({ data: undefined, isError: true });
    await inTheme(<PickBranch />);
    expect(
      screen.getByText('Showing saved branches. Connect to refresh.'),
    ).toBeOnTheScreen();
    await fireEvent.press(
      screen.getByRole('radio', { name: /AGBC Lighthouse Berlin/ }),
    );
    const cont = screen.getByRole('button', { name: 'Continue' });
    expect(cont).not.toBeDisabled();
    await fireEvent.press(cont);
    expect(mockPush).toHaveBeenCalledWith('/onboarding/language');
    expect(useBranchStore.getState().branch?.slug).toBe('berlin');
  });

  test('Not sure yet selects HQ and proceeds', async () => {
    mockQuery.mockReturnValue({ data: BRANCHES_SNAPSHOT, isError: false });
    await inTheme(<PickBranch />);
    await fireEvent.press(screen.getByRole('button', { name: 'Not sure yet' }));
    expect(useBranchStore.getState().branch?.slug).toBe('glasgow');
    expect(mockPush).toHaveBeenCalledWith('/onboarding/language');
  });
});

describe('ONB-3 language', () => {
  test('choosing a language relocalizes immediately and Continue completes onboarding', async () => {
    await i18n.changeLanguage('en');
    await inTheme(<PickLanguage />);
    await fireEvent.press(screen.getByRole('radio', { name: 'Deutsch' }));
    expect(i18n.language).toBe('de');
    // The screen itself re-rendered in German.
    await fireEvent.press(screen.getByRole('button', { name: 'Weiter' }));
    expect(mockReplace).toHaveBeenCalledWith('/home');
    await i18n.changeLanguage('en');
  });
});
