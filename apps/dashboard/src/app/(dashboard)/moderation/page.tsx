import Link from 'next/link';
import { redirect } from 'next/navigation';

import { PageHeader } from '@/components/PageHeader';
import { Stat } from '@/components/ui/Stat';
import { Guide } from '@/components/ui/Guide';
import { copy } from '@/copy/en';
import { createServerComponentClient } from '@/lib/supabase/server';
import { authorize } from '@/server/authorize';
import { loadModerationQueue, type QueueKind } from '@/server/moderationQueue';

import { Queue } from './Queue';

export const dynamic = 'force-dynamic';

/**
 * The moderation queue, read-only (W2.7 slice 2).
 *
 * Read-only on purpose: the hardest part of a queue is scoping, and scoping is provable
 * against a surface that cannot yet do any damage. The decisions arrive in slice 3.
 *
 * Both `?kind=` and `?branch=` are read straight off the URL, and neither can widen what
 * the caller sees: `loadModerationQueue` reads through the caller's own client, so RLS
 * refuses another branch's rows no matter what the query string says. Proven in
 * moderationQueue.test.ts rather than assumed here.
 */
export default async function ModerationPage({
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
    // Everything else is a person, not a session, problem: `/` says so honestly.
    redirect('/');
  }

  const { caller } = verdict;
  const params = await searchParams;
  const kind = readKind(params.kind);

  // The queue reports the instant it was read at, so the overdue count and the relative
  // times on the cards cannot disagree.
  //
  // The branch requests used to be read here too, for the rail count and nothing else.
  // The `(dashboard)` layout owns that badge since W4.12 slice 4, which is why this page
  // no longer pays a year-wide view scan to draw a number in somebody else's component.
  // Decision 12 is better served for it: the badge now shows on every screen rather than
  // on the three that happened to remember to fetch it.
  const queue = await loadModerationQueue(supabase, caller, { kind });
  const scope =
    caller.role === 'admin' ? copy.queue.allBranches : caller.branchName;

  return (
    <>
      <PageHeader title={copy.queue.title} scope={scope} />

      <dl className="mt-4 flex flex-wrap gap-2.5">
        <Stat label={copy.queue.stats.toReview} value={queue.counts.all} />
        <Stat label={copy.queue.stats.overdue} value={queue.overdue} />
        <Stat
          label={copy.queue.stats.testimonies}
          value={queue.counts.testimony}
        />
      </dl>

      <nav aria-label={copy.queue.filters.all} className="mt-4">
        <ul className="inline-flex flex-wrap gap-1 rounded-control bg-alt p-1">
          <FilterTab href="/moderation" active={!kind}>
            {`${copy.queue.filters.all} ${String(queue.counts.all)}`}
          </FilterTab>
          <FilterTab
            href="/moderation?kind=testimony"
            active={kind === 'testimony'}
          >
            {copy.queue.filters.testimonies}
          </FilterTab>
          <FilterTab href="/moderation?kind=prayer" active={kind === 'prayer'}>
            {copy.queue.filters.prayers}
          </FilterTab>
        </ul>
      </nav>

      <Guide title={copy.queue.safeguardingTitle}>
        {copy.queue.safeguarding}
      </Guide>

      <Queue items={queue.items} now={queue.readAt} scope={scope} />
    </>
  );
}

function readKind(value: string | string[] | undefined): QueueKind | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate === 'testimony' || candidate === 'prayer'
    ? candidate
    : undefined;
}

function FilterTab({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? 'true' : undefined}
        className={`block rounded-control px-4 py-2 text-body font-bold ${
          active
            ? 'bg-raised text-text shadow-sm'
            : 'text-muted hover:text-text'
        }`}
      >
        {children}
      </Link>
    </li>
  );
}
