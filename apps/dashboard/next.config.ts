import { withSentryConfig } from '@sentry/nextjs';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // @agbc/shared ships TypeScript source (tokens, contracts); Next must transpile it.
  transpilePackages: ['@agbc/shared'],
};

// Sourcemap upload so a stack trace names our code rather than a bundle offset (`21` §4).
// Every input is optional: without SENTRY_ORG/SENTRY_PROJECT/SENTRY_AUTH_TOKEN the wrapper
// builds exactly as before and skips the upload, which keeps `pnpm build` working on a
// checkout with no Sentry access. `silent` keeps the noise out of local builds.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
});
