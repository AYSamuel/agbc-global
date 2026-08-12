import * as Sentry from '@sentry/nextjs';

import { SENTRY_DSN, sharedSentryOptions } from '@/lib/sentryOptions';

// Edge runtime, which is where `proxy.ts` runs (Next 16's renamed middleware). It only
// redirects signed-out visitors and is never the authorization check itself (W2.7 slice 1),
// but a throw there logs somebody out of a working dashboard, so it is worth reporting.
if (SENTRY_DSN) {
  Sentry.init(sharedSentryOptions());
}
