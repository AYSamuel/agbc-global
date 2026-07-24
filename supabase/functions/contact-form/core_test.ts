import { assertEquals } from 'jsr:@std/assert@1';

import {
  contactResponseSchema,
  CONTACT_MESSAGE_MAX,
} from '../../../packages/shared/src/contracts/contact.ts';
import {
  buildEmail,
  clientKey,
  createRateLimiter,
  isBot,
  parseContact,
} from './core.ts';

const VALID = {
  name: 'Ada Member',
  email: 'ada@example.com',
  message: 'Planning a visit to the Berlin branch.',
};

Deno.test('a valid submission parses and is trimmed', () => {
  const parsed = parseContact({
    ...VALID,
    name: '  Ada Member  ',
    message: '  Planning a visit.  ',
  });
  assertEquals(parsed?.name, 'Ada Member');
  assertEquals(parsed?.message, 'Planning a visit.');
});

Deno.test('missing fields, bad emails and empty messages are rejected', () => {
  assertEquals(parseContact({}), null);
  assertEquals(parseContact({ ...VALID, email: 'not-an-email' }), null);
  assertEquals(parseContact({ ...VALID, message: '   ' }), null);
  assertEquals(parseContact('a string'), null);
});

Deno.test('an oversize message is rejected at the boundary', () => {
  const oversize = 'x'.repeat(CONTACT_MESSAGE_MAX + 1);
  assertEquals(parseContact({ ...VALID, message: oversize }), null);
});

Deno.test('unknown fields are rejected, not silently dropped', () => {
  assertEquals(parseContact({ ...VALID, role: 'admin' }), null);
});

Deno.test('a filled honeypot marks a bot; an empty one does not', () => {
  assertEquals(isBot({ ...VALID, company: 'Totally Real Ltd' }), true);
  assertEquals(isBot({ ...VALID, company: '  ' }), false);
  assertEquals(isBot(VALID), false);
});

Deno.test('the outgoing email carries reply_to and survives header injection', () => {
  const email = buildEmail(
    { ...VALID, name: 'Eve\r\nBcc: everyone@example.com' },
    'app@agbcglobal.com',
    'hello@agbcglobal.com',
  );
  assertEquals(email.from, 'app@agbcglobal.com');
  assertEquals(email.to, 'hello@agbcglobal.com');
  assertEquals(email.reply_to, VALID.email);
  assertEquals(email.subject.includes('\r'), false);
  assertEquals(email.subject.includes('\n'), false);
  assertEquals(email.text.includes(VALID.message), true);
});

Deno.test('the rate limiter blocks a flood and recovers after the window', () => {
  let clock = 0;
  const allow = createRateLimiter({
    limit: 3,
    windowMs: 1000,
    now: () => clock,
  });
  assertEquals(allow('ip-a'), true);
  assertEquals(allow('ip-a'), true);
  assertEquals(allow('ip-a'), true);
  assertEquals(allow('ip-a'), false, 'the fourth hit inside the window is refused');
  assertEquals(allow('ip-b'), true, 'another sender is unaffected');
  clock = 1500;
  assertEquals(allow('ip-a'), true, 'the window has passed; the sender may write again');
});

Deno.test('clientKey buckets by first forwarded address', () => {
  assertEquals(clientKey('203.0.113.9, 10.0.0.1'), '203.0.113.9');
  assertEquals(clientKey(null), 'unknown');
  assertEquals(clientKey('  '), 'unknown');
});

Deno.test('handler response shapes satisfy the shared contract', () => {
  assertEquals(contactResponseSchema.safeParse({ ok: true }).success, true);
  assertEquals(
    contactResponseSchema.safeParse({ ok: false, error: 'rate_limited' }).success,
    true,
  );
  assertEquals(
    contactResponseSchema.safeParse({ ok: false, error: 'weird' }).success,
    false,
  );
});
