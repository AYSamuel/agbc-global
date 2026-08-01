import { redirect } from 'next/navigation';

import { DashboardShell } from '@/components/DashboardShell';
import { Alert } from '@/components/ui/Alert';
import { copy } from '@/copy/en';
import { createServerComponentClient } from '@/lib/supabase/server';
import { loadBranchRequests } from '@/server/branchRequests';
import { authorize } from '@/server/authorize';

import { RefuseForm } from './RefuseForm';
import { PastMove, WaitingRequest } from './RequestCard';

export const dynamic = 'force-dynamic';

/**
 * Who is asking to join this branch, and who has left it (docs/spec/17 §People, ADR 0015).
 *
 * Leader-facing, unlike `/people` next door: the DESTINATION branch decides who joins it
 * (decision 1), and an admin is the fallback rather than the owner. So this page asks
 * `authorize()` only for the dashboard itself, and every scoping question after that is
 * answered by the database: `branch_request_queue` shows a leader their own queue and
 * nothing else, whatever this file does.
 *
 * TWO STATES, BOTH IN THE URL. `?refuse=<id>` opens the refusal view for one request, and
 * `?outcome=<code>` reports what the last decision did. Neither carries anything about a
 * person, which is what lets this surface keep the no-JavaScript shape the moderation queue
 * has and `/people` could not: there, the subject of the screen was an email address.
 */
export default async function BranchRequestsPage({
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
  const board = await loadBranchRequests(supabase, caller);
  const scope =
    caller.role === 'admin' ? copy.requests.allBranches : caller.branchName;

  // Only a request that is actually in this caller's queue can be refused, so a hand-typed
  // id opens nothing. Not the security boundary (the RPC refuses it anyway); it just keeps
  // the screen from rendering a form that could only ever fail.
  const refusing = board.waiting.find(
    (request) => request.id === readParam(params.refuse),
  );
  const outcome = readOutcome(params.outcome);

  return (
    <DashboardShell
      caller={caller}
      current="people"
      waiting={board.waiting.length}
    >
      <header>
        <h1 className="font-display text-[1.5rem] leading-tight font-extrabold">
          {copy.requests.title}
        </h1>
        <p className="mt-1 text-body font-bold text-sub">
          {caller.role === 'admin' ? scope : copy.requests.scopeJoining(scope)}
        </p>
      </header>

      {outcome ? (
        <div className="mt-4">
          <Alert tone={outcome.tone}>{outcome.message}</Alert>
        </div>
      ) : null}

      {refusing ? (
        <RefuseForm request={refusing} />
      ) : (
        <>
          <dl className="mt-4 flex flex-wrap gap-2.5">
            <Stat
              label={copy.requests.stats.waiting}
              value={board.waiting.length}
            />
            <Stat
              label={copy.requests.stats.joined}
              value={board.joinedThisYear}
            />
            <Stat label={copy.requests.stats.left} value={board.leftThisYear} />
          </dl>

          <div className="mt-4 flex items-start gap-3 rounded-card border border-[rgba(185,134,0,0.34)] bg-[rgba(255,207,74,0.14)] px-4 py-3">
            <span
              aria-hidden="true"
              className="mt-px text-gold-deep dark:text-accent"
            >
              ⚠
            </span>
            <p className="text-body leading-relaxed text-text">
              <b className="font-extrabold">
                {copy.requests.guideTitle(scope)}
              </b>{' '}
              {copy.requests.guide}
            </p>
          </div>

          <h2 className="pt-5 pb-2.5 text-label font-extrabold tracking-[0.14em] text-muted uppercase">
            {copy.requests.waitingLabel}
          </h2>

          {board.waiting.length === 0 ? (
            <div className="flex flex-col items-center px-8 py-10 text-center">
              <h3 className="font-display text-[1.2rem] font-extrabold">
                {copy.requests.emptyTitle}
              </h3>
              <p className="mt-1.5 max-w-[44ch] text-body leading-relaxed text-sub">
                {copy.requests.emptyBody(scope)}
              </p>
            </div>
          ) : (
            board.waiting.map((request) => (
              <WaitingRequest
                key={request.id}
                request={request}
                now={board.readAt}
              />
            ))
          )}

          {board.left.length > 0 ? (
            <>
              <h2 className="pt-5 text-label font-extrabold tracking-[0.14em] text-muted uppercase">
                {copy.requests.leftLabel(scope)}
              </h2>
              <p className="pt-1.5 pb-2.5 max-w-[60ch] text-[0.78rem] leading-normal text-muted">
                {copy.requests.leftNote}
              </p>
              {board.left.map((request) => (
                <PastMove key={request.id} request={request} />
              ))}
            </>
          ) : null}
        </>
      )}
    </DashboardShell>
  );
}

const OUTCOMES: Record<string, { message: string; tone: 'error' | 'info' }> = {
  approved: { message: copy.requests.outcome.approved, tone: 'info' },
  refused: { message: copy.requests.outcome.refused, tone: 'info' },
  already_decided: {
    message: copy.requests.outcome.alreadyDecided,
    tone: 'error',
  },
  not_yours: { message: copy.requests.outcome.notYours, tone: 'error' },
  leader_first: { message: copy.requests.outcome.leaderFirst, tone: 'error' },
  reason_required: {
    message: copy.requests.outcome.reasonRequired,
    tone: 'error',
  },
  note_on_approval: { message: copy.requests.outcome.failed, tone: 'error' },
  gone: { message: copy.requests.outcome.gone, tone: 'error' },
  failed: { message: copy.requests.outcome.failed, tone: 'error' },
};

function readOutcome(
  value: string | string[] | undefined,
): { message: string; tone: 'error' | 'info' } | undefined {
  const candidate = readParam(value);
  return candidate ? OUTCOMES[candidate] : undefined;
}

function readParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-36 flex-1 rounded-card border border-cardline bg-card px-4 py-3">
      <dd className="font-display text-[1.35rem] font-extrabold">{value}</dd>
      <dt className="mt-0.5 text-label font-bold tracking-wide text-muted uppercase">
        {label}
      </dt>
    </div>
  );
}
