import { assertEquals } from 'jsr:@std/assert@1';

import { courseHandoffResponseSchema } from '../../../packages/shared/src/contracts/academy.ts';
import { mintResponse, parseCourseHandoff } from './core.ts';

Deno.test('a valid slug parses and is trimmed', () => {
  assertEquals(
    parseCourseHandoff({ courseSlug: '  grace-reset  ' })?.courseSlug,
    'grace-reset',
  );
});

Deno.test('malformed bodies are rejected at the boundary', () => {
  assertEquals(parseCourseHandoff({}), null);
  assertEquals(parseCourseHandoff({ courseSlug: '' }), null);
  assertEquals(parseCourseHandoff({ courseSlug: 'Grace Reset' }), null, 'slugs are kebab');
  assertEquals(parseCourseHandoff({ courseSlug: 'x'.repeat(65) }), null);
  assertEquals(
    parseCourseHandoff({ courseSlug: 'grace-reset', profileId: 'abc' }),
    null,
    'unknown fields rejected: identity comes from the JWT, never the body',
  );
});

Deno.test('a mint carries the token and its expiry', () => {
  const mapped = mintResponse('minted', 'deadbeef', '2026-08-09T20:30:00Z');
  assertEquals(mapped.status, 200);
  assertEquals(mapped.response, {
    ok: true,
    token: 'deadbeef',
    expiresAt: '2026-08-09T20:30:00Z',
  });
});

Deno.test('refusals map to the contract, and unknown-course tells nothing extra', () => {
  assertEquals(mintResponse('already_registered', null, null).response.error, 'already_registered');
  assertEquals(mintResponse('not_open', null, null).response.error, 'not_open');
  assertEquals(mintResponse('unknown_course', null, null).response.error, 'invalid');
  assertEquals(mintResponse('refused', null, null).response.error, 'invalid');
});

Deno.test('every mapped response satisfies the shared contract', () => {
  const all = [
    mintResponse('minted', 'deadbeef', '2026-08-09T20:30:00Z').response,
    mintResponse('already_registered', null, null).response,
    mintResponse('not_open', null, null).response,
    mintResponse('unknown_course', null, null).response,
    mintResponse('refused', null, null).response,
  ];
  for (const response of all) {
    assertEquals(courseHandoffResponseSchema.safeParse(response).success, true);
  }
});
