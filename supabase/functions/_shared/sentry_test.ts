import { assertEquals } from 'jsr:@std/assert@1';

import { captureEdgeError } from './sentry.ts';

// Crash reporting for edge functions (W2.10). What is asserted here is the OFF state, which
// is the one every environment except production is in: no SENTRY_DSN means no init, no
// network, and above all no throw, because this helper sits inside the catch block that is
// already handling somebody's failed request.
//
// The sending path is not asserted here on purpose: CI runs `deno test --allow-net=none`
// (`21` §4), so a test that proved delivery would need the network this suite deliberately
// forbids. It is verified against the real project in the device pass instead.

// Nothing here reads or writes Deno.env: this suite runs with no permissions at all, which
// is itself the point. The first version deleted SENTRY_DSN to set up the off state and
// failed on the permission that `deno test` does not grant, which is how the env read ended
// up guarded inside sentry.ts rather than able to throw out of a catch block.

Deno.test('without a DSN it is a silent no-op', async () => {
  // The failure a job would hand it, and a shape that is not an Error at all.
  await captureEdgeError('verse-monitor', new Error('batch failed'));
  await captureEdgeError('contact-form', 'not even an error');

  assertEquals(true, true);
});

Deno.test('it never throws, whatever it is handed', async () => {
  let threw = false;
  try {
    await captureEdgeError('photo-guard', undefined);
    await captureEdgeError('youtube-sync', { circular: {} });
  } catch {
    threw = true;
  }

  // A report that can throw turns a handled failure into an unhandled one, which is the
  // opposite of the job.
  assertEquals(threw, false);
});
