import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';

import {
  DEFAULT_BACKOFF_MS,
  isTransient,
  jitteredDelay,
  retryTransient,
  type RestResult,
} from './retry.ts';

// The gateway blip of 2026-09-08, as a table: what postgrest-js hands a job when the API
// gateway answers instead of PostgREST, and what it hands it when PostgREST itself refuses.
// The helper must tell the two apart by STATUS, because the message is the gateway's
// ("Gateway Timeout") and the code is empty.

interface Answer extends RestResult {
  data: unknown;
}

const gatewayTimeout: Answer = {
  data: null,
  error: { message: 'Gateway Timeout', details: '', hint: '', code: '' },
  status: 504,
};

const fetchThrew: Answer = {
  data: null,
  error: { message: 'TypeError: error sending request', details: '', hint: '', code: '' },
  status: 0,
};

const refused: Answer = {
  data: null,
  error: { message: 'permission denied for function claim_job_lease', code: '42501' },
  status: 403,
};

const ok: Answer = { data: true, error: null, status: 200 };

/** A call that answers from a script, and remembers how often it was asked. */
function scripted(answers: Answer[]) {
  let calls = 0;
  return {
    call: () => {
      const answer = answers[Math.min(calls, answers.length - 1)];
      calls += 1;
      return Promise.resolve(answer);
    },
    count: () => calls,
  };
}

/** No real timers: the waits are recorded, and the jitter is pinned to the midpoint. */
function harness() {
  const waits: number[] = [];
  const lines: string[] = [];
  return {
    waits,
    lines,
    options: {
      label: 'event-notices: due read',
      sleep: (ms: number) => {
        waits.push(ms);
        return Promise.resolve();
      },
      random: () => 0.5,
      log: (line: string) => {
        lines.push(line);
      },
    },
  };
}

Deno.test('a clean answer is returned untouched, with no wait', async () => {
  const { call, count } = scripted([ok]);
  const h = harness();

  const result = await retryTransient(call, h.options);

  assertEquals(result, ok);
  assertEquals(count(), 1);
  assertEquals(h.waits, []);
  assertEquals(h.lines, []);
});

Deno.test('a gateway 504 is retried, and the second answer wins', async () => {
  const { call, count } = scripted([gatewayTimeout, ok]);
  const h = harness();

  const result = await retryTransient(call, h.options);

  assertEquals(result, ok);
  assertEquals(count(), 2);
  // The first backoff of 1 s, at the jitter midpoint.
  assertEquals(h.waits, [750]);
  assertEquals(h.lines.length, 1);
  assertStringIncludes(h.lines[0], 'event-notices: due read');
  assertStringIncludes(h.lines[0], 'answered 504');
  assertStringIncludes(h.lines[0], 'attempt 1 of 3');
});

Deno.test('a fetch that threw (status 0) is the same blip from the other side', async () => {
  const { call, count } = scripted([fetchThrew, ok]);
  const h = harness();

  const result = await retryTransient(call, h.options);

  assertEquals(result, ok);
  assertEquals(count(), 2);
  assertStringIncludes(h.lines[0], 'no response from the API gateway');
});

Deno.test('a refused request is answered once and never repeated', async () => {
  // 42501 is PostgREST relaying Postgres. Retrying it would be a hot loop on a bug, and the
  // caller's own error message is what the operator needs to see.
  const { call, count } = scripted([refused, ok]);
  const h = harness();

  const result = await retryTransient(call, h.options);

  assertEquals(result, refused);
  assertEquals(count(), 1);
  assertEquals(h.waits, []);
});

Deno.test("a 500 with PostgREST's own body is not a gateway failure", async () => {
  const { call, count } = scripted([
    { data: null, error: { message: 'canceling statement', code: '57014' }, status: 500 },
    ok,
  ]);
  const h = harness();

  await retryTransient(call, h.options);

  assertEquals(count(), 1);
});

Deno.test('it gives up after the budget and returns the LAST answer', async () => {
  // Three attempts by default (the call plus DEFAULT_BACKOFF_MS.length retries), then the
  // caller throws exactly what it would have thrown without this module.
  const { call, count } = scripted([gatewayTimeout]);
  const h = harness();

  const result = await retryTransient(call, h.options);

  assertEquals(result, gatewayTimeout);
  assertEquals(count(), DEFAULT_BACKOFF_MS.length + 1);
  assertEquals(h.waits, [750, 1500]);
  assertEquals(h.lines.length, 2);
  assertStringIncludes(h.lines[1], 'attempt 2 of 3');
});

Deno.test('the budget is the caller\'s to shorten', async () => {
  const { call, count } = scripted([gatewayTimeout]);
  const h = harness();

  await retryTransient(call, { ...h.options, backoffMs: [100] });

  assertEquals(count(), 2);
  assertEquals(h.waits, [75]);
});

Deno.test('the log line names the call and the status, never the body', async () => {
  // The error message is whatever the gateway put in the response. Today that is "Gateway
  // Timeout"; a different gateway page could carry anything, and `20` keeps upstream bodies
  // out of the function logs.
  const leaky: Answer = {
    data: null,
    error: { message: 'html page mentioning somebody@example.com', code: '' },
    status: 502,
  };
  const { call } = scripted([leaky, ok]);
  const h = harness();

  await retryTransient(call, h.options);

  assertEquals(h.lines.length, 1);
  assertEquals(h.lines[0].includes('example.com'), false);
  assertStringIncludes(h.lines[0], 'answered 502');
});

Deno.test('isTransient needs both a gateway status and an error', () => {
  assertEquals(isTransient(gatewayTimeout), true);
  assertEquals(isTransient(fetchThrew), true);
  assertEquals(isTransient({ error: { message: 'x' }, status: 503 }), true);
  assertEquals(isTransient(refused), false);
  assertEquals(isTransient(ok), false);
  // A 504 with no error is not a shape postgrest-js produces; if it ever did, the caller's
  // `if (error)` would not throw either, and a retry would be a second request for nothing.
  assertEquals(isTransient({ error: null, status: 504 }), false);
});

Deno.test('jitter keeps a wait between half the base and the whole of it', () => {
  assertEquals(jitteredDelay(1_000, () => 0), 500);
  assertEquals(jitteredDelay(1_000, () => 0.5), 750);
  assertEquals(jitteredDelay(1_000, () => 0.999), 1_000);
  assertEquals(jitteredDelay(2_000, () => 0.25), 1_250);
});
