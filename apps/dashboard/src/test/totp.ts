import { createHmac } from 'node:crypto';

/**
 * The authenticator app's half of TOTP (RFC 6238), so tests can clear a real MFA
 * challenge against the real local Supabase.
 *
 * This is not a stand-in for anything under test. The thing being tested is whether the
 * dashboard demands and honours a second factor; the phone in a leader's pocket is the
 * external party, and this is the smallest honest impersonation of it. Supabase Auth
 * still generates the secret, still runs the challenge, and still decides whether the
 * code is right.
 */
export function totpCode(
  base32Secret: string,
  atMs: number = Date.now(),
): string {
  const counter = Math.floor(atMs / 1000 / 30);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));

  const digest = createHmac('sha1', base32Decode(base32Secret))
    .update(message)
    .digest();

  // Dynamic truncation, per the RFC: the low nibble of the last byte picks the offset.
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return String(binary % 1_000_000).padStart(6, '0');
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(input: string): Buffer {
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const character of input.replace(/=+$/, '').toUpperCase()) {
    const index = ALPHABET.indexOf(character);
    if (index === -1) continue;

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}
