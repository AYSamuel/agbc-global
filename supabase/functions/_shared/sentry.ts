import * as Sentry from '@sentry/deno';

import { optionalEnv } from './env.ts';

// Crash reporting for edge functions (docs/spec/21 §6.1, `20`; ADR 0020). Same posture as
// the app and the dashboard: absent `SENTRY_DSN` is a clean no-op, so local dev and an
// unconfigured environment behave exactly as before.
//
// Two things are specific to Deno here, both from Supabase's own guide:
//
// 1. `defaultIntegrations: false`. The Deno SDK does not instrument `Deno.serve`, so the
//    integrations that would otherwise attach request context can bleed one request's data
//    into the next when the runtime is reused between invocations.
// 2. For the same reason, context is passed PER CAPTURE inside `withScope` rather than set
//    globally, and nothing here touches the global scope.
//
// The scrubbing matters more here than anywhere: contact-form carries a member's message,
// photo-guard carries an image, review-signin carries an email address. `dataCollection`'s
// defaults collect request bodies, headers, query params and stack-frame locals, so all of
// them are turned off explicitly (same inventory as the dashboard's lib/sentryOptions.ts).

let started: boolean | null = null;

/** Same reasoning as the DSN read: an env lookup here must never be the thing that throws. */
function environmentName(): string {
  try {
    return optionalEnv('SENTRY_ENVIRONMENT') ?? 'production';
  } catch {
    return 'production';
  }
}

function ready(): boolean {
  if (started !== null) return started;
  // The env read is inside the guard, not beside it. This helper is called from inside catch
  // blocks, so it must not be able to throw: a runtime without env permission (`deno test`
  // grants none, `21` §4) would otherwise turn a handled failure into an unhandled one.
  let dsn: string | null = null;
  try {
    dsn = optionalEnv('SENTRY_DSN');
  } catch {
    dsn = null;
  }
  if (!dsn) {
    started = false;
    return false;
  }
  Sentry.init({
    dsn,
    defaultIntegrations: false,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: false, response: false },
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      stackFrameVariables: false,
    },
    tracesSampleRate: 0,
    environment: environmentName(),
  });
  started = true;
  return true;
}

/**
 * Report a failure that the function has already handled. Always await it: an isolate can be
 * frozen the moment the response is returned, so an unflushed event is a lost event.
 *
 * @param fn the function's slug, so Sentry groups by job rather than by stack shape.
 */
export async function captureEdgeError(
  fn: string,
  error: unknown,
): Promise<void> {
  if (!ready()) return;
  try {
    Sentry.withScope((scope) => {
      scope.setTag('function', fn);
      Sentry.captureException(error);
    });
    await Sentry.flush(2_000);
  } catch {
    // Deliberate, and the same rule as the dead-man ping above it: reporting a failure must
    // never become one. The console.error beside every call site is still there.
  }
}
