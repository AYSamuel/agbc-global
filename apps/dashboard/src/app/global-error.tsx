'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

import { Alert } from '@/components/ui/Alert';
import { AuthShell } from '@/components/ui/AuthShell';
import { copy } from '@/copy/en';

import './globals.css';

/**
 * The last boundary: errors thrown by the ROOT layout itself, which `app/error.tsx` cannot
 * catch because it renders inside that layout.
 *
 * Rare and therefore exactly the kind of failure nobody would otherwise hear about: without
 * this the dashboard shows Next's own blank apology and reports nothing (W2.10, `21` §6.1).
 * It has to render its own `<html>`/`<body>`, so it cannot reuse the root layout's fonts or
 * inlined tokens; it stays deliberately plain rather than half-recreating them, and it
 * offers no retry because whatever failed here failed before the app existed.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <AuthShell title={copy.errors.unexpectedTitle}>
          <Alert>{copy.errors.unexpectedBody}</Alert>
        </AuthShell>
      </body>
    </html>
  );
}
