import { FunctionsHttpError } from '@supabase/supabase-js';

import { keyFor, sendContactMessage } from '../contactForm';

/**
 * The one sender behind CONTACT and the registration sheet (W4.18 slice 3).
 *
 * Two things are worth proving here. The KEY RULE, because it is the part most likely to
 * be simplified wrongly later: a key tied to the tap duplicates, a key tied to the screen
 * swallows a rephrased message, so it is tied to the words. And the OUTCOMES, because the
 * screens' tests mock this module and so trust it to have read the wire right.
 */

const mockInvoke = jest.fn<Promise<{ error: unknown }>, [string, unknown]>(() =>
  Promise.resolve({ error: null }),
);
jest.mock('@/lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: (name: string, options: unknown) => mockInvoke(name, options),
    },
  },
}));

// `mock`-prefixed so the hoisted factory may reach it (jest's out-of-scope rule).
const mockMinted = { n: 0 };
jest.mock('@/lib/contactKey', () => ({
  mintContactKey: () => `key-${String(++mockMinted.n)}`,
}));

const MESSAGE = {
  name: 'Ada Member',
  email: 'ada@example.com',
  message: 'Planning a visit to the Berlin branch.',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockMinted.n = 0;
});

describe('keyFor', () => {
  test('a first send mints a key', () => {
    expect(keyFor(MESSAGE, null).key).toBe('key-1');
  });

  test('the same words keep the same key, so a retry cannot send twice', () => {
    const first = keyFor(MESSAGE, null);
    expect(keyFor(MESSAGE, first)).toBe(first);
    // Whitespace is not a different message: the schema trims it before it is sent.
    expect(
      keyFor({ ...MESSAGE, message: `  ${MESSAGE.message}  ` }, first).key,
    ).toBe(first.key);
  });

  test('changed words mint a new key, so a rephrased message is never swallowed', () => {
    const first = keyFor(MESSAGE, null);
    const rephrased = keyFor(
      { ...MESSAGE, message: 'Planning a visit to Glasgow instead.' },
      first,
    );
    expect(rephrased.key).not.toBe(first.key);
    // And so does a changed reply address: a different sender is a different message.
    expect(
      keyFor({ ...MESSAGE, email: 'other@example.com' }, first).key,
    ).not.toBe(first.key);
  });
});

describe('sendContactMessage', () => {
  test('the key travels as the Idempotency-Key header', async () => {
    await expect(sendContactMessage(MESSAGE, 'key-x')).resolves.toBe('sent');
    expect(mockInvoke).toHaveBeenCalledWith('contact-form', {
      body: MESSAGE,
      headers: { 'Idempotency-Key': 'key-x' },
    });
  });

  test('a rate limit is reported as such', async () => {
    mockInvoke.mockResolvedValueOnce({
      error: new FunctionsHttpError(
        new Response(JSON.stringify({ ok: false, error: 'rate_limited' }), {
          status: 429,
        }),
      ),
    });
    await expect(sendContactMessage(MESSAGE, 'k')).resolves.toBe(
      'rate_limited',
    );
  });

  test('any other refusal the function made is a failure: nothing was sent', async () => {
    mockInvoke.mockResolvedValueOnce({
      error: new FunctionsHttpError(
        new Response(JSON.stringify({ ok: false, error: 'send_failed' }), {
          status: 502,
        }),
      ),
    });
    await expect(sendContactMessage(MESSAGE, 'k')).resolves.toBe('failed');
  });

  test('an answer that never arrived is unconfirmed, never "failed" and never "offline"', async () => {
    // supabase-js wraps a fetch-level failure (an abort, no network, a dropped
    // connection) in an error that is NOT a FunctionsHttpError.
    mockInvoke.mockResolvedValueOnce({ error: new Error('Aborted') });
    await expect(sendContactMessage(MESSAGE, 'k')).resolves.toBe('unconfirmed');
    mockInvoke.mockRejectedValueOnce(new TypeError('Network request failed'));
    await expect(sendContactMessage(MESSAGE, 'k')).resolves.toBe('unconfirmed');
  });
});
