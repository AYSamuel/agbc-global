// Store-review bypass (docs/spec/03 §Security; W2.1). Client-called from
// AUTH-2 with the anon key. Supabase has no email test-OTP mechanism (verified
// against live docs 2026-07-26), so this function IS the bypass: the one
// allowlisted review email + long fixed code, checked server-side only, mint a
// real session through the auth admin API. The app exchanges the returned
// token_hash via verifyOtp({ token_hash, type: 'email' }) and lands in the
// normal session path (role stays 'member': the profiles insert guard pins it).
//
// Flag per environment (docs/spec/03): REVIEW_BYPASS_ENABLED=true on
// dev/preview; on prod it stays unset except from submission until approval
// + 7 days. Every attempt is logged (no addresses, no codes); Sentry alerting
// on production use lands with W2.10. The "excluded from moderation queues"
// half is the W2.7 moderation policy, not this function.

import { createClient } from '@supabase/supabase-js';

import { optionalEnv, requiredEnv } from '../_shared/env.ts';
import { clientKey, createRateLimiter } from '../_shared/rateLimit.ts';
import { captureEdgeError } from '../_shared/sentry.ts';
import { isAllowedAttempt, parseReviewSignin } from './core.ts';

const MAX_BODY_BYTES = 8 * 1024;
const ADMIN_TIMEOUT_MS = 10_000;
// Tighter than contact-form: a legitimate reviewer needs a handful of
// attempts, and with a 6-digit fixed code this limit is a primary control
// alongside the per-environment flag and per-window rotation (docs/spec/03).
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 10 * 60_000;

const allowRequest = createRateLimiter({
  limit: RATE_LIMIT,
  windowMs: RATE_WINDOW_MS,
});

function invalid(): Response {
  // One body + status for every denial reason: no enumeration (docs/spec/03).
  return Response.json({ ok: false, error: 'invalid' }, { status: 401 });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ ok: false, error: 'invalid' }, { status: 405 });
  }

  const declaredLength = Number(req.headers.get('content-length') ?? '0');
  if (declaredLength > MAX_BODY_BYTES) {
    return Response.json({ ok: false, error: 'invalid' }, { status: 413 });
  }

  if (!allowRequest(clientKey(req.headers.get('x-forwarded-for')))) {
    return Response.json(
      { ok: false, error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': '600' } },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return invalid();
  }

  const request = parseReviewSignin(raw);
  if (request === null) return invalid();

  const config = {
    enabled: optionalEnv('REVIEW_BYPASS_ENABLED') === 'true',
    reviewEmail: optionalEnv('REVIEW_EMAIL'),
    reviewCode: optionalEnv('REVIEW_CODE'),
  };

  const allowed = await isAllowedAttempt(config, request);
  // docs/spec/03: every use is logged. No addresses, no codes (docs/spec/20).
  console.info(`review-signin: attempt allowed=${allowed}`);
  if (!allowed) return invalid();

  const admin = createClient(
    requiredEnv('SUPABASE_URL'),
    requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input: URL | RequestInfo, init?: RequestInit) =>
          fetch(input, { ...init, signal: AbortSignal.timeout(ADMIN_TIMEOUT_MS) }),
      },
    },
  ).auth.admin;

  try {
    // First run in an environment creates the review user; email_confirm skips
    // the confirmation mail. An already-existing user is the normal case.
    const created = await admin.createUser({
      email: request.email,
      email_confirm: true,
    });
    if (created.error && created.error.code !== 'email_exists') {
      console.error(
        `review-signin: createUser failed: ${created.error.code ?? created.error.status}`,
      );
      return Response.json({ ok: false, error: 'unavailable' }, { status: 503 });
    }

    const link = await admin.generateLink({
      type: 'magiclink',
      email: request.email,
    });
    if (link.error || !link.data.properties?.hashed_token) {
      console.error(
        `review-signin: generateLink failed: ${link.error?.code ?? 'no token'}`,
      );
      return Response.json({ ok: false, error: 'unavailable' }, { status: 503 });
    }

    console.info('review-signin: session link issued');
    return Response.json({
      ok: true,
      token_hash: link.data.properties.hashed_token,
    });
  } catch (error) {
    console.error(
      'review-signin: admin call failed:',
      error instanceof Error ? error.name : 'unknown',
    );
    await captureEdgeError('review-signin', error);
    return Response.json({ ok: false, error: 'unavailable' }, { status: 503 });
  }
});
