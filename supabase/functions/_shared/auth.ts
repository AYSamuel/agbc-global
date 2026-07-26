import { requiredEnv } from './env.ts';

/**
 * Constant-time string comparison: hash both sides first so the XOR loop always
 * runs over equal-length digests regardless of input lengths. Used for every
 * secret-vs-presented check (service-role key, review code).
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

// Job functions are cron/service-invoked only (docs/spec/21 §5). The platform's
// verify_jwt gate admits ANY valid project JWT (the anon key included), so the
// handler itself requires the service-role key.
export async function isServiceRoleRequest(req: Request): Promise<boolean> {
  const header = req.headers.get('authorization') ?? '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (!token) return false;

  return timingSafeEqual(token, requiredEnv('SUPABASE_SERVICE_ROLE_KEY'));
}

export function unauthorized(): Response {
  return Response.json(
    { error: 'service invocations only' },
    { status: 401 },
  );
}
