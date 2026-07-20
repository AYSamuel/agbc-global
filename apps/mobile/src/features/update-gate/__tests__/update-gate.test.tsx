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
import { useUpdateGateStore } from '../store';
import { UpdateRequiredScreen } from '../UpdateRequiredScreen';
import { isBelowMinimum, parseVersion } from '../version';

// The store module imports the supabase client (requires env); the fetch path is
// not under test here, only the cached-value gate behavior.
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
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
