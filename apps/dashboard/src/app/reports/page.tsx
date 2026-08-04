import { redirect } from 'next/navigation';

import { DashboardShell } from '@/components/DashboardShell';
import { PageHeader } from '@/components/PageHeader';
import { ReportedCard } from '@/components/ReportedCard';
import { Alert } from '@/components/ui/Alert';
import { Stat } from '@/components/ui/Stat';
import { copy } from '@/copy/en';
import { createServerComponentClient } from '@/lib/supabase/server';
import { authorize } from '@/server/authorize';
import { loadBranchRequests } from '@/server/branchRequests';
import { loadReportsInbox } from '@/server/reportsInbox';

export const dynamic = 'force-dynamic';

/**
 * The reports inbox (docs/spec/17 §1, W2.7 slice 4's second half).
 *
 * The other end of W2.6. Members have been able to report a testimony or a prayer since
 * that item shipped, and until this page there was nowhere for a leader to read what they
 * said: reports were being written that nobody could see. Everything else here is the
 * shape the queue already established, deliberately, because a leader clearing reports is
 * doing the same job on the same day as clearing the queue.
 *
 * Scoping is the database's, not this page's. `loadReportsInbox` reads through the
 * caller's own client, so `can_moderate_branch()` decides what comes back and a leader
 * cannot widen it from the URL: there is nothing in the URL to widen.
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createServerComponentClient();
  const verdict = await authorize(supabase, { action: 'access_dashboard' });

  if (!verdict.ok) {
    if (verdict.reason === 'unauthenticated') redirect('/sign-in');
    if (
      verdict.reason === 'mfa_enrolment_required' ||
      verdict.reason === 'mfa_challenge_required'
    ) {
      redirect('/mfa');
    }
    redirect('/');
  }

  const { caller } = verdict;
  const params = await searchParams;

  // The requests ride along for the rail count only, same as the queue page: decision 12
  // says a leader learns of waiting requests wherever they are in the dashboard.
  const [inbox, requests] = await Promise.all([
    loadReportsInbox(supabase),
    loadBranchRequests(supabase, caller),
  ]);
  const scope =
    caller.role === 'admin' ? copy.reports.allBranches : caller.branchName;
  const outcome = readOutcome(params.outcome);

  return (
    <DashboardShell
      caller={caller}
      current="reports"
      waiting={requests.waiting.length}
    >
      <PageHeader title={copy.reports.title} scope={scope} />

      {outcome ? (
        <div className="mt-4">
          <Alert tone={outcome.tone}>{outcome.message}</Alert>
        </div>
      ) : null}

      <dl className="mt-4 flex flex-wrap gap-2.5">
        <Stat label={copy.reports.stats.open} value={inbox.counts.open} />
        <Stat
          label={copy.reports.stats.safeguarding}
          value={inbox.counts.safeguarding}
          tone={inbox.counts.safeguarding > 0 ? 'low' : 'normal'}
        />
        <Stat
          label={copy.reports.stats.resolved}
          value={inbox.counts.resolvedThisMonth}
        />
      </dl>

      {/* The rule where the decision is made, like the queue's safeguarding note and the
          verses one. */}
      <div className="mt-4 flex items-start gap-3 rounded-card border border-[rgba(185,134,0,0.34)] bg-[rgba(255,207,74,0.14)] px-4 py-3">
        <span
          aria-hidden="true"
          className="mt-px text-gold-deep dark:text-accent"
        >
          ⚠
        </span>
        <p className="text-body leading-relaxed text-text">
          <b className="font-extrabold">{copy.reports.guideTitle}</b>{' '}
          {copy.reports.guide}
        </p>
      </div>

      {inbox.items.length === 0 ? (
        <div className="flex flex-col items-center px-8 py-16 text-center">
          <span
            aria-hidden="true"
            className="mb-4 grid size-[4.125rem] place-items-center rounded-full bg-alt text-muted"
          >
            <svg
              width="30"
              height="30"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 4h16v12H7l-3 3z" />
            </svg>
          </span>
          <h2 className="font-display text-[1.2rem] font-extrabold">
            {copy.reports.emptyTitle}
          </h2>
          <p className="mt-1.5 max-w-[44ch] text-body leading-relaxed text-sub">
            {caller.role === 'admin'
              ? copy.reports.emptyBodyAll
              : copy.reports.emptyBody(scope)}
          </p>
        </div>
      ) : (
        <>
          <h2 className="pt-5 pb-2.5 text-label font-extrabold tracking-[0.14em] text-muted uppercase">
            {copy.reports.listLabel}
          </h2>
          {inbox.items.map((item) => (
            <ReportedCard
              key={`${item.kind}-${item.id}`}
              item={item}
              now={inbox.readAt}
            />
          ))}
        </>
      )}
    </DashboardShell>
  );
}

const OUTCOMES: Record<string, { message: string; tone: 'error' | 'info' }> = {
  dismissed: { message: copy.reports.outcome.dismissed, tone: 'info' },
  flagged: { message: copy.reports.outcome.flagged, tone: 'info' },
  rejected: { message: copy.reports.outcome.rejected, tone: 'info' },
  removed: { message: copy.reports.outcome.removed, tone: 'info' },
  safeguarding_stays_open: {
    message: copy.reports.outcome.safeguardingStaysOpen,
    tone: 'error',
  },
  content_changed: {
    message: copy.reports.outcome.contentChanged,
    tone: 'error',
  },
  refused: { message: copy.reports.outcome.refused, tone: 'error' },
  restore_needs_admin: {
    message: copy.queue.outcome.restoreNeedsAdmin,
    tone: 'error',
  },
  missing_reason: {
    message: copy.reports.outcome.missingReason,
    tone: 'error',
  },
  failed: { message: copy.reports.outcome.failed, tone: 'error' },
};

function readOutcome(
  value: string | string[] | undefined,
): { message: string; tone: 'error' | 'info' } | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate ? OUTCOMES[candidate] : undefined;
}
