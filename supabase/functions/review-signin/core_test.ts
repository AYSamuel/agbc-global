import { assertEquals } from 'jsr:@std/assert@1';

import { timingSafeEqual } from '../_shared/auth.ts';
import { isAllowedAttempt, parseReviewSignin } from './core.ts';

const CODE = '428913'; // the 6-digit fixed shape (docs/spec/03)
const CONFIG = {
  enabled: true,
  reviewEmail: 'review@agbcglobal.com',
  reviewCode: CODE,
};
const REQUEST = { email: 'review@agbcglobal.com', code: CODE };

Deno.test('parse: accepts a valid request', () => {
  assertEquals(
    parseReviewSignin({ email: 'a@b.com', code: 'x'.repeat(24) }),
    { email: 'a@b.com', code: 'x'.repeat(24) },
  );
});

Deno.test('parse: rejects a non-email, an empty code, and unknown fields', () => {
  assertEquals(parseReviewSignin({ email: 'not-an-email', code: CODE }), null);
  assertEquals(parseReviewSignin({ email: 'a@b.com', code: '' }), null);
  assertEquals(
    parseReviewSignin({ email: 'a@b.com', code: CODE, extra: true }),
    null,
  );
});

Deno.test('parse: rejects an oversized code', () => {
  assertEquals(
    parseReviewSignin({ email: 'a@b.com', code: 'x'.repeat(129) }),
    null,
  );
});

Deno.test('allow: the exact allowlisted email + code passes', async () => {
  assertEquals(await isAllowedAttempt(CONFIG, REQUEST), true);
});

Deno.test('allow: email match is case-insensitive', async () => {
  assertEquals(
    await isAllowedAttempt(CONFIG, { ...REQUEST, email: 'Review@AGBCglobal.com' }),
    true,
  );
});

Deno.test('deny: flag off denies even the correct pair', async () => {
  assertEquals(
    await isAllowedAttempt({ ...CONFIG, enabled: false }, REQUEST),
    false,
  );
});

Deno.test('deny: missing configuration denies (fail closed)', async () => {
  assertEquals(
    await isAllowedAttempt({ ...CONFIG, reviewEmail: null }, REQUEST),
    false,
  );
  assertEquals(
    await isAllowedAttempt({ ...CONFIG, reviewCode: null }, REQUEST),
    false,
  );
});

Deno.test('deny: a configured code below the length floor denies its own exact match', async () => {
  const short = '12345';
  assertEquals(
    await isAllowedAttempt(
      { ...CONFIG, reviewCode: short },
      { ...REQUEST, code: short },
    ),
    false,
  );
});

Deno.test('deny: any other email denies', async () => {
  assertEquals(
    await isAllowedAttempt(CONFIG, { ...REQUEST, email: 'member@test.local' }),
    false,
  );
});

Deno.test('deny: a wrong code denies', async () => {
  assertEquals(
    await isAllowedAttempt(CONFIG, { ...REQUEST, code: CODE.slice(0, -1) + '_' }),
    false,
  );
});

Deno.test('timingSafeEqual: equal, unequal, and different-length inputs', async () => {
  assertEquals(await timingSafeEqual('abc', 'abc'), true);
  assertEquals(await timingSafeEqual('abc', 'abd'), false);
  assertEquals(await timingSafeEqual('abc', 'abcdef'), false);
});
