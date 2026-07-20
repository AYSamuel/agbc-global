import { requiredEnv } from './env.ts';

// Job functions are cron/service-invoked only (docs/spec/21 §5). The platform's
// verify_jwt gate admits ANY valid project JWT (the anon key included), so the
// handler itself requires the service-role key. Hash-then-compare keeps the
// comparison constant-time by construction.
export async function isServiceRoleRequest(req: Request): Promise<boolean> {
  const header = req.headers.get('authorization') ?? '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (!token) return false;

  const encoder = new TextEncoder();
  const [presented, expected] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(token)),
    crypto.subtle.digest(
      'SHA-256',
      encoder.encode(requiredEnv('SUPABASE_SERVICE_ROLE_KEY')),
    ),
  ]);

  const a = new Uint8Array(presented);
  const b = new Uint8Array(expected);
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function unauthorized(): Response {
  return Response.json(
    { error: 'service invocations only' },
    { status: 401 },
  );
}
