/**
 * The Sentry options every dashboard runtime shares (client, server, edge), in one place so
 * three copies cannot drift apart on the thing that matters most about them: what they
 * refuse to send.
 *
 * This is a STAFF tool, which makes it the higher-stakes half of the two Sentry setups. A
 * leader's screen holds other people's testimonies and prayer requests (GDPR Art. 9 data),
 * their own moderation notes, and a Supabase session cookie. So the defaults are the danger
 * here, and Sentry v10 changed where they live: `sendDefaultPii` is deprecated in favour of
 * `dataCollection`, whose per-category defaults are NOT conservative. Verified against the
 * installed @sentry/core 10.69 types rather than the docs:
 *
 * - `cookies` defaults to true. The dashboard authenticates by cookie, so this is a session
 *   token in an error report.
 * - `httpBodies` defaults to ALL four directions. A moderation request body is the post.
 * - `httpHeaders` request + response default to true, and `urlQueryParams` to true, where
 *   PostgREST puts its filters.
 * - `stackFrameVariables` defaults to true: local variables inside the frame. In this app a
 *   local is regularly a testimony body, a refusal note or a member's email.
 * - `databaseQueryData` defaults to true, which is query parameters and returned rows.
 *
 * Every one of them is turned off explicitly. The mobile app's Sentry runs an older core
 * (10.37 via @sentry/react-native) where `dataCollection` does not exist yet, so it uses
 * `sendDefaultPii: false` plus its own scrubbers; see apps/mobile/src/lib/sentry.ts.
 *
 * No session replay and no tracing, in either runtime: a replay of this dashboard is a
 * recording of somebody's prayer request, and `21` §6.1 asks for crashes.
 */
export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

/** A function, not a constant: each runtime gets its own object, and `as const` would make
 *  `httpBodies` readonly, which the SDK's option type rejects. */
export function sharedSentryOptions() {
  return {
    dsn: SENTRY_DSN,
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
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  };
}
