import * as Sentry from '@sentry/nextjs';

import { SENTRY_DSN, sharedSentryOptions } from '@/lib/sentryOptions';

// Node runtime (route handlers, server components, server actions). A DSN is the on switch:
// no DSN, no init, so local dev and anyone's checkout stay silent.
if (SENTRY_DSN) {
  Sentry.init(sharedSentryOptions());
}
