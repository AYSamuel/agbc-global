import * as Sentry from '@sentry/nextjs';

// Next's server-side instrumentation hook (W2.10). Loads whichever Sentry config matches
// the runtime, and exports the request-error hook so a throw inside a server component,
// route handler or proxy is reported instead of only becoming a 500 somebody has to notice.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
