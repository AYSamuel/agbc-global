'use client';

import * as Sentry from '@sentry/nextjs';
import { useOptimistic, useState } from 'react';

import { QueueItem } from '@/components/QueueItem';
import { Alert } from '@/components/ui/Alert';
import { copy } from '@/copy/en';
import type { QueueItem as Item } from '@/server/moderationQueue';

import { decide, type DecisionOutcome } from './actions';

/**
 * The queue a leader actually clears (W4.13).
 *
 * A DECIDED ITEM LEAVES THE SCREEN AT ONCE, and that is the whole point. Until now every
 * decision cost a full server round trip before anything moved: W4.12 measured the render
 * behind it at 187 ms locally and the dashboard's functions run in Washington while the
 * database is in Frankfurt, so in production a reviewer clearing twenty items waited twenty
 * times for a row to disappear that they had already decided about.
 *
 * The optimistic list is the client's answer; `revalidatePath('/moderation')` in the action
 * is the server's. WHEN THE SERVER DISAGREES, THE ITEM COMES BACK, which is exactly what
 * should happen: `moderateItem()` refuses a decision whose `reviewedUpdatedAt` no longer
 * matches the row, because the post was edited after this reviewer read it. Optimism here is
 * a guess about latency, never about authority. The database is still the only thing that
 * decides, and a refusal is announced rather than swallowed.
 *
 * THE OUTCOME NO LONGER TRAVELS IN THE URL. `?outcome=approved` and a redirect were how every
 * dashboard surface reported itself, and they still are everywhere else; this screen is the
 * first to spend the no-JavaScript decision (Ayo, 2026-09-10) because it is the one where the
 * round trip was most felt. The inconsistency is deliberate and temporary: the other five
 * surfaces move when there is reason to touch them, not in a sweep for tidiness.
 */
export function Queue({
  items,
  now,
  scope,
}: {
  items: Item[];
  /** The instant the queue was read, so the relative times cannot drift from the counts. */
  now: number;
  /** Whose queue this is: a leader's branch name, or every branch for an admin. */
  scope: string;
}) {
  const [outcome, setOutcome] = useState<DecisionOutcome | null>(null);

  // Keyed by id rather than index: the list is reordered by the server on every revalidate.
  const [visible, removeOptimistically] = useOptimistic(
    items,
    (current: Item[], removedId: string) =>
      current.filter((item) => item.id !== removedId),
  );

  /**
   * The form action every decision on every card submits to.
   *
   * `removeOptimistically` is called INSIDE the action, which is what lets React treat it as
   * an optimistic update rather than a stray state write: an action function is already
   * running in a transition, so the removal is applied immediately and rolled back on its own
   * if the transition ends without the server agreeing.
   */
  const onDecide = async (formData: FormData) => {
    const id = formData.get('id');
    if (typeof id === 'string') removeOptimistically(id);

    try {
      setOutcome(await decide(formData));
    } catch (error) {
      // The offline case, and the one an optimistic list makes worse if it is left alone.
      // A rejected action ends the transition, so React puts the row back on its own, and
      // without this the reviewer would watch an item vanish and silently return with no
      // account of why. `unreachable` says less than `failed` on purpose: a request that
      // never answered may still have been carried out.
      Sentry.captureException(error);
      setOutcome({ ok: false, reason: 'unreachable' });
    }
  };

  return (
    <>
      {outcome ? (
        <div className="mt-4">
          <Alert tone={outcome.ok ? 'info' : 'error'}>
            {outcome.ok
              ? copy.queue.outcome[DONE[outcome.decision]]
              : (OUTCOMES[outcome.reason] ?? copy.queue.outcome.failed)}
          </Alert>
        </div>
      ) : null}

      {visible.length === 0 ? (
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
          {visible.map((item) => (
            <QueueItem
              key={item.id}
              item={item}
              now={now}
              onDecide={onDecide}
            />
          ))}
        </>
      )}
    </>
  );
}

const DONE = {
  approve: 'approved',
  reject: 'rejected',
  remove: 'removed',
} as const;

/** The refusals the database can answer with, in the reviewer's words. */
const OUTCOMES: Record<string, string> = {
  content_changed: copy.queue.outcome.contentChanged,
  refused: copy.queue.outcome.refused,
  restore_needs_admin: copy.queue.outcome.restoreNeedsAdmin,
  missing_reason: copy.queue.outcome.missingReason,
  failed: copy.queue.outcome.failed,
  unreachable: copy.queue.outcome.unreachable,
};
