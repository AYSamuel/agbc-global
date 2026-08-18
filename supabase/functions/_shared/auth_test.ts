import { assertEquals } from 'jsr:@std/assert@1';

import { isPublishableCaller, isServiceCaller } from './auth.ts';

// Caller auth for the new API keys (ADR 0024, pulled forward at Track P Phase 2).
//
// What is under test is the pure decision core, not the Request-reading wrappers: this
// suite runs with no permissions at all (see sentry_test.ts for why), so the env reads
// stay in the wrappers and every combination of keys arrives here as plain arguments.
//
// The dictionaries are the platform's own shape: SUPABASE_SECRET_KEYS and
// SUPABASE_PUBLISHABLE_KEYS are JSON objects of name -> key, one entry per key that is
// currently valid. Iterating the values is what buys overlapping rotation: during a
// rotation both the old and the new key are in the dictionary, and both must be accepted.

const SECRETS = JSON.stringify({ default: 'sb_secret_live_one' });
const TWO_SECRETS = JSON.stringify({
  default: 'sb_secret_live_one',
  next: 'sb_secret_live_two',
});
const PUBLISHABLES = JSON.stringify({ default: 'sb_publishable_one' });
const LEGACY_SERVICE = 'legacy.service.jwt';
const LEGACY_ANON = 'legacy.anon.jwt';

Deno.test('a secret key from the dictionary, sent as apikey, is a service caller', async () => {
  assertEquals(
    await isServiceCaller(
      { apikey: 'sb_secret_live_one', authorization: null },
      { secretKeysJson: SECRETS, serviceRoleKey: LEGACY_SERVICE },
    ),
    true,
  );
});

Deno.test('EVERY key in the dictionary is valid, which is what makes rotation an overlap', async () => {
  assertEquals(
    await isServiceCaller(
      { apikey: 'sb_secret_live_two', authorization: null },
      { secretKeysJson: TWO_SECRETS, serviceRoleKey: null },
    ),
    true,
  );
});

Deno.test('the legacy service-role key as a Bearer still works during the transition', async () => {
  // Local scripts (sync-local-sermons) and anything not yet migrated send the old
  // header. This branch dies when the legacy keys are disabled, not before.
  assertEquals(
    await isServiceCaller(
      { apikey: null, authorization: `Bearer ${LEGACY_SERVICE}` },
      { secretKeysJson: SECRETS, serviceRoleKey: LEGACY_SERVICE },
    ),
    true,
  );
});

Deno.test('an apikey outside the dictionary is refused even with a wrong Bearer beside it', async () => {
  assertEquals(
    await isServiceCaller(
      { apikey: 'sb_secret_forged', authorization: 'Bearer not-the-key' },
      { secretKeysJson: SECRETS, serviceRoleKey: LEGACY_SERVICE },
    ),
    false,
  );
});

Deno.test('the anon-tier keys never clear the service gate', async () => {
  // The platform's verify_jwt gate admitted any valid project JWT, the anon key
  // included; this check exists precisely to be narrower than that.
  assertEquals(
    await isServiceCaller(
      { apikey: 'sb_publishable_one', authorization: `Bearer ${LEGACY_ANON}` },
      { secretKeysJson: SECRETS, serviceRoleKey: LEGACY_SERVICE },
    ),
    false,
  );
});

Deno.test('no headers, no entry', async () => {
  assertEquals(
    await isServiceCaller(
      { apikey: null, authorization: null },
      { secretKeysJson: SECRETS, serviceRoleKey: LEGACY_SERVICE },
    ),
    false,
  );
});

Deno.test('a malformed dictionary fails closed instead of throwing', async () => {
  // requiredEnv-style throwing here would turn a platform misconfiguration into a 500
  // on the job path; refusing is the correct failure.
  assertEquals(
    await isServiceCaller(
      { apikey: 'sb_secret_live_one', authorization: null },
      { secretKeysJson: 'not json at all', serviceRoleKey: null },
    ),
    false,
  );
});

Deno.test('an absent dictionary and absent legacy key refuse everything', async () => {
  assertEquals(
    await isServiceCaller(
      { apikey: 'sb_secret_live_one', authorization: 'Bearer anything' },
      { secretKeysJson: null, serviceRoleKey: null },
    ),
    false,
  );
});

// --- the anon-callable gate (review-signin, contact-form) ---------------------------
//
// With verify_jwt off, these two functions check the apikey header themselves. The
// publishable key is public by design (it ships in every app bundle), so this gate is
// about well-formed clients rather than secrecy: the real controls are the rate limits,
// the zod validation and the constant-time review-code comparison (ADR 0024, "what gets
// weaker"). The legacy anon key is accepted while the app still sends it (until the
// Phase 4 EAS env swap).

Deno.test('a publishable key from the dictionary clears the client gate', async () => {
  assertEquals(
    await isPublishableCaller('sb_publishable_one', {
      publishableKeysJson: PUBLISHABLES,
      anonKey: LEGACY_ANON,
    }),
    true,
  );
});

Deno.test('the legacy anon key clears the client gate during the transition', async () => {
  assertEquals(
    await isPublishableCaller(LEGACY_ANON, {
      publishableKeysJson: PUBLISHABLES,
      anonKey: LEGACY_ANON,
    }),
    true,
  );
});

Deno.test('no apikey header is refused at the client gate', async () => {
  assertEquals(
    await isPublishableCaller(null, {
      publishableKeysJson: PUBLISHABLES,
      anonKey: LEGACY_ANON,
    }),
    false,
  );
});

Deno.test('an unknown apikey is refused at the client gate', async () => {
  assertEquals(
    await isPublishableCaller('sb_publishable_forged', {
      publishableKeysJson: PUBLISHABLES,
      anonKey: LEGACY_ANON,
    }),
    false,
  );
});

Deno.test('a malformed publishable dictionary with no anon key fails closed', async () => {
  assertEquals(
    await isPublishableCaller('sb_publishable_one', {
      publishableKeysJson: '[]broken',
      anonKey: null,
    }),
    false,
  );
});
