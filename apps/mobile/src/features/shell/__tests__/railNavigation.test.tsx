// The two facts TabletShell's rail relies on, pinned against expo-router's REAL
// navigators rather than a mocked router (2026-09-09). Ayo found on the tablet
// that from NOW PLAYING a rail tap landed on Home and a second tap was needed;
// this file is why the shell answers a tap with `dismissTo` from a stack screen
// and with `navigate` from inside the tab group, and it fails if expo-router
// changes either behaviour under us.
//
// Each test waits for the router to settle: `router.*` queues an action that
// applies after the current render, and the router's store is process-global,
// so an unawaited navigation would leak into the next test.
import { act, waitFor } from '@testing-library/react-native';
import { Stack, Tabs, router } from 'expo-router';
import { cleanup, renderRouter } from 'expo-router/testing-library';
import { Text } from 'react-native';

// The shape of app/: a root stack whose first route is the tab group, with the
// sermon pushed above it. Screens are a word each; nothing here is about UI.
const app = {
  _layout: () => <Stack screenOptions={{ headerShown: false }} />,
  '(tabs)/_layout': () => <Tabs initialRouteName="home" />,
  '(tabs)/home': () => <Text>home</Text>,
  '(tabs)/give': () => <Text>give</Text>,
  'sermon/[id]': () => <Text>sermon</Text>,
};

/**
 * The two accessors this file needs, copied off `renderRouter`'s result into a
 * plain object. Two things about that result are traps: its declared type does
 * not survive this repo's two copies of testing-library (the helper's and ours),
 * and at runtime it is a THENABLE with the accessors bolted on, so returning it
 * from an async function would silently unwrap it into a bare render result.
 */
interface RouterResult {
  getPathname(): string;
  getRouterState(): unknown;
}

async function mount(initialUrl: string): Promise<RouterResult> {
  const r = renderRouter(app, { initialUrl }) as unknown as RouterResult &
    PromiseLike<unknown>;
  // The render is asynchronous in the helper's copy of testing-library: until
  // it settles, the global store still answers for the PREVIOUS test's tree.
  await r;
  return {
    getPathname: () => r.getPathname(),
    getRouterState: () => r.getRouterState(),
  };
}

// expo-router's testing-library holds its OWN copy of testing-library, so ours
// never cleans its trees up, and it switches Jest to fake timers on every
// render. Both are undone here so the next test starts from nothing.
afterEach(async () => {
  await cleanup();
  jest.useRealTimers();
});

interface NavState {
  index?: number;
  routes: { name: string; state?: unknown }[];
}

/** `tabs[home,give@1]` style: route names, nested states in brackets, and the index. */
function shape(state: unknown): string {
  const s = state as NavState | undefined;
  if (!s) return '';
  const names = s.routes.map((r) => r.name + shape(r.state)).join(',');
  return `[${names}@${String(s.index ?? 0)}]`;
}

async function openSermonAboveTheTabs() {
  const result = await mount('/home');
  await waitFor(() => {
    expect(result.getPathname()).toBe('/home');
  });
  await act(() => {
    router.push('/sermon/1');
  });
  await waitFor(() => {
    expect(result.getPathname()).toBe('/sermon/1');
  });
  expect(shape(result.getRouterState())).toBe(
    '[__root[(tabs)[home,give@0],sermon/[id]@1]@0]',
  );
  return result;
}

describe('a rail tap from a stack screen above the tab group', () => {
  test('`navigate` pushes a SECOND tab group on top of the sermon (the bug)', async () => {
    const result = await openSermonAboveTheTabs();
    await act(() => {
      router.navigate('/(tabs)/give');
    });
    await waitFor(() => {
      expect(result.getPathname()).toBe('/give');
    });
    // Three routes on the root stack: the original tabs, the sermon, and a new
    // tab group mounted on top. Back from here returns to the sermon, and the
    // rail's tap has cost a whole navigator.
    expect(shape(result.getRouterState())).toBe(
      '[__root[(tabs)[home,give@0],sermon/[id],(tabs)[home,give@1]@2]@0]',
    );
  });

  test('`dismissTo` pops to the one tab group and switches it (the fix)', async () => {
    const result = await openSermonAboveTheTabs();
    await act(() => {
      router.dismissTo('/(tabs)/give');
    });
    await waitFor(() => {
      expect(result.getPathname()).toBe('/give');
    });
    expect(shape(result.getRouterState())).toBe(
      '[__root[(tabs)[home,give@1]@0]@0]',
    );
  });
});

describe('a rail tap from inside the tab group', () => {
  test('`navigate` is the tab switch', async () => {
    const result = await mount('/home');
    await waitFor(() => {
      expect(result.getPathname()).toBe('/home');
    });
    await act(() => {
      router.navigate('/(tabs)/give');
    });
    await waitFor(() => {
      expect(result.getPathname()).toBe('/give');
    });
    expect(shape(result.getRouterState())).toBe(
      '[__root[(tabs)[home,give@1]@0]@0]',
    );
  });

  test('`dismissTo` does nothing here, which is why the shell cannot use it alone', async () => {
    const result = await mount('/home');
    await waitFor(() => {
      expect(result.getPathname()).toBe('/home');
    });
    await act(() => {
      router.dismissTo('/(tabs)/give');
    });
    // Nothing to wait for: the action is a no-op, so give the queue a turn (the
    // helper runs under fake timers) and assert the state is untouched.
    await act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(result.getPathname()).toBe('/home');
    expect(shape(result.getRouterState())).toBe('[__root[(tabs)[home@0]@0]@0]');
  });
});
