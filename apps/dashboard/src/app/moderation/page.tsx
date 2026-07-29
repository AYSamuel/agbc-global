import { redirect } from 'next/navigation';

import { Alert } from '@/components/ui/Alert';
import { DashboardShell } from '@/components/DashboardShell';
import { QueueItem } from '@/components/QueueItem';
import { copy } from '@/copy/en';
import { createServerComponentClient } from '@/lib/supabase/server';
import { authorize } from '@/server/authorize';
import { loadModerationQueue, type QueueKind } from '@/server/moderationQueue';

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
  const queue = await loadModerationQueue(supabase, caller, { kind });
  const scope =
    caller.role === 'admin' ? copy.queue.allBranches : caller.branchName;

  return (
    <DashboardShell caller={caller} current="moderation">
      <header>
        <h1 className="font-display text-[1.5rem] leading-tight font-extrabold">
          {copy.queue.title}
        </h1>
        <p className="mt-1 text-body font-bold text-sub">{scope}</p>
      </header>

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

      <div className="mt-4 flex items-start gap-3 rounded-card border border-[rgba(185,134,0,0.34)] bg-[rgba(255,207,74,0.14)] px-4 py-3">
        <span
          aria-hidden="true"
          className="mt-px text-[#b98600] dark:text-accent"
        >
          ⚠
        </span>
        <p className="text-body leading-relaxed text-text">
          <b className="font-extrabold">{copy.queue.safeguardingTitle}</b>{' '}
          {copy.queue.safeguarding}
        </p>
      </div>

      {queue.items.length === 0 ? (
        <div className="flex flex-col items-center px-8 py-16 text-center">
          <h2 className="font-display text-[1.2rem] font-extrabold">
            {copy.queue.emptyTitle}
          </h2>
          <p className="mt-1.5 max-w-[44ch] text-body leading-relaxed text-sub">
            {copy.queue.emptyBody(scope)}
          </p>
        </div>
      ) : (
        <>
          <h2 className="pt-5 pb-2.5 text-label font-extrabold tracking-[0.14em] text-muted uppercase">
            {copy.queue.waitingLabel}
          </h2>
          {queue.items.map((item) => (
            <QueueItem key={item.id} item={item} now={queue.readAt} />
          ))}
          <Alert tone="info">{copy.queue.readOnly}</Alert>
        </>
      )}
    </DashboardShell>
  );
}

function readKind(value: string | string[] | undefined): QueueKind | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate === 'testimony' || candidate === 'prayer'
    ? candidate
    : undefined;
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
      <a
        href={href}
        aria-current={active ? 'true' : undefined}
        className={`block rounded-control px-4 py-2 text-body font-bold ${
          active
            ? 'bg-raised text-text shadow-sm'
            : 'text-muted hover:text-text'
        }`}
      >
        {children}
      </a>
    </li>
  );
}
