import * as Crypto from 'expo-crypto';

// The id a new post is born with, minted on the phone (W4.18 slice 2).
//
// Until this the database chose the id, so a request that timed out after the
// row had landed left nothing to recognise it by, and the member's retry posted
// it again. Minting it here and sending it as the row's own `id` makes a repeat
// a primary-key conflict the database refuses, which the composer reads as
// "already posted". Wrapped in its own module so the composer's tests can hand
// out a known id without reaching into expo-crypto (a native module; the same
// dev-client fence `photo.ts` already lives behind).

export function mintPostId(): string {
  return Crypto.randomUUID();
}
