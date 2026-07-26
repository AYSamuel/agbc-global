import AsyncStorage from '@react-native-async-storage/async-storage';

import { LargeSecureStore, type NativeDeps } from '../largeSecureStore';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// A deterministic stand-in for the native pair: a Map-backed SecureStore and a
// seeded byte filler (the adapter's crypto contract is "fill this array").
function makeNativeDeps(): NativeDeps & { secureItems: Map<string, string> } {
  const secureItems = new Map<string, string>();
  return {
    secureItems,
    secureStore: {
      getItemAsync: (key: string) =>
        Promise.resolve(secureItems.get(key) ?? null),
      setItemAsync: (key: string, value: string) => {
        secureItems.set(key, value);
        return Promise.resolve();
      },
      deleteItemAsync: (key: string) => {
        secureItems.delete(key);
        return Promise.resolve();
      },
    },
    crypto: {
      getRandomValues: (array: Uint8Array) => {
        for (let i = 0; i < array.length; i += 1) array[i] = (i * 7 + 13) % 256;
        return array;
      },
    },
  };
}

// A session-sized payload: the whole point of the adapter is values beyond
// SecureStore's 2048-byte limit.
const SESSION = JSON.stringify({
  access_token: 'a'.repeat(1200),
  refresh_token: 'r'.repeat(1200),
  user: { id: '10000000-0000-4000-8000-00000000aaaa' },
});
const KEY = 'sb-local-auth-token';

beforeEach(() => AsyncStorage.clear());

describe('LargeSecureStore (secure path)', () => {
  it('round-trips a session-sized value', async () => {
    const store = new LargeSecureStore(makeNativeDeps());
    await store.setItem(KEY, SESSION);
    expect(await store.getItem(KEY)).toBe(SESSION);
  });

  it('stores only ciphertext in AsyncStorage and only the key in SecureStore', async () => {
    const native = makeNativeDeps();
    const store = new LargeSecureStore(native);
    await store.setItem(KEY, SESSION);

    const stored = await AsyncStorage.getItem(KEY);
    expect(stored).not.toBeNull();
    expect(stored).not.toContain('access_token');
    // 32-byte AES key as 64 hex chars, comfortably under the 2048-byte limit.
    expect(native.secureItems.get(KEY)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns null when nothing was stored', async () => {
    const store = new LargeSecureStore(makeNativeDeps());
    expect(await store.getItem(KEY)).toBeNull();
  });

  it('removeItem clears both halves', async () => {
    const native = makeNativeDeps();
    const store = new LargeSecureStore(native);
    await store.setItem(KEY, SESSION);
    await store.removeItem(KEY);

    expect(await store.getItem(KEY)).toBeNull();
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
    expect(native.secureItems.size).toBe(0);
  });
});

describe('LargeSecureStore (pre-rebuild dev-client fallback)', () => {
  it('works in memory and never touches AsyncStorage', async () => {
    const store = new LargeSecureStore(null);
    await store.setItem(KEY, SESSION);

    expect(await store.getItem(KEY)).toBe(SESSION);
    expect(await AsyncStorage.getItem(KEY)).toBeNull();

    await store.removeItem(KEY);
    expect(await store.getItem(KEY)).toBeNull();
  });

  it('degrades to memory when a native call throws, without losing the write', async () => {
    const native = makeNativeDeps();
    native.secureStore.setItemAsync = () =>
      Promise.reject(new Error('Cannot find native module ExpoSecureStore'));
    const store = new LargeSecureStore(native);

    await store.setItem(KEY, SESSION);
    expect(await store.getItem(KEY)).toBe(SESSION);
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
  });
});
