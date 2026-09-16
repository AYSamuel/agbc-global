import * as Crypto from 'expo-crypto';

// The idempotency key a contact message travels with (W4.18 slice 3). Wrapped
// in its own module, like `features/family/postId.ts`, so the screens' tests
// can hand out a known key without reaching into expo-crypto.

export function mintContactKey(): string {
  return Crypto.randomUUID();
}
