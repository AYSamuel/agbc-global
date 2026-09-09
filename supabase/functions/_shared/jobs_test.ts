import { assertEquals } from 'jsr:@std/assert@1';
import type { SupabaseClient } from '@supabase/supabase-js';

import { claimJobLease, releaseJobLease } from './jobs.ts';

// The lease dance under a gateway blip (2026-09-08: five of the day's seventeen 504s landed
// on claim_job_lease). These go through the REAL retry defaults, so each spends up to a
// second in a real timer: the point is that jobs.ts wired the helper, not the helper's own
// arithmetic, which retry_test.ts covers without timers.

interface Answer {
  data: unknown;
  error: { message: string; code: string } | null;
  status: number;
}

const gatewayTimeout: Answer = {
  data: null,
  error: { message: 'Gateway Timeout', code: '' },
  status: 504,
};

/** A client whose rpc() answers from a script and remembers what it was asked. */
function fakeClient(answers: Answer[]) {
  const calls: Array<{ name: string; args: unknown }> = [];
  const client = {
    rpc: (name: string, args: unknown) => {
      calls.push({ name, args });
      const answer = answers[Math.min(calls.length - 1, answers.length - 1)];
      return Promise.resolve(answer);
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

Deno.test('the lease claim survives one gateway blip', async () => {
  const { client, calls } = fakeClient([
    gatewayTimeout,
    { data: true, error: null, status: 200 },
  ]);

  const claimed = await claimJobLease(client, 'event-notices', '10 minutes');

  assertEquals(claimed, true);
  assertEquals(calls.length, 2);
  assertEquals(calls[0], {
    name: 'claim_job_lease',
    args: { job_name: 'event-notices', lease: '10 minutes' },
  });
  // The retry is the same request again, not a different one.
  assertEquals(calls[1], calls[0]);
});

Deno.test('a held lease is still a plain false, asked once', async () => {
  const { client, calls } = fakeClient([{ data: false, error: null, status: 200 }]);

  assertEquals(await claimJobLease(client, 'event-notices', '10 minutes'), false);
  assertEquals(calls.length, 1);
});

Deno.test('a refused claim still throws the same words, without retrying', async () => {
  const { client, calls } = fakeClient([
    {
      data: null,
      error: { message: 'permission denied for function claim_job_lease', code: '42501' },
      status: 403,
    },
  ]);

  let message = '';
  try {
    await claimJobLease(client, 'event-notices', '10 minutes');
  } catch (error) {
    message = error instanceof Error ? error.message : 'not an Error';
  }

  assertEquals(message, 'lease failed: permission denied for function claim_job_lease');
  assertEquals(calls.length, 1);
});

Deno.test('the release survives one gateway blip, and never throws either way', async () => {
  const { client, calls } = fakeClient([
    gatewayTimeout,
    { data: null, error: null, status: 204 },
  ]);

  await releaseJobLease(client, 'event-notices');

  assertEquals(calls.length, 2);
  assertEquals(calls[1], { name: 'release_job_lease', args: { job_name: 'event-notices' } });
});
