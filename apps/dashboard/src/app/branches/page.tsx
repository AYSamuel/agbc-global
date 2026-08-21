import Link from 'next/link';
import { redirect } from 'next/navigation';

import { DashboardShell } from '@/components/DashboardShell';
import { PageHeader } from '@/components/PageHeader';
import { Notice } from '@/components/ui/Notice';
import { Pill } from '@/components/ui/Pill';
import { copy } from '@/copy/en';
import { createServerComponentClient } from '@/lib/supabase/server';
import { authorize } from '@/server/authorize';
import { loadBranches, type BranchRow } from '@/server/branches';

export const dynamic = 'force-dynamic';

/**
 * The branches list (docs/spec/17 §5).
 *
 * NO FRAME, on the W2.7 rule: a name, a city, a size and a status is a conventional table
 * and not a decision. The five surfaces around it that ARE decisions have frames of their
 * own.
 *
 * THIS IS THE ONLY PLACE A CLOSED BRANCH APPEARS in the whole product. Every other surface
 * filters on `status = 'active'`: the app's shared branch query, the family map, the
 * reminder job, the composer's picker. A branch nobody can see is a branch nobody can
 * re-open, so the closed ones get their own heading here rather than being dropped.
 */
export default async function BranchesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createServerComponentClient();
  const verdict = await authorize(supabase, { action: 'manage_branches' });

  if (!verdict.ok) {
    if (verdict.reason === 'unauthenticated') redirect('/sign-in');
    if (
      verdict.reason === 'mfa_enrolment_required' ||
      verdict.reason === 'mfa_challenge_required'
    ) {
      redirect('/mfa');
    }
    // A leader is sent home rather than shown an empty branches page: `17` §5 is admin-only,
    // and the shell's own refusal points them at the work that IS theirs.
    redirect('/');
  }

  const { caller } = verdict;
  const params = await searchParams;
  const outcome = typeof params.outcome === 'string' ? params.outcome : null;
  const branches = await loadBranches(supabase);

  const open = branches.filter((row) => row.status === 'active');
  const closed = branches.filter((row) => row.status === 'archived');

  return (
    <DashboardShell caller={caller} current="branches">
      <PageHeader title={copy.branches.title} scope={copy.branches.scope} />

      {outcome && <Outcome code={outcome} />}

      <div className="pt-4">
        <Link
          href="/branches/new"
          className="inline-flex min-h-12 items-center rounded-button bg-btn px-5 text-body font-extrabold text-btn-text"
        >
          {copy.branches.newBranch}
        </Link>
      </div>

      {open.length > 0 && (
        <section aria-labelledby="open-heading">
          <h2
            id="open-heading"
            className="px-0.5 pt-5 pb-2.5 text-caption font-extrabold tracking-widest text-muted uppercase"
          >
            {copy.branches.openHeading}
          </h2>
          {open.map((row) => (
            <BranchCard key={row.id} branch={row} />
          ))}
        </section>
      )}

      {closed.length > 0 && (
        <section aria-labelledby="closed-heading">
          <h2
            id="closed-heading"
            className="px-0.5 pt-5 pb-2.5 text-caption font-extrabold tracking-widest text-muted uppercase"
          >
            {copy.branches.closedHeading}
          </h2>
          {closed.map((row) => (
            <BranchCard key={row.id} branch={row} />
          ))}
        </section>
      )}

      {branches.length === 0 && (
        <div className="pt-8">
          <Notice tone="off" title={copy.branches.emptyTitle}>
            {copy.branches.emptyBody}
          </Notice>
        </div>
      )}
    </DashboardShell>
  );
}

function BranchCard({ branch }: { branch: BranchRow }) {
  return (
    <article className="mb-3 rounded-card border border-cardline bg-card p-4.5">
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        {/* The gold HQ badge members see in the app, shown here for the same reason: it is
            the one branch that cannot be closed, and the one a closing branch sends its
            members to. */}
        {/* `notice`, the gold wash, which is also what the app draws this badge in
            (BranchSwitchSheet.tsx, BranchRow.tsx). No sixth tone needed: gold already means
            "carrying weight" here, and HQ is the branch that carries it. */}
        {branch.isHq && <Pill tone="notice">{copy.branches.hqPill}</Pill>}
        {branch.status === 'archived' && (
          <Pill tone="urgent">{copy.branches.closedPill}</Pill>
        )}
        <Pill tone="quiet">{copy.branches.members(branch.memberCount)}</Pill>
      </div>
      <h3 className="font-display text-h3 font-extrabold text-text">
        {branch.name}
      </h3>
      <p className="mt-1 text-body text-sub">
        {branch.city}, {branch.country} · {branch.timezone}
      </p>
      <div className="mt-3 flex items-center gap-3 border-t border-cardline pt-3">
        <Link
          href={`/branches/${branch.slug}`}
          className="text-body font-bold text-blue underline-offset-4 hover:underline"
        >
          {copy.branches.open}
        </Link>
      </div>
    </article>
  );
}

/** What just happened, announced rather than only shown. */
function Outcome({ code }: { code: string }) {
  const messages: Partial<Record<string, string>> = {
    added: copy.branches.outcome.added,
    saved: copy.branches.outcome.saved,
    closed: copy.branches.outcome.closed,
    reopened: copy.branches.outcome.reopened,
    'hq-moved': copy.branches.outcome.hqMoved,
  };
  const message = messages[code];
  if (!message) return null;

  return (
    <div className="pt-4">
      <Notice tone="good" title={message} live="polite">
        {''}
      </Notice>
    </div>
  );
}
