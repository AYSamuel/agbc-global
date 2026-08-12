// Crash reporting (docs/spec/01 §7, `21` §6.1, `20`; ADR 0020).
//
// Not consent-gated, unlike product analytics, and `20`'s lawful-basis table was corrected
// in the same change to say so: a crash report is how the app gets fixed, the halt
// criterion in `21` §8 ("crash-free sessions < 99.5% during a rollout") is meaningless if
// it only measures the members who opted in, and the price of that is scrubbing rather
// than asking. So this file's real job is everything it refuses to send.
//
// What is refused, and why each one is a real risk in THIS app rather than a checkbox:
//
// - `sendDefaultPii: false` keeps the email address, IP and user record out. An email is
//   the only identifier an account here has (docs/spec/03).
// - `event.user` is deleted anyway, belt and braces: an integration that sets it later
//   cannot reintroduce it.
// - No screenshots and no view hierarchy. Both default to off; both are named explicitly
//   because a screenshot of this app is very often somebody's prayer request, which is
//   Art. 9 data, and a default is not a decision.
// - Console breadcrumbs are dropped whole. They are where post text ends up if anybody
//   ever debugs a compose screen with a log statement.
// - HTTP breadcrumb URLs lose their query strings, which is where PostgREST puts filters.
// - Failed-request capture is off: our four data states already tell the member, and the
//   report would carry request URLs for no gain.
//
// A DSN is the on switch. Absent (local dev, CI, any environment nobody configured) means
// no init at all, so nothing is sent by accident and nothing warns about it either.

interface SentryBreadcrumb {
  category?: string;
  data?: Record<string, unknown>;
}

interface SentryEvent {
  user?: unknown;
  request?: { url?: string; query_string?: unknown; headers?: unknown };
}

interface SentryModule {
  init: (options: Record<string, unknown>) => void;
  captureException: (error: unknown) => void;
  wrap: <T>(component: T) => T;
}

function loadSentry(): SentryModule | null {
  try {
    // @sentry/react-native is a NATIVE module. The dev clients on the physical devices
    // were built before it existed, so importing it there throws at import and would take
    // the whole route down (same trap as expo-clipboard, see features/give/CopyRow.tsx).
    // Guarded until the EAS dev builds that link it.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@sentry/react-native') as SentryModule;
  } catch {
    return null;
  }
}

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

let sentry: SentryModule | null = null;

/** Strips the query string from a URL, keeping the path worth reading. */
function stripQuery(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const cut = value.indexOf('?');
  return cut === -1 ? value : value.slice(0, cut);
}

/**
 * Exported for its tests: this is the whole point of the file, so it is asserted directly
 * rather than through a mocked `init` that would only prove the option was passed.
 */
export function scrubBreadcrumb(
  breadcrumb: SentryBreadcrumb,
): SentryBreadcrumb | null {
  // Console breadcrumbs are dropped whole: they are where post text ends up the moment
  // anybody debugs a compose screen with a log statement.
  if (breadcrumb.category === 'console') return null;
  if (breadcrumb.data && typeof breadcrumb.data === 'object') {
    if ('url' in breadcrumb.data) {
      breadcrumb.data.url = stripQuery(breadcrumb.data.url);
    }
  }
  return breadcrumb;
}

/** Exported for its tests, as above. */
export function scrubEvent(event: SentryEvent): SentryEvent {
  delete event.user;
  if (event.request) {
    event.request.url = stripQuery(event.request.url) as string | undefined;
    delete event.request.query_string;
    delete event.request.headers;
  }
  return event;
}

export function initSentry(): void {
  if (sentry || !DSN) return;
  const module = loadSentry();
  if (!module) return;

  module.init({
    dsn: DSN,
    sendDefaultPii: false,
    // Sessions are what the rollout halt criterion counts (`21` §8). On by default; stated
    // because it is load-bearing rather than incidental.
    enableAutoSessionTracking: true,
    attachScreenshot: false,
    attachViewHierarchy: false,
    enableCaptureFailedRequests: false,
    // Performance tracing stays off: `21` §6.1 asks for crashes, and the Free tier's 5k
    // events a month is a budget worth spending on errors (`21` §9).
    enableAutoPerformanceTracing: false,
    tracesSampleRate: 0,
    environment: __DEV__ ? 'development' : 'production',
    beforeBreadcrumb: scrubBreadcrumb,
    beforeSend: scrubEvent,
  });
  sentry = module;
}

/**
 * Report an error we caught and handled. The member still sees an actionable message from
 * whatever called this; nothing about a Sentry failure is worth surfacing to them.
 */
export function captureHandledError(error: unknown): void {
  try {
    sentry?.captureException(error);
  } catch {
    // Reporting a crash must never cause one.
  }
}
