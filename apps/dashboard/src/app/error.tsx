'use client';

import { useEffect } from 'react';

import { Alert } from '@/components/ui/Alert';
import { AuthShell } from '@/components/ui/AuthShell';
import { Button } from '@/components/ui/Button';
import { copy } from '@/copy/en';

/**
 * The error state for every route in this segment.
 *
 * Without it, a Supabase outage or a thrown authorize() shows Next's default error page:
 * a stack trace in development and a blank apology in production. Neither tells a leader
 * what to do. The four-states rule applies to a surface that can fail, not only to one
 * that lists data.
 *
 * The raw error goes to the console for whoever is debugging, never onto the screen: it
 * can carry ids and internals, and it is not actionable for the person reading it.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('dashboard error', error);
  }, [error]);

  return (
    <AuthShell title={copy.errors.unexpectedTitle}>
      <Alert>{copy.errors.unexpectedBody}</Alert>
      <Button onClick={reset} block>
        {copy.errors.retry}
      </Button>
    </AuthShell>
  );
}
