import { afterAll, expect, test } from 'vitest';

import { authorize } from '@/server/authorize';
import { createCaller, deleteCaller, type TestCaller } from '@/test/callers';

import { POST } from './route';

/**
 * The harness proof: a Next route handler is a plain function from Request to Response,
 * so a test imports it and calls it. No dev server, no HTTP, no framework mocking. Every
 * moderation route in slices 2 and 3 gets probed exactly this way (docs/spec/21 §4).
 */

const minted: TestCaller[] = [];

afterAll(async () => {
  await Promise.all(minted.map(deleteCaller));
});

async function signedInLeader(): Promise<TestCaller> {
  const leader = await createCaller({ role: 'leader', mfa: 'verified' });
  minted.push(leader);
  return leader;
}

function signOutRequest(
  caller: TestCaller,
  headers: Record<string, string>,
): Request {
  return new Request('http://localhost:3000/auth/sign-out', {
    method: 'POST',
    headers: { cookie: caller.cookieHeader, ...headers },
  });
}

test('a same-origin POST signs the caller out and sends them to sign-in', async () => {
  const leader = await signedInLeader();

  const response = await POST(
    signOutRequest(leader, { 'sec-fetch-site': 'same-origin' }),
  );

  expect(response.status).toBe(303);
  expect(response.headers.get('location')).toBe('/sign-in');

  // Not just "the response cleared a cookie": the session itself is gone server-side,
  // so a copy of the old cookie taken beforehand is worthless.
  const verdict = await authorize(leader.serverClient(), {
    action: 'access_dashboard',
  });
  expect(verdict).toMatchObject({ ok: false, reason: 'unauthenticated' });
});

test('a cross-site POST is refused, and the session survives it', async () => {
  // CSRF: without this check, any page on the internet could sign a leader out mid-
  // moderation just by posting a form at this URL with their cookies attached.
  const leader = await signedInLeader();

  const response = await POST(
    signOutRequest(leader, {
      'sec-fetch-site': 'cross-site',
      origin: 'https://evil.example',
    }),
  );

  expect(response.status).toBe(403);

  const verdict = await authorize(leader.serverClient(), {
    action: 'access_dashboard',
  });
  expect(verdict.ok).toBe(true);
});

test('a request with no origin signal at all is refused, not trusted', async () => {
  // Fails closed. An old client that sends neither Sec-Fetch-Site nor Origin gets a
  // refusal rather than the benefit of the doubt.
  const leader = await signedInLeader();

  const response = await POST(signOutRequest(leader, {}));

  expect(response.status).toBe(403);
});

test('a cross-origin POST that lies only in Origin is refused', async () => {
  const leader = await signedInLeader();

  const response = await POST(
    signOutRequest(leader, {
      origin: 'https://evil.example',
      host: 'localhost:3000',
    }),
  );

  expect(response.status).toBe(403);
});
