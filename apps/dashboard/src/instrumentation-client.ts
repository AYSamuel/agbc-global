import * as Sentry from '@sentry/nextjs';

import { SENTRY_DSN, sharedSentryOptions } from '@/lib/sentryOptions';

// Browser runtime. Deliberately WITHOUT the replay and user-feedback integrations Sentry's
// setup guide suggests: a session replay of this dashboard is a recording of the moderation
// queue, which is other people's testimonies and prayer requests (Art. 9 data, docs/spec/20).
if (SENTRY_DSN) {
  Sentry.init(sharedSentryOptions());
}

// Reports errors thrown while a client-side navigation is in flight.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
