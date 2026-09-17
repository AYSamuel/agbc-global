import { functionErrorCode } from '../functionError';

// Reading a refusal out of an edge function's answer.
//
// THE CASE THAT MATTERS IS `deviceResponse`. Both call sites used to require
// `context instanceof Response`, and the suites that covered them built a real
// `Response`, so they passed while the device failed every time: React Native's
// fetch hands back an object that answers `.json()` and carries a `status` but
// is not an instance of our `Response`. That one false check swallowed every
// photo-guard verdict and the contact form's rate-limit code, on every build
// ever shipped. So the fixture here is deliberately NOT a Response.

/** What the device actually produces: a body-bearing object, no prototype of
 * ours. Passing this through an `instanceof Response` gate returns null. */
function deviceResponse(body: unknown, status = 429): object {
  return {
    status,
    ok: false,
    json: () => Promise.resolve(body),
  };
}

describe('functionErrorCode', () => {
  test('reads the code off a response that is NOT a Response instance', async () => {
    await expect(
      functionErrorCode({
        context: deviceResponse({ ok: false, error: 'rate_limited' }),
      }),
    ).resolves.toBe('rate_limited');
  });

  test('reads it off a real Response too, so node and device agree', async () => {
    const context = new Response(
      JSON.stringify({ ok: false, error: 'not_an_image' }),
      {
        status: 422,
      },
    );
    await expect(functionErrorCode({ context })).resolves.toBe('not_an_image');
  });

  test('a body without our shape is no code, not a guess', async () => {
    await expect(
      functionErrorCode({ context: deviceResponse({ message: 'nope' }) }),
    ).resolves.toBeNull();
    await expect(
      functionErrorCode({ context: deviceResponse({ error: 42 }) }),
    ).resolves.toBeNull();
  });

  test('a body that will not parse is no code either', async () => {
    const context = {
      status: 502,
      json: () => Promise.reject(new Error('Unexpected token < in JSON')),
    };
    await expect(functionErrorCode({ context })).resolves.toBeNull();
  });

  test('anything that cannot be asked for JSON is null', async () => {
    // A relay fault, a fetch failure, a bare Error: no context, or a context
    // that is not a body at all.
    await expect(functionErrorCode(new Error('offline'))).resolves.toBeNull();
    await expect(
      functionErrorCode({ context: 'not an object' }),
    ).resolves.toBeNull();
    await expect(functionErrorCode({ context: null })).resolves.toBeNull();
    await expect(functionErrorCode(null)).resolves.toBeNull();
    await expect(functionErrorCode(undefined)).resolves.toBeNull();
  });
});
