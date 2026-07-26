import AsyncStorage from '@react-native-async-storage/async-storage';
import * as aesjs from 'aes-js';

// Supabase session storage per docs/spec/03: a session object routinely exceeds
// SecureStore's 2048-byte per-value limit, so the Supabase Expo guide's
// LargeSecureStore pattern splits it: a fresh AES-256 key per write lives in
// SecureStore (Keychain/Keystore-backed), the AES-CTR ciphertext in
// AsyncStorage. Never raw AsyncStorage, never the whole session in SecureStore.
// (Random source: expo-crypto instead of the guide's global polyfill; decided
// with Ayo 2026-07-26.)
//
// expo-secure-store and expo-crypto are NATIVE modules: a dev client built
// before them (the W0.11 builds) throws at require. Guarded require + an
// in-memory fallback keep auth working there: the session simply does not
// survive a relaunch until the next EAS dev build links the modules. The
// fallback is memory, never plaintext storage.

interface SecureStoreModule {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

interface CryptoModule {
  getRandomValues(array: Uint8Array): Uint8Array;
}

export interface NativeDeps {
  secureStore: SecureStoreModule;
  crypto: CryptoModule;
}

function loadNativeDeps(): NativeDeps | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const secureStore = require('expo-secure-store') as SecureStoreModule;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crypto = require('expo-crypto') as CryptoModule;
    return { secureStore, crypto };
  } catch {
    return null;
  }
}

/** SecureStore keys allow only [A-Za-z0-9._-]; Supabase's storage key does, but
 * sanitize rather than assume. */
function toSecureStoreKey(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/g, '_');
}

export class LargeSecureStore {
  private native: NativeDeps | null;
  private readonly memory = new Map<string, string>();

  constructor(native: NativeDeps | null = loadNativeDeps()) {
    this.native = native;
    if (this.native === null) {
      console.warn(
        'largeSecureStore: secure modules unavailable (pre-rebuild dev client?); session will not persist across launches.',
      );
    }
  }

  /** Any native failure degrades this instance to memory-only: auth keeps
   * working, nothing sensitive lands in plaintext storage, no silent throw
   * inside the auth client. */
  private degrade(operation: string, error: unknown): void {
    console.warn(
      `largeSecureStore: ${operation} failed (${error instanceof Error ? error.name : 'unknown'}); degrading to in-memory session storage.`,
    );
    this.native = null;
  }

  async getItem(key: string): Promise<string | null> {
    if (this.native === null) return this.memory.get(key) ?? null;
    try {
      const keyHex = await this.native.secureStore.getItemAsync(
        toSecureStoreKey(key),
      );
      if (keyHex === null) return null;
      const encryptedHex = await AsyncStorage.getItem(key);
      if (encryptedHex === null) return null;
      const cipher = new aesjs.ModeOfOperation.ctr(
        aesjs.utils.hex.toBytes(keyHex),
        new aesjs.Counter(1),
      );
      return aesjs.utils.utf8.fromBytes(
        cipher.decrypt(aesjs.utils.hex.toBytes(encryptedHex)),
      );
    } catch (error) {
      this.degrade('getItem', error);
      return this.memory.get(key) ?? null;
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    if (this.native === null) {
      this.memory.set(key, value);
      return;
    }
    try {
      // Fresh key per write: CTR with a fixed counter is safe exactly because
      // a key never encrypts twice (the guide's construction).
      const encryptionKey = this.native.crypto.getRandomValues(
        new Uint8Array(256 / 8),
      );
      const cipher = new aesjs.ModeOfOperation.ctr(
        encryptionKey,
        new aesjs.Counter(1),
      );
      const encryptedHex = aesjs.utils.hex.fromBytes(
        cipher.encrypt(aesjs.utils.utf8.toBytes(value)),
      );
      // Key first: a ciphertext without its key is unreadable; the reverse
      // order could leave a readable stale pair.
      await this.native.secureStore.setItemAsync(
        toSecureStoreKey(key),
        aesjs.utils.hex.fromBytes(encryptionKey),
      );
      await AsyncStorage.setItem(key, encryptedHex);
    } catch (error) {
      this.degrade('setItem', error);
      this.memory.set(key, value);
    }
  }

  async removeItem(key: string): Promise<void> {
    this.memory.delete(key);
    if (this.native === null) return;
    try {
      await AsyncStorage.removeItem(key);
      await this.native.secureStore.deleteItemAsync(toSecureStoreKey(key));
    } catch (error) {
      this.degrade('removeItem', error);
    }
  }
}
