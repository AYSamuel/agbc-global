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
 * malformed parses to an EMPTY dictionary, so a misconfigured environment refuses
 * callers instead of throwing a 500 out of an auth check (fail closed, security
 * standard).
 *
 * The names are kept rather than thrown away because the two directions need
 * different things from them: checking who called us iterates every value (that is
 * what makes a rotation an overlap), while deciding what WE send has to pick one,
 * and it picks `default`.
 */
function dictionaryFrom(dictionaryJson: string | null): Record<string, string> {
  if (!dictionaryJson) return {};
  try {
    const parsed: unknown = JSON.parse(dictionaryJson);
    if (parsed === null || typeof parsed !== 'object') return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] =>
          typeof entry[1] === 'string' && entry[1].length > 0,
      ),
    );
  } catch {
    return {};
  }
}

function keysFrom(dictionaryJson: string | null): string[] {
  return Object.values(dictionaryFrom(dictionaryJson));
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

// ---------------------------------------------------------------------------
// Calling the platform's own REST surfaces by hand
// ---------------------------------------------------------------------------
// The two above decide who may call US. These decide how WE call Storage or
// PostgREST when the request is built here instead of by supabase-js, which is
// rare: photo-guard's ranged read is the only one in this repo, because the
// verdict needs 8 bytes and storage-js cannot ask for a range.

/** Which credential the outgoing request ended up carrying. Logged on failure so
 * a refusal says which key was refused; never the key itself. */
export type ServiceKeyKind = 'secret' | 'legacy' | 'none';

export interface ServiceApiKey {
  key: string | null;
  kind: ServiceKeyKind;
}

/**
 * The key to present, preferring the `sb_secret_` one and falling back to the
 * legacy service-role JWT, which is all a legacy-only stack has.
 *
 * `default` wins where the dictionary names it (ADR 0024 records that shape), so
 * a rotation that adds a second key does not quietly change which one outgoing
 * calls carry.
 */
export function serviceApiKeyFrom(env: {
  secretKeysJson: string | null;
  serviceRoleKey: string | null;
}): ServiceApiKey {
  const secrets = dictionaryFrom(env.secretKeysJson);
  const preferred = secrets.default ?? Object.values(secrets)[0];
  if (typeof preferred === 'string' && preferred.length > 0) {
    return { key: preferred, kind: 'secret' };
  }
  if (env.serviceRoleKey) return { key: env.serviceRoleKey, kind: 'legacy' };
  return { key: null, kind: 'none' };
}

export function serviceApiKey(): ServiceApiKey {
  return serviceApiKeyFrom({
    secretKeysJson: optionalEnv('SUPABASE_SECRET_KEYS'),
    serviceRoleKey: optionalEnv('SUPABASE_SERVICE_ROLE_KEY'),
  });
}

/**
 * The pair of headers supabase-js puts on EVERY request, built by hand for the
 * callers that cannot use it.
 *
 * BOTH ARE LOAD-BEARING, and leaving `apikey` out is not "one header short": it
 * changes how the gateway READS the request. Its rule, from Supabase's own
 * description of the key architecture, is that an `Authorization` which does not
 * begin `Bearer sb_` is taken for a USER SESSION token and passed upstream
 * untouched, and only a recognised `apikey` makes it mint the service_role token.
 *
 * So a lone `Authorization: Bearer <legacy service-role JWT>` reaches Storage as
 * a session token, resolves to no privileged role, and the bucket is then filtered
 * away from the caller by RLS. Production answers that with **HTTP 400 and a body
 * saying "Bucket not found"**, which reads like a missing bucket and is really a
 * refused credential. That is what silently broke every testimony photo from
 * launch until 2026-09-16: the object uploaded, this read was refused, photo-guard
 * answered 404, and the app said "check your connection".
 */
export function serviceApiHeaders(key: string): Record<string, string> {
  return { apikey: key, Authorization: `Bearer ${key}` };
}
