import { assertEquals } from 'jsr:@std/assert@1';

import { emailClaimResponseSchema } from '../../../packages/shared/src/contracts/academy.ts';
import {
  buildClaimEmail,
  parseEmailClaim,
  requestResponse,
  verifyResponse,
} from './core.ts';

const REQUEST = { action: 'request', email: 'second@example.com' };
const VERIFY = { action: 'verify', email: 'second@example.com', code: '123456' };

Deno.test('valid request and verify bodies parse; the email is trimmed', () => {
  assertEquals(
    parseEmailClaim({ ...REQUEST, email: '  second@example.com  ' })?.email,
    'second@example.com',
  );
  assertEquals(parseEmailClaim(VERIFY)?.action, 'verify');
});

Deno.test('the language is bounded to the four locales', () => {
  const parsed = parseEmailClaim({ ...REQUEST, language: 'de' });
  assertEquals(parsed?.action === 'request' ? parsed.language : null, 'de');
  assertEquals(parseEmailClaim({ ...REQUEST, language: 'xx' }), null);
});

Deno.test('malformed bodies are rejected at the boundary', () => {
  assertEquals(parseEmailClaim({}), null);
  assertEquals(parseEmailClaim({ action: 'request', email: 'not-an-email' }), null);
  assertEquals(parseEmailClaim({ action: 'verify', email: 'a@b.com' }), null, 'verify needs a code');
  assertEquals(
    parseEmailClaim({ action: 'verify', email: 'a@b.com', code: '12345' }),
    null,
    'codes are exactly six digits',
  );
  assertEquals(
    parseEmailClaim({ action: 'verify', email: 'a@b.com', code: 'abcdef' }),
    null,
    'codes are numeric',
  );
  assertEquals(parseEmailClaim({ ...REQUEST, extra: true }), null, 'unknown fields rejected');
});

Deno.test('a created claim wants a send; every other outcome does not', () => {
  assertEquals(requestResponse('created').send, true);
  assertEquals(requestResponse('already_verified').send, false);
  assertEquals(requestResponse('address_in_use').send, false);
  assertEquals(requestResponse('rate_limited').send, false);
  assertEquals(requestResponse('refused').send, false);
});

Deno.test('request refusals map to the contract, uniformly', () => {
  assertEquals(requestResponse('created').response, { ok: true });
  assertEquals(requestResponse('already_verified').response, { ok: true, verified: true });
  assertEquals(requestResponse('address_in_use').response, {
    ok: false,
    error: 'address_in_use',
  });
  assertEquals(requestResponse('rate_limited').status, 429);
});

Deno.test('verify outcomes map to the contract, and no_claim reads as a wrong code', () => {
  assertEquals(verifyResponse('verified', 2).response, {
    ok: true,
    verified: true,
    linked: 2,
  });
  assertEquals(verifyResponse('invalid_code', 0).response.error, 'invalid_code');
  assertEquals(verifyResponse('expired', 0).response.error, 'expired');
  assertEquals(verifyResponse('too_many_attempts', 0).response.error, 'too_many_attempts');
  assertEquals(
    verifyResponse('no_claim', 0).response.error,
    'invalid_code',
    'no live claim answers exactly like a wrong code: the remedy is the same',
  );
  assertEquals(verifyResponse('address_in_use', 0).status, 409);
});

Deno.test('every mapped response satisfies the shared contract', () => {
  const all = [
    requestResponse('created').response,
    requestResponse('already_verified').response,
    requestResponse('address_in_use').response,
    requestResponse('rate_limited').response,
    requestResponse('refused').response,
    verifyResponse('verified', 1).response,
    verifyResponse('invalid_code', 0).response,
    verifyResponse('expired', 0).response,
    verifyResponse('too_many_attempts', 0).response,
    verifyResponse('no_claim', 0).response,
    verifyResponse('address_in_use', 0).response,
  ];
  for (const response of all) {
    assertEquals(emailClaimResponseSchema.safeParse(response).success, true);
  }
});

Deno.test('the claim email carries the code, its validity, and what entering it does', () => {
  for (const language of ['en', 'de', 'nl', 'fr'] as const) {
    const email = buildClaimEmail('654321', language, 'app@agbcglobal.com', 'to@example.com');
    assertEquals(email.from, 'app@agbcglobal.com');
    assertEquals(email.to, 'to@example.com');
    assertEquals(email.subject.includes('654321'), true);
    assertEquals(email.text.includes('654321'), true);
    assertEquals(email.text.includes('15'), true, 'validity is stated');
    assertEquals(
      email.text.includes('to@example.com'),
      false,
      'the address is never echoed into the body',
    );
  }
});
