// course-handoff: tapping Register mints the short-lived, single-use token the website
// resolves server-side, so an app-started registration is born linked (W2.9 slice 2;
// ADR 0017 decision 7, docs/spec/13).
//
// Client-called with the MEMBER's JWT (photo-guard's pattern): the (profile, course)
// binding takes its profile from the token, never from the body. The token is opaque
// and carries no personal data; profile_id is never in a URL. Until the website's flag
// flips (ADR 0017 decision 8), minted tokens simply expire unread: the app hands off
// without a usable token and the email match does the linking, so nothing here may
// assume the handoff is live.
//
// Logs carry outcomes and never tokens (a token is a bearer credential for 30 minutes).

import { createClient } from '@supabase/supabase-js';

import { requiredEnv } from '../_shared/env.ts';
import { clientKey, createRateLimiter } from '../_shared/rateLimit.ts';
import { type MintOutcome, mintResponse, parseCourseHandoff } from './core.ts';

const MAX_BODY_BYTES = 2 * 1024;
const RPC_TIMEOUT_MS = 10_000;
// A member mints one token per Register tap; even an indecisive one lands here a
// handful of times. Keyed by user id (an IP is a whole church hall on a Sunday).
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 10 * 60_000;

const allowRequest = createRateLimiter({ limit: RATE_LIMIT, windowMs: RATE_WINDOW_MS });

function fail(error: string, status: number): Response {
  return Response.json(
    { ok: false, error },
    { status, headers: status === 429 ? { 'Retry-After': '600' } : undefined },
  );
}

const admin = createClient(
  requiredEnv('SUPABASE_URL'),
  requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
  {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      fetch: (input: URL | RequestInfo, init?: RequestInit) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(RPC_TIMEOUT_MS) }),
    },
  },
);

Deno.serve(async (req) => {
  if (req.method !== 'POST') return fail('invalid', 405);

  const declaredLength = Number(req.headers.get('content-length') ?? '0');
  if (declaredLength > MAX_BODY_BYTES) return fail('invalid', 413);

  const jwt = (req.headers.get('authorization') ?? '')
    .replace(/^Bearer\s+/i, '')
    .trim();
  if (!jwt) return fail('invalid', 401);

  const { data: caller } = await admin.auth.getUser(jwt);
  const callerId = caller.user?.id ?? null;
  // Browsing a course never needs auth; registering for one does (docs/spec/13 gate).
  if (callerId === null) return fail('invalid', 401);

  if (!allowRequest(clientKey(callerId))) return fail('rate_limited', 429);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail('invalid', 400);
  }

  const request = parseCourseHandoff(raw);
  if (request === null) return fail('invalid', 422);

  const { data, error } = await admin.rpc('mint_course_handoff', {
    p_profile: callerId,
    p_course_slug: request.courseSlug,
  });
  if (error || !data?.length) {
    console.error(`course-handoff: mint rpc failed (${error?.code ?? 'empty'})`);
    return fail('failed', 502);
  }

  const outcome = data[0] as {
    outcome: MintOutcome;
    token: string | null;
    expires_at: string | null;
  };
  const mapped = mintResponse(outcome.outcome, outcome.token, outcome.expires_at);
  console.info(`course-handoff: outcome=${outcome.outcome}`);
  return Response.json(mapped.response, { status: mapped.status });
});
