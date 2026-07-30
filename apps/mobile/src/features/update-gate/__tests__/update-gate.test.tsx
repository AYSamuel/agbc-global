import {
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react-native';
import { Linking, Text } from 'react-native';

import '@/i18n';
import { APP_STORE_URL, PLAY_STORE_URL } from '@/lib/links';
import { ThemeScope } from '@/theme';

import { ForcedUpdateGate } from '../ForcedUpdateGate';
import { refreshMinimumVersion, useUpdateGateStore } from '../store';
import { UpdateRequiredScreen } from '../UpdateRequiredScreen';
import {
  isBelowMinimum,
  parseVersion,
  resolveMinimumVersion,
} from '../version';

// The store module imports the supabase client (requires env). The mock is settable so
// the FETCH path can be tested too, not just the cached-value gate: the pure resolver is
// unit-tested below, but nothing proved the wiring actually hands it this platform and
// stores what comes back, and that wiring is what decides whether the app locks.
let mockConfigResponse: { data: { value: unknown } | null; error: unknown } = {
  data: null,
  error: null,
};

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve(mockConfigResponse),
        }),
      }),
    }),
  },
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '1.0.0' } },
}));

function inTheme(ui: React.ReactElement) {
  return render(<ThemeScope name="light">{ui}</ThemeScope>);
}

// Marker child (a variable expression: the i18n keys-only lint rule allows it).
const APP_CONTENT = 'app content';

describe('version parsing (docs/spec/21 §8)', () => {
  test('parses plain x.y.z', () => {
    expect(parseVersion('1.2.3')).toEqual([1, 2, 3]);
    expect(parseVersion(' 10.0.20 ')).toEqual([10, 0, 20]);
  });

  test('rejects anything not x.y.z', () => {
    expect(parseVersion('1.2')).toBeNull();
    expect(parseVersion('1.2.3-beta')).toBeNull();
    expect(parseVersion('latest')).toBeNull();
    expect(parseVersion('')).toBeNull();
  });
});

describe('isBelowMinimum fails open on bad input', () => {
  test('compares component-wise, not lexically', () => {
    expect(isBelowMinimum('1.0.0', '1.0.1')).toBe(true);
    expect(isBelowMinimum('1.9.0', '1.10.0')).toBe(true);
    expect(isBelowMinimum('2.0.0', '1.10.0')).toBe(false);
    expect(isBelowMinimum('1.0.0', '1.0.0')).toBe(false);
    expect(isBelowMinimum('1.0.1', '1.0.0')).toBe(false);
  });

  test('the seeded 0.0.0 floor blocks nothing', () => {
    expect(isBelowMinimum('1.0.0', '0.0.0')).toBe(false);
  });

  test('missing or malformed values never block (fail open)', () => {
    expect(isBelowMinimum(null, '1.0.0')).toBe(false);
    expect(isBelowMinimum('1.0.0', null)).toBe(false);
    expect(isBelowMinimum('1.0.0', undefined)).toBe(false);
    expect(isBelowMinimum('1.0.0', 'not-a-version')).toBe(false);
    expect(isBelowMinimum('dev', '1.0.0')).toBe(false);
  });
});

// The floor is per-platform because the two stores review independently: raising one
// global floor when only Android is live would hard-block every iOS user on a build the
// App Store cannot yet give them (docs/spec/21 §8, decided 2026-07-30).
describe('resolveMinimumVersion picks the floor for this platform', () => {
  test('reads the platform key from the config object', () => {
    const value = { ios: '1.3.0', android: '1.1.0' };
    expect(resolveMinimumVersion(value, 'ios')).toBe('1.3.0');
    expect(resolveMinimumVersion(value, 'android')).toBe('1.1.0');
  });

  test('a platform still in review can be left behind without blocking it', () => {
    // Android 1.3.0 shipped, iOS 1.3.0 is still in review, so only Android is raised.
    const value = { ios: '1.2.0', android: '1.3.0' };
    expect(isBelowMinimum('1.2.0', resolveMinimumVersion(value, 'ios'))).toBe(
      false,
    );
    expect(
      isBelowMinimum('1.2.0', resolveMinimumVersion(value, 'android')),
    ).toBe(true);
  });

  test('a bare string still means both platforms', () => {
    // An environment whose row predates the per-platform migration must keep gating
    // rather than silently stopping.
    expect(resolveMinimumVersion('1.4.0', 'ios')).toBe('1.4.0');
    expect(resolveMinimumVersion('1.4.0', 'android')).toBe('1.4.0');
  });

  test('anything malformed resolves to null and so fails open', () => {
    expect(resolveMinimumVersion(null, 'ios')).toBeNull();
    expect(resolveMinimumVersion(undefined, 'ios')).toBeNull();
    expect(resolveMinimumVersion(42, 'ios')).toBeNull();
    expect(resolveMinimumVersion({ android: '1.0.0' }, 'ios')).toBeNull();
    expect(resolveMinimumVersion({ ios: 3 }, 'ios')).toBeNull();
    // typeof [] is 'object', so an array has to be excluded explicitly.
    expect(resolveMinimumVersion(['1.0.0'], 'ios')).toBeNull();
    // An unexpected platform (web, or a future target) has no floor rather than the
    // wrong one.
    expect(resolveMinimumVersion({ ios: '1.0.0' }, 'web')).toBeNull();
  });
});

