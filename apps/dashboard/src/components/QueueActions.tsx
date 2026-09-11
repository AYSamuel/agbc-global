import { SubmitButton } from '@/components/ui/SubmitButton';
import { copy } from '@/copy/en';
import type { QueueItem } from '@/server/moderationQueue';

/**
 * The three decisions (docs/spec/17 §1, W2.7 slice 3).
 *
 * Plain forms posting to a Server Action, and no dialogs. `confirm()` is unusable for some
 * assistive tech, cannot be styled to say WHY, and vanishes if scripts fail.
 *
 * THE ACTION ARRIVES AS A PROP since W4.13, rather than being imported here. `Queue.tsx` wraps
 * it so a decided item can leave the screen before the server answers, and a component that
 * imported the action directly could not be given that wrapper. It also means this file no
 * longer works with scripts off: that was true of the whole queue until W4.13 and is the
 * deliberate cost of the optimistic list (Ayo dropped the no-JavaScript requirement for this
 * staff tool on 2026-09-10). The `filter` hidden field went with the redirect it fed.
 *
 * All three go through `SubmitButton`, which is what `SubmitButton.tsx` was written for and
 * did not get until W4.12. Until then these were the busiest controls in the product and the
 * only feedback on a click was the page eventually changing: a decision takes a server round
 * trip, and a control that stays live while it works is a control that invites the second
 * press. The database refuses the duplicate, so the damage was always bounded, but a reviewer
 * clearing a queue should not have to find that out. Each says which decision is in flight
 * rather than "Loading", because the three sit side by side. It degrades correctly with
 * scripts off: `useFormStatus` reports nothing and the button is an ordinary submit.
 *
 * Friction is placed where the decision is irreversible, and nowhere else (decided
 * 2026-07-29):
 *
 *  - **Approve** is one click. It is the common action, it is what actually clears the
 *    queue, and a leader can put it back by re-moderating.
 *  - **Reject** opens a disclosure with a required reason, which is its own deliberate
 *    step. The reason reaches the author in MY-POSTS (`09`).
 *  - **Remove** opens a disclosure that says plainly that only an admin can undo it, and
 *    requires a note that the author never sees. That disclosure IS the confirmation.
 *
 * Every form carries the `updated_at` the reviewer had on screen. That is the whole
 * compare-and-set: without it the database cannot tell a fresh decision from a stale one
 * (pgTAP 017).
 */
export function QueueActions({
  item,
  onDecide,
}: {
  item: QueueItem;
  onDecide: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-start gap-2.5 border-t border-cardline pt-3.5">
      <form action={onDecide}>
        <Hidden item={item} decision="approve" />
        <SubmitButton
          label={copy.queue.actions.approve}
          pendingLabel={copy.queue.actions.approvePending}
        />
      </form>

      <details className="group">
        <summary className="inline-flex min-h-12 cursor-pointer list-none items-center rounded-button border border-controlline bg-card px-5 text-body font-semibold text-text">
          {copy.queue.actions.rejectOpen}
        </summary>
        <form
          action={onDecide}
          className="mt-3 flex max-w-prose flex-col gap-2"
        >
          <Hidden item={item} decision="reject" />
          <label
            htmlFor={`reject-${item.id}`}
            className="text-body font-semibold text-text"
          >
            {copy.queue.actions.rejectLabel}
          </label>
          <textarea
            id={`reject-${item.id}`}
            name="rejectionReason"
            required
            rows={3}
            className="rounded-control border border-controlline bg-card px-4 py-3 text-body text-text"
          />
          <div>
            <SubmitButton
              variant="secondary"
              label={copy.queue.actions.rejectSubmit}
              pendingLabel={copy.queue.actions.rejectPending}
            />
          </div>
        </form>
      </details>

      <details className="group ml-auto">
        <summary className="inline-flex min-h-12 cursor-pointer list-none items-center rounded-button border border-danger px-5 text-body font-semibold text-danger">
          {copy.queue.actions.removeOpen}
        </summary>
        <form
          action={onDecide}
          className="mt-3 flex max-w-prose flex-col gap-2"
        >
          <Hidden item={item} decision="remove" />
          {/* The confirmation, in words rather than a dialog: it says what is about to
              happen and why it cannot be taken back. */}
          <p
            role="note"
            className="rounded-control border border-danger px-4 py-3 text-body leading-relaxed text-danger"
          >
            {copy.queue.actions.removeWarning}
          </p>
          <label
            htmlFor={`remove-${item.id}`}
            className="text-body font-semibold text-text"
          >
            {copy.queue.actions.removeLabel}
          </label>
          <textarea
            id={`remove-${item.id}`}
            name="moderationNote"
            required
            rows={3}
            className="rounded-control border border-controlline bg-card px-4 py-3 text-body text-text"
          />
          <div>
            <SubmitButton
              variant="secondary"
              label={copy.queue.actions.removeSubmit}
              pendingLabel={copy.queue.actions.removePending}
            />
          </div>
        </form>
      </details>
    </div>
  );
}

function Hidden({ item, decision }: { item: QueueItem; decision: string }) {
  return (
    <>
      <input type="hidden" name="kind" value={item.kind} />
      <input type="hidden" name="id" value={item.id} />
      {/* The version this reviewer actually read. The database refuses the decision if
          the author has moved on since (PT409 -> "content changed since review"). */}
      <input type="hidden" name="reviewedUpdatedAt" value={item.updatedAt} />
      <input type="hidden" name="decision" value={decision} />
    </>
  );
}
