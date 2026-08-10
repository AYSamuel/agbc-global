// email-claim: a member proves a second address and their website registrations link
// (W2.9 slice 2; ADR 0017 decision 3, docs/spec/13).
//
// Client-called with the MEMBER's JWT (photo-guard's pattern): verify_jwt admits any
// project token, so the handler resolves the real user and refuses the anon key. The
// caller's identity comes from the token, NEVER from the body; the target address is
// the one thing the body contributes.
//
// Deliberately NOT Supabase auth (ADR 0017): signInWithOtp would sign them in AS the
// second address, updateUser({email}) would REPLACE their login. The decisions live in
// two SECURITY DEFINER RPCs (request_email_claim / verify_email_claim), where pgTAP
// holds them still; this handler owns transport: validation, rate limiting, Resend.
//
// The Resend send is synchronous in the request path, contact-form's stated deviation
// for the same reason: the member is sitting on a "we sent you a code" screen, and a
// truthful failure (keep the form, show retry) beats a cheerful lie. Volume is bounded
// by the limiter here and the per-caller/per-target bounds in the database.
//
// Logs carry outcomes and never addresses or codes (docs/spec/20).

import { createClient } from '@supabase/supabase-js';

import { resendSender } from '../_shared/email.ts';
import { optionalEnv, requiredEnv } from '../_shared/env.ts';
import { clientKey, createRateLimiter } from '../_shared/rateLimit.ts';
import {
  buildClaimEmail,
  parseEmailClaim,
  requestResponse,
  type RequestOutcome,
  verifyResponse,
  type VerifyOutcome,
} from './core.ts';

const MAX_BODY_BYTES = 4 * 1024;
const RPC_TIMEOUT_MS = 10_000;
// The database holds the durable bounds (5 per caller and per address per hour); this
// warm-instance limiter just keeps a hot loop from reaching the database at all.
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 10 * 60_000;

const allowCaller = createRateLimiter({ limit: RATE_LIMIT, windowMs: RATE_WINDOW_MS });
const allowTarget = createRateLimiter({ limit: RATE_LIMIT, windowMs: RATE_WINDOW_MS });

function fail(error: string, status: number): Response {
  const headers =
    status === 429 ? { 'Retry-After': '600' } : undefined;
  return Response.json({ ok: false, error }, { status, headers });
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
  // No user behind the token means the anon key: claiming an address is a member act.
  if (callerId === null) return fail('invalid', 401);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail('invalid', 400);
  }

  const request = parseEmailClaim(raw);
  if (request === null) return fail('invalid', 422);

  const normalizedTarget = request.email.toLowerCase();
  if (!allowCaller(clientKey(callerId)) || !allowTarget(normalizedTarget)) {
    return fail('rate_limited', 429);
  }

  if (request.action === 'request') {
    const { data, error } = await admin.rpc('request_email_claim', {
      p_profile: callerId,
      p_email: request.email,
    });
    if (error || !data?.length) {
      console.error(`email-claim: request rpc failed (${error?.code ?? 'empty'})`);
      return fail('invalid', 502);
    }

    const outcome = data[0] as { outcome: RequestOutcome; code: string | null };
    const mapped = requestResponse(outcome.outcome);
    console.info(`email-claim: request outcome=${outcome.outcome}`);
    if (!mapped.send) {
      return Response.json(mapped.response, {
        status: mapped.status,
        headers: mapped.status === 429 ? { 'Retry-After': '3600' } : undefined,
      });
    }

    const apiKey = optionalEnv('RESEND_API_KEY');
    const from = optionalEnv('CLAIM_FROM_EMAIL') ?? optionalEnv('CONTACT_FROM_EMAIL');
    if (!apiKey || !from || !outcome.code) {
      console.warn('email-claim: Resend not configured; code not sent.');
      return fail('not_configured', 503);
    }

    try {
      const send = resendSender(apiKey, optionalEnv('RESEND_API_URL') ?? undefined);
      await send(
        buildClaimEmail(outcome.code, request.language ?? 'en', from, request.email),
      );
    } catch (error) {
      console.error(
        'email-claim: send failed:',
        error instanceof Error ? error.name : 'unknown',
      );
      return fail('send_failed', 502);
    }

    console.info('email-claim: code sent');
    return Response.json(mapped.response, { status: mapped.status });
  }

  const { data, error } = await admin.rpc('verify_email_claim', {
    p_profile: callerId,
    p_email: request.email,
    p_code: request.code,
  });
  if (error || !data?.length) {
    console.error(`email-claim: verify rpc failed (${error?.code ?? 'empty'})`);
    return fail('invalid', 502);
  }

  const outcome = data[0] as { outcome: VerifyOutcome; linked_count: number };
  const mapped = verifyResponse(outcome.outcome, outcome.linked_count);
  console.info(
    `email-claim: verify outcome=${outcome.outcome} linked=${outcome.linked_count}`,
  );
  return Response.json(mapped.response, { status: mapped.status });
});
