import { optionalEnv } from './env.ts';

/**
 * Constant-time string comparison: hash both sides first so the XOR loop always
 * runs over equal-length digests regardless of input lengths. Used for every
 * secret-vs-presented check (API keys, review code).
 */
export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(a)),
    crypto.subtle.digest('SHA-256', encoder.encode(b)),
  ]);

  const x = new Uint8Array(left);
  const y = new Uint8Array(right);
  let diff = 0;
  for (let i = 0; i < x.length; i += 1) diff |= x[i] ^ y[i];
  return diff === 0;
}

/**
 * The platform's key-dictionary envs (SUPABASE_SECRET_KEYS, SUPABASE_PUBLISHABLE_KEYS)
 * are JSON objects of name -> key, one entry per currently-valid key. Absent or
 * malformed parses to no keys at all, so a misconfigured environment refuses callers
 * instead of throwing a 500 out of an auth check (fail closed, security standard).
 */
function keysFrom(dictionaryJson: string | null): string[] {
  if (!dictionaryJson) return [];
  try {
    const parsed: unknown = JSON.parse(dictionaryJson);
    if (parsed === null || typeof parsed !== 'object') return [];
    return Object.values(parsed).filter(
      (value): value is string => typeof value === 'string' && value.length > 0,
    );
  } catch {
    return [];
  }
}

async function matchesAny(presented: string, keys: string[]): Promise<boolean> {
  for (const key of keys) {
    if (await timingSafeEqual(presented, key)) return true;
  }
  return false;
}

/**
 * Pure decision core for the job functions' gate, env-free so the no-permission test
 * suite can drive it (ADR 0024, implemented at Track P Phase 2).
 *
 * Two acceptance paths, deliberately:
 * - `apikey` against every key in the SUPABASE_SECRET_KEYS dictionary. This is the
 *   live path: `jobs.invoke_edge_function` sends the vault's sb_secret_ key in that
 *   header (new keys are not JWTs and may not travel as Bearer). Iterating the
 *   dictionary is what buys overlapping rotation, which the single legacy key never
 *   allowed.
 * - The legacy service-role JWT as `Authorization: Bearer`, compared against this
 *   function's own env copy. Kept for the transition (local scripts still send it);
 *   it dies when the legacy keys are disabled. On production this branch also
 *   happens to be inert for a subtler reason, recorded in migration
 *   20260819100000: the platform stamps SUPABASE_SERVICE_ROLE_KEY at provisioning
 *   and never refreshes it, so it can hold a different issuance of the key than the
 *   dashboard shows, and legacy keys can no longer be rotated to reconverge them.
 */
export async function isServiceCaller(
  headers: { apikey: string | null; authorization: string | null },
  env: { secretKeysJson: string | null; serviceRoleKey: string | null },
): Promise<boolean> {
  const presented = (headers.apikey ?? '').trim();
  if (
    presented && (await matchesAny(presented, keysFrom(env.secretKeysJson)))
  ) {
    return true;
  }

  const bearer = (headers.authorization ?? '').replace(/^Bearer\s+/i, '')
    .trim();
  if (bearer && env.serviceRoleKey) {
    return timingSafeEqual(bearer, env.serviceRoleKey);
  }

  return false;
}

// Job functions are cron/service-invoked only (docs/spec/21 §5). With
// verify_jwt = false (ADR 0024) this check IS the whole gate, and it is
// deliberately narrower than the old platform gate ever was: that one admitted
// any valid project JWT, the anon key included.
export async function isServiceRoleRequest(req: Request): Promise<boolean> {
  return isServiceCaller(
    {
      apikey: req.headers.get('apikey'),
      authorization: req.headers.get('authorization'),
    },
    {
      secretKeysJson: optionalEnv('SUPABASE_SECRET_KEYS'),
      serviceRoleKey: optionalEnv('SUPABASE_SERVICE_ROLE_KEY'),
    },
  );
}

/**
 * Pure decision core for the anon-callable functions (review-signin, contact-form).
 *
 * With verify_jwt off these check the `apikey` header themselves: any key from the
 * SUPABASE_PUBLISHABLE_KEYS dictionary, or the legacy anon key while the app still
 * sends it (until the Phase 4 EAS env swap). The publishable key is public by design,
 * so this gate is about well-formed clients rather than secrecy; the real controls
 * are the rate limits, the zod validation and the constant-time review-code
 * comparison (ADR 0024, "what gets weaker, stated plainly").
 */
export async function isPublishableCaller(
  apikeyHeader: string | null,
  env: { publishableKeysJson: string | null; anonKey: string | null },
): Promise<boolean> {
  const presented = (apikeyHeader ?? '').trim();
  if (!presented) return false;

  if (await matchesAny(presented, keysFrom(env.publishableKeysJson))) {
    return true;
  }
  if (env.anonKey) return timingSafeEqual(presented, env.anonKey);
  return false;
}

export async function hasClientApiKey(req: Request): Promise<boolean> {
  return isPublishableCaller(req.headers.get('apikey'), {
    publishableKeysJson: optionalEnv('SUPABASE_PUBLISHABLE_KEYS'),
    anonKey: optionalEnv('SUPABASE_ANON_KEY'),
  });
}

export function unauthorized(): Response {
  return Response.json(
    { error: 'service invocations only' },
    { status: 401 },
  );
}
