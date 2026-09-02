import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import i18n from '@/i18n';
import { ThemeScope } from '@/theme';

import { TabletShell } from '../TabletShell';

// A const, because the repo forbids literal strings inside JSX (i18n rule) and
// the rule applies to test files too.
const CONTENT = 'Screen content';

// Loaded for its side effect, so the rail's labels resolve to real words rather
// than to their keys (the same shape the other screen suites use).
void i18n;

/**
 * The tablet shell (W4.7 slice 4).
 *
 * Two things have to hold, and the second is why this component exists at all:
 * the rail must not appear on a phone, and it must SURVIVE A PUSHED ROUTE. The
 * first version drew the rail from the tab navigator's bar slot, which looked
 * right on the five roots and vanished the moment anybody opened a sermon. That
 * was found on a real tablet and could not have been found on a phone.
 */

jest.mock(
  'react-native-safe-area-context',
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access -- documented jest.mock factory shape
  () => require('react-native-safe-area-context/jest/mock').default,
);

const mockNavigate = jest.fn();
let mockSegments: string[] = ['(tabs)', 'home'];
let mockPathname = '/';
jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: mockNavigate, push: jest.fn(), back: jest.fn() }),
  useSegments: () => mockSegments,
  usePathname: () => mockPathname,
}));

// The list pane fetches; stubbed so this suite is about the SHELL's rules and
// not about Watch's data.
jest.mock('@/features/watch/WatchListPane', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Text } = require('react-native') as typeof import('react-native');
  return {
    WatchListPane: ({ selectedId }: { selectedId: string | null }) => {
      // Built outside the JSX: the repo forbids string literals inside it, and
      // a template literal counts.
      const label = 'pane:' + (selectedId ?? 'none');
      return <Text>{label}</Text>;
    },
  };
});

let mockWidth = 400;
let mockHeight = 900;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({
    width: mockWidth,
    height: mockHeight,
    scale: 2,
    fontScale: 1,
  }),
}));

// RNTL v14: render and events are async (React 19 act semantics); always await.
async function renderShell() {
  await render(
    <ThemeScope name="light">
      <TabletShell>
        <Text>{CONTENT}</Text>
      </TabletShell>
    </ThemeScope>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockWidth = 400;
  mockHeight = 900;
  mockSegments = ['(tabs)', 'home'];
  mockPathname = '/';
});

test('a phone gets no rail at all, and its content untouched', async () => {
  await renderShell();
  expect(screen.getByText(CONTENT)).toBeOnTheScreen();
  expect(screen.queryByRole('tab', { name: 'Home' })).not.toBeOnTheScreen();
});

test('a tablet gets the rail beside the content', async () => {
  mockWidth = 900;
  await renderShell();
  expect(screen.getByText(CONTENT)).toBeOnTheScreen();
  expect(screen.getByRole('tab', { name: 'Home' })).toBeOnTheScreen();
});

test('THE RAIL SURVIVES A PUSHED ROUTE, which is the whole point', async () => {
  mockWidth = 900;
  mockSegments = ['academy'];
  await renderShell();
  expect(screen.getByRole('tab', { name: 'More' })).toBeOnTheScreen();
});

test('a pushed route keeps the root it belongs to lit', async () => {
  mockWidth = 900;
  // The mockup's own ACADEMY tablet frame highlights More, because More is the
  // hub Academy hangs off.
  mockSegments = ['academy'];
  await renderShell();
  expect(
    screen.getByRole('tab', { name: 'More' }).props.accessibilityState,
  ).toMatchObject({ selected: true });

  jest.clearAllMocks();
  mockSegments = ['sermon', '[id]'];
  await renderShell();
  expect(
    screen.getByRole('tab', { name: 'Watch' }).props.accessibilityState,
  ).toMatchObject({ selected: true });
});

test.each([['index'], ['onboarding'], ['auth']])(
  'no rail on %s: the app has no navigation to offer yet',
  async (route) => {
    mockWidth = 900;
    mockSegments = [route];
    await renderShell();
    expect(screen.getByText(CONTENT)).toBeOnTheScreen();
    expect(screen.queryByRole('tab', { name: 'Home' })).not.toBeOnTheScreen();
  },
);

describe('the tablet two-pane (mockup WATCH · rail + two-pane)', () => {
  function openSermon() {
    mockSegments = ['sermon', '[id]'];
    mockPathname = '/sermon/abc-123';
  }

  test('a sermon in landscape keeps its list beside it', async () => {
    mockWidth = 1400;
    mockHeight = 900;
    openSermon();
    await renderShell();
    expect(screen.getByText(CONTENT)).toBeOnTheScreen();
    expect(screen.getByText('pane:abc-123')).toBeOnTheScreen();
  });

  test('THE ROUTE says which row is selected, so a deep link lights it', async () => {
    mockWidth = 1400;
    mockHeight = 900;
    mockSegments = ['sermon', '[id]'];
    mockPathname = '/sermon/deep-linked-id';
    await renderShell();
    // Nothing was tapped: the id came from the path alone.
    expect(screen.getByText('pane:deep-linked-id')).toBeOnTheScreen();
  });

  test('portrait keeps one pane: 396 of list plus a sermon does not fit 876dp', async () => {
    mockWidth = 876;
    mockHeight = 1400;
    openSermon();
    await renderShell();
    expect(screen.getByText(CONTENT)).toBeOnTheScreen();
    expect(screen.queryByText(/^pane:/)).not.toBeOnTheScreen();
  });

  test('A PHONE IN LANDSCAPE IS STILL A PHONE, and keeps the whole screen', async () => {
    // A large phone turned sideways is over 1000dp WIDE, so a width-only
    // breakpoint handed it the rail and a two-pane sermon. The only screen this
    // app lets a phone rotate to is the player, where turning the device means
    // "make the video bigger". The breakpoint is smallest-width for exactly
    // this reason (`lib/layout`), so 1100x411 stays a phone.
    mockWidth = 1100;
    mockHeight = 411;
    openSermon();
    await renderShell();
    expect(screen.getByText(CONTENT)).toBeOnTheScreen();
    expect(screen.queryByText(/^pane:/)).not.toBeOnTheScreen();
    expect(screen.queryByRole('tab', { name: 'Home' })).not.toBeOnTheScreen();
  });
});
