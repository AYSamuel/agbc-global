// Deleting an account without the app (docs/spec/16 §Web deletion path, `03`, `20`; W4.5
// slice 4). Called by the church website's own API route, never by a browser.
//
// WHY THE WEBSITE DOES NOT DO THIS ITSELF. `Desktop/agbc` already holds the service key and
// could call `erase_profile` directly, and that is exactly what must not happen: the deletion
// rules would then live in two repos on two release schedules, and the website would be one
// refactor away from erasing somebody without an OTP. The website's job is the form, the
// bot wall and the rate limit; the decision to erase belongs here, next to the routine.
//
// ONE SHOT, AND NO SESSION EVER LEAVES THIS FUNCTION (docs/spec/16). Verifying the OTP
// necessarily mints a session, because that is what verifying an OTP does. It is used for
// exactly one thing, learning which user id the code proved, and then it is discarded: it is
// never returned, never persisted, and never sent to the website. It does not even have to be
// revoked, because `erase_profile` deletes every session that user has as part of the erasure
// (20260901160000 §12), so the token the confirmation created dies inside the same
// transaction that answers for it.
//
// UNIFORM RESPONSES, ALWAYS. Both actions answer `{ ok: true }` whatever happened, so neither
// can be used to ask whether an address has an account here. An address with no account, a
// wrong code and a successful erasure are indistinguishable from outside. The only non-200s
// are a refused caller and a genuine outage, neither of which says anything about a person.

import { createClient } from '@supabase/supabase-js';

import { isServiceRoleRequest, unauthorized } from '../_shared/auth.ts';
import { requiredEnv } from '../_shared/env.ts';
import { captureEdgeError } from '../_shared/sentry.ts';

/** The auth admin API is a network call; a hung one must not hold the isolate. */
const TIMEOUT_MS = 10_000;

interface RequestBody {
  action?: unknown;
  email?: unknown;
  code?: unknown;
  keepPosts?: unknown;
}

/** The same answer for every outcome. See the header. */
function done(): Response {
  return Response.json({ ok: true });
}

function client() {
  return createClient(
    requiredEnv('SUPABASE_URL'),
    requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input: URL | RequestInfo, init?: RequestInit) =>
          fetch(input, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) }),
      },
    },
  );
}

Deno.serve(async (req) => {
  // The website authenticates with the project's secret key, the same gate every job here
  // uses. A browser can never reach this function directly.
  if (!(await isServiceRoleRequest(req))) return unauthorized();

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return Response.json({ ok: false, error: 'bad_request' }, { status: 400 });
  }

  const email =
    typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (email.length === 0 || email.length > 254 || !email.includes('@')) {
    return Response.json({ ok: false, error: 'bad_request' }, { status: 400 });
  }

  try {
    if (body.action === 'request') return await sendCode(email);
    if (body.action === 'confirm') {
      const code = typeof body.code === 'string' ? body.code.trim() : '';
      if (code.length === 0) return done();
      return await confirm(email, code, body.keepPosts === true);
    }
    return Response.json({ ok: false, error: 'bad_request' }, { status: 400 });
  } catch (error) {
    // A real outage, which the website surfaces as "try again". Never PII in the log
    // (`20`): the address is the whole subject of this request.
    console.error('web-delete-account failed:', error);
    await captureEdgeError('web-delete-account', error);
    return Response.json({ ok: false, error: 'unavailable' }, { status: 503 });
  }
});

/**
 * Send the one-time code, to an address that already has an account.
 *
 * `shouldCreateUser: false` is the load-bearing option. Without it, asking to delete an
 * address that has never signed up would CREATE an account for it, so a form offering
 * erasure would be a way to make accounts for other people's inboxes.
 *
 * The member gets the ordinary sign-in code, from the ordinary template, because it is the
 * ordinary mechanism: `03` already treats a delivered code as proof of address control, and
 * inventing a second kind of code here would be a second thing to keep secure.
 */
async function sendCode(email: string): Promise<Response> {
  const { error } = await client().auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  });
  if (error) {
    // Expected for an address with no account, and for Supabase's own send-rate limits.
    // Logged without the address, and answered exactly like a success.
    console.info(`web-delete-account: request not sent (${error.code ?? 'unknown'})`);
  }
  return done();
}

/**
 * Verify the code and erase whatever it proved ownership of.
 *
 * TWO SHAPES OF ACCOUNT REACH HERE, and only one of them has a profile:
 *   * The ordinary member: `erase_profile` runs the whole of `16`'s reach.
 *   * Somebody who signed in once and never finished AUTH-3, so there is an auth user and
 *     no profile row. `erase_profile` refuses that (`no_data_found`, it takes a live
 *     profile), and leaving it there would occupy the address for ever against a promise
 *     that it can register again. Deleting the auth user outright is safe precisely because
 *     there is no profile: nothing cascades, because nothing points at it.
 */
async function confirm(
  email: string,
  code: string,
  keepPosts: boolean,
): Promise<Response> {
  const supabase = client();
  const verified = await supabase.auth.verifyOtp({
    email,
    token: code,
    type: 'email',
  });

  const userId = verified.data.user?.id;
  if (verified.error || userId === undefined) {
    console.info(
      `web-delete-account: code refused (${verified.error?.code ?? 'no user'})`,
    );
    return done();
  }

  const { error } = await supabase.rpc('erase_profile', {
    p_profile_id: userId,
    p_keep_posts: keepPosts,
  });

  if (error) {
    // `no_data_found` is the half-finished signup above, and it is not a failure.
    if (error.code === 'P0002') {
      const removed = await supabase.auth.admin.deleteUser(userId);
      if (removed.error) throw new Error(removed.error.message);
      console.info('web-delete-account: erased an account with no profile');
      return done();
    }
    throw new Error(error.message);
  }

  console.info('web-delete-account: erased an account from the web');
  return done();
}
