import { redirect } from 'next/navigation';

import { BroadcastCard } from '@/components/BroadcastCard';
import { DashboardShell } from '@/components/DashboardShell';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { copy } from '@/copy/en';
import { createServerComponentClient } from '@/lib/supabase/server';
import { authorize } from '@/server/authorize';
import { loadBroadcasts, type BroadcastRow } from '@/server/broadcasts';

import { approveAction, haltAction, rejectAction } from './actions';

export const dynamic = 'force-dynamic';

/**
 * Broadcasts (docs/spec/17 §2; frames APPROVALS and IN FLIGHT, approved 2026-08-19).
 *
 * Three lists, and which of them a caller sees is decided by their role rather than by the
 * URL: a leader gets their own work and their branch's history, an admin gets the approval
 * queue too. `visible_broadcasts()` scopes the read in SQL, so there is nothing here to
 * widen from a query string.
 *
 * WHAT THE PAGE DOES NOT DECIDE: whether an approve control would work. It offers the
 * control to admins and the card withholds it on their own broadcast, but the answer that
 * counts comes from `approve_broadcast()`, which reads the live role and the row's author.
 * Two admins clearing the same queue is the ordinary case here, so a refusal is reported as
 * a race rather than as an error.
 */
export default async function BroadcastsPage({
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
  const outcome = typeof params.outcome === 'string' ? params.outcome : null;

  const lists = await loadBroadcasts(supabase, caller);
  const canApprove = caller.role === 'admin';

  return (
    <DashboardShell caller={caller} current="broadcasts">
      <PageHeader
        title={copy.broadcasts.title}
        scope={
          canApprove && lists.waiting.length > 0
            ? copy.broadcasts.waitingOnYou(lists.waiting.length)
            : copy.broadcasts.scope
        }
      />

      {outcome && <Outcome code={outcome} />}

      {canApprove && lists.waiting.length > 0 && (
        <section aria-labelledby="waiting-heading">
          <h2
            id="waiting-heading"
            className="px-0.5 pt-5 pb-2.5 text-caption font-extrabold tracking-widest text-muted uppercase"
          >
            {copy.broadcasts.waitingHeading}
          </h2>
          {lists.waiting.map((row) => (
            <BroadcastCard
              key={row.id}
              broadcast={row}
              viewerId={caller.userId}
              canApprove
              actions={<ReviewActions id={row.id} />}
            />
          ))}
        </section>
      )}

      {lists.mine.length > 0 && (
        <section aria-labelledby="mine-heading">
          <h2
            id="mine-heading"
            className="px-0.5 pt-5 pb-2.5 text-caption font-extrabold tracking-widest text-muted uppercase"
          >
            {copy.broadcasts.minesHeading}
          </h2>
          {lists.mine.map((row) => (
            <BroadcastCard
              key={row.id}
              broadcast={row}
              viewerId={caller.userId}
              canApprove={canApprove}
            />
          ))}
        </section>
      )}

      {lists.sent.length > 0 && (
        <section aria-labelledby="sent-heading">
          <h2
            id="sent-heading"
            className="px-0.5 pt-5 pb-2.5 text-caption font-extrabold tracking-widest text-muted uppercase"
          >
            {copy.broadcasts.sentHeading}
          </h2>
          {lists.sent.map((row) => (
            <BroadcastCard
              key={row.id}
              broadcast={row}
              viewerId={caller.userId}
              canApprove={canApprove}
              actions={
                row.status === 'sending' ? (
                  <HaltAction id={row.id} />
                ) : undefined
              }
            />
          ))}
        </section>
      )}

      {isEmpty(lists) && (
        <div className="pt-8">
          <Notice tone="off" title={copy.broadcasts.emptyTitle}>
            {copy.broadcasts.emptyBody}
          </Notice>
        </div>
      )}
    </DashboardShell>
  );
}

function isEmpty(lists: {
  waiting: BroadcastRow[];
  mine: BroadcastRow[];
  sent: BroadcastRow[];
}): boolean {
  return (
    lists.waiting.length === 0 &&
    lists.mine.length === 0 &&
    lists.sent.length === 0
  );
}

/** Approve, or send it back with a reason the author will read. */
function ReviewActions({ id }: { id: string }) {
  return (
    <>
      <form action={approveAction}>
        <input type="hidden" name="id" value={id} />
        <Button type="submit">{copy.broadcasts.approve}</Button>
      </form>
      <form action={rejectAction} className="flex flex-1 items-center gap-2.5">
        <input type="hidden" name="id" value={id} />
        <label className="sr-only" htmlFor={`note-${id}`}>
          {copy.broadcasts.rejectPrompt}
        </label>
        <input
          id={`note-${id}`}
          name="note"
          required
          placeholder={copy.broadcasts.rejectPrompt}
          className="min-h-12 flex-1 rounded-input border border-cardline bg-card px-3.5 text-body text-text"
        />
        <Button type="submit" variant="secondary">
          {copy.broadcasts.sendBack}
        </Button>
      </form>
    </>
  );
}

/**
 * The brake, with "stopping is final" said before the click rather than in a dialog after
 * it (IN FLIGHT frame). Halting is terminal, so the sentence has to arrive while the reader
 * can still choose not to.
 */
function HaltAction({ id }: { id: string }) {
  return (
    <div className="flex-1">
      <Notice tone="bad" title={copy.broadcasts.haltTitle}>
        {copy.broadcasts.haltBody}
      </Notice>
      <form action={haltAction} className="mt-3">
        <input type="hidden" name="id" value={id} />
        <Button type="submit" variant="secondary">
          {copy.broadcasts.stop}
        </Button>
      </form>
    </div>
  );
}

/** What just happened, announced rather than only shown. */
function Outcome({ code }: { code: string }) {
  // Partial, so an unknown code is `undefined` and the guard below is real rather
  // than a line TypeScript can prove is dead.
  const messages: Partial<
    Record<string, { tone: 'good' | 'bad'; text: string }>
  > = {
    approved: { tone: 'good', text: copy.broadcasts.outcome.approved },
    'sent-back': { tone: 'good', text: copy.broadcasts.outcome.sentBack },
    submitted: { tone: 'good', text: copy.broadcasts.outcome.submitted },
    stopped: { tone: 'good', text: copy.broadcasts.outcome.stopped },
    refused: { tone: 'bad', text: copy.broadcasts.refused },
    raced: { tone: 'bad', text: copy.broadcasts.raced },
  };
  const message = messages[code];
  if (!message) return null;

  return (
    <div className="pt-4">
      <Notice tone={message.tone} title={message.text} live="polite">
        {''}
      </Notice>
    </div>
  );
}
