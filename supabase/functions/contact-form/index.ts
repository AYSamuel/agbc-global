// Contact form → church inbox (docs/spec/04 CONTACT, W1.7). Client-called with
// the anon key (guests included: browsing never requires auth). Thin handler:
// decisions live in core.ts (deno-tested).
//
// Deliberate deviations from the backend standard, stated:
// - The Resend send is synchronous in the request path (standard prefers async
//   email). Chosen so the member gets a truthful success/failure and the app
//   can preserve the draft on failure (docs/spec/04); volume is a handful of
//   messages a week, bounded further by the rate limiter.
// - Unconfigured email (no Resend key yet, docs/spec/24 §1) returns 503 rather
//   than pretending: the app shows its error state and keeps the draft. Same
//   posture as the website's /api/contact.
//
// Logs never contain name, email, or message content (docs/spec/20).

import { hasClientApiKey } from '../_shared/auth.ts';
import { optionalEnv } from '../_shared/env.ts';
import { captureEdgeError } from '../_shared/sentry.ts';
import {
  buildEmail,
  clientKey,
  createRateLimiter,
  idempotencyKeyOf,
  isBot,
  parseContact,
} from './core.ts';

const MAX_BODY_BYTES = 64 * 1024;
// Inside the phone's own budget, deliberately (W4.18 slice 3). The app aborts
// every call at ten seconds, and this used to be ten seconds too, so whenever
// Resend was slow the phone gave up FIRST and the member saw "you're offline"
// for an email that then went out. Six seconds plus a cold boot still answers
// before the phone stops listening, with a real verdict instead of a guess.
const RESEND_TIMEOUT_MS = 6_000;
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 10 * 60_000;

// Per warm instance: a speed bump against casual flooding (see core.ts).
const allowRequest = createRateLimiter({
  limit: RATE_LIMIT,
  windowMs: RATE_WINDOW_MS,
});

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ ok: false, error: 'invalid' }, { status: 405 });
  }

  const declaredLength = Number(req.headers.get('content-length') ?? '0');
  if (declaredLength > MAX_BODY_BYTES) {
    return Response.json({ ok: false, error: 'invalid' }, { status: 413 });
  }

  // With verify_jwt off (ADR 0024) the apikey check is ours: any publishable
  // key, or the legacy anon key while the app still sends it.
  if (!(await hasClientApiKey(req))) {
    return Response.json({ ok: false, error: 'invalid' }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ ok: false, error: 'invalid' }, { status: 400 });
  }

  const request = parseContact(raw);
  if (request === null) {
    return Response.json({ ok: false, error: 'invalid' }, { status: 422 });
  }

  // Honeypot tripped: feign success, send nothing.
  if (isBot(request)) {
    return Response.json({ ok: true });
  }

  if (!allowRequest(clientKey(req.headers.get('x-forwarded-for')))) {
    return Response.json(
      { ok: false, error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': '600' } },
    );
  }

  const apiKey = optionalEnv('RESEND_API_KEY');
  const from = optionalEnv('CONTACT_FROM_EMAIL');
  const to = optionalEnv('CONTACT_TO_EMAIL');
  if (!apiKey || !from || !to) {
    // Loud, not just logged (W4.18 slice 3). This branch returned before the
    // try/catch below could capture anything, which is why three weeks of
    // dropped messages on production raised nothing anywhere: the contact
    // pair had never been set (docs/runbooks/credentials.md, function secrets).
    console.warn('contact-form: Resend not configured; submission not sent.');
    await captureEdgeError(
      'contact-form',
      new Error('contact-form: Resend not configured; submission not sent'),
    );
    return Response.json(
      { ok: false, error: 'not_configured' },
      { status: 503 },
    );
  }

  // The app's idempotency key, forwarded verbatim (W4.18 slice 3). Resend keeps
  // it for 24 hours and refuses a second email under it, so a retry of a request
  // the phone gave up on cannot arrive twice. Optional, permanently: builds 22
  // and 23 send none. Deliberate deviation from the backend standard's "replay
  // the stored response": this function holds no store, and Resend's key IS the
  // store; a replay here would answer 200 for a send it never made.
  const idempotencyKey = idempotencyKeyOf(req.headers.get('Idempotency-Key'));

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(idempotencyKey === null
          ? {}
          : { 'Idempotency-Key': idempotencyKey }),
      },
      body: JSON.stringify(buildEmail(request, from, to)),
      signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
    });
    if (!response.ok) {
      // Status only: the response body may echo addresses (docs/spec/20).
      console.error(`contact-form: Resend responded ${response.status}`);
      return Response.json({ ok: false, error: 'send_failed' }, {
        status: 502,
      });
    }
    return Response.json({ ok: true });
  } catch (error) {
    console.error(
      'contact-form: send failed:',
      error instanceof Error ? error.name : 'unknown',
    );
    await captureEdgeError('contact-form', error);
    return Response.json({ ok: false, error: 'send_failed' }, { status: 502 });
  }
});