// The wiring, not the resolver: does refreshMinimumVersion ask for THIS platform's floor
// and cache the resolved string? expo-constants is mocked to version 1.0.0 above, and
// Platform.OS is 'ios' under jest-expo's default preset.
describe('refreshMinimumVersion stores the floor for this platform', () => {
  afterEach(() => {
    mockConfigResponse = { data: null, error: null };
    useUpdateGateStore.getState().setMinimumVersion(null);
  });

  test('resolves the running platform out of the config object', async () => {
    mockConfigResponse = {
      data: { value: { ios: '2.0.0', android: '9.9.9' } },
      error: null,
    };
    await refreshMinimumVersion();
    // 'ios', not 'android': picking the wrong key here would block on 9.9.9.
    expect(useUpdateGateStore.getState().minimumVersion).toBe('2.0.0');
  });

  test('a malformed value never clears a floor that was already set', async () => {
    // Silently unblocking a build the ministry decided to block would look exactly like
    // the gate having quietly stopped working, which is the harder bug to notice.
    useUpdateGateStore.getState().setMinimumVersion('3.0.0');
    mockConfigResponse = { data: { value: { android: '1.0.0' } }, error: null };
    await refreshMinimumVersion();
    expect(useUpdateGateStore.getState().minimumVersion).toBe('3.0.0');
  });

  test('an offline or errored fetch leaves the cached floor alone', async () => {
    useUpdateGateStore.getState().setMinimumVersion('3.0.0');
    mockConfigResponse = { data: null, error: new Error('offline') };
    await refreshMinimumVersion();
    expect(useUpdateGateStore.getState().minimumVersion).toBe('3.0.0');
  });
});

describe('ForcedUpdateGate', () => {
  afterEach(async () => {
    // Unmount before resetting so the write has no mounted subscribers (a bare
    // act() here corrupts subsequent renders in the file; empirically verified).
    await cleanup();
    useUpdateGateStore.getState().setMinimumVersion(null);
  });

  test('renders children when no minimum is cached', async () => {
    await inTheme(
      <ForcedUpdateGate>
        <Text>{APP_CONTENT}</Text>
      </ForcedUpdateGate>,
    );
    expect(screen.getByText('app content')).toBeOnTheScreen();
  });

  test('renders children when the binary meets the minimum', async () => {
    useUpdateGateStore.getState().setMinimumVersion('1.0.0');
    await inTheme(
      <ForcedUpdateGate>
        <Text>{APP_CONTENT}</Text>
      </ForcedUpdateGate>,
    );
    expect(screen.getByText('app content')).toBeOnTheScreen();
  });

  test('blocks a below-minimum binary (faked minimum per the W1.2 Done check)', async () => {
    useUpdateGateStore.getState().setMinimumVersion('99.0.0');
    await inTheme(
      <ForcedUpdateGate>
        <Text>{APP_CONTENT}</Text>
      </ForcedUpdateGate>,
    );
    expect(screen.queryByText('app content')).not.toBeOnTheScreen();
    expect(
      screen.getByRole('header', { name: 'Time for an update' }),
    ).toBeOnTheScreen();
  });
});

describe('UpdateRequiredScreen', () => {
  test('the CTA opens the platform store link', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await inTheme(<UpdateRequiredScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Update now' }));
    // jest-expo runs as iOS; the Android leg carries the frozen package id.
    expect(openURL).toHaveBeenCalledWith(APP_STORE_URL);
    expect(PLAY_STORE_URL).toContain('com.oami.agbcapp');
    openURL.mockRestore();
  });
});
