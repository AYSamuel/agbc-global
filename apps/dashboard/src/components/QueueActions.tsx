import { decide } from '@/app/moderation/actions';
import { Button } from '@/components/ui/Button';
import { copy } from '@/copy/en';
import type { QueueItem } from '@/server/moderationQueue';

/**
 * The three decisions (docs/spec/17 §1, W2.7 slice 3).
 *
 * Plain forms posting to a Server Action, so the whole thing works with HTML alone: no
 * JavaScript, no dialogs. That matters more than it sounds. `confirm()` is unusable for
 * some assistive tech, cannot be styled to say WHY, and vanishes if scripts fail.
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
  filter,
}: {
  item: QueueItem;
  filter?: string;
}) {
  return (
    <div className="mt-4 flex flex-wrap items-start gap-2.5 border-t border-cardline pt-3.5">
      <form action={decide}>
        <Hidden item={item} filter={filter} decision="approve" />
        <Button type="submit">{copy.queue.actions.approve}</Button>
      </form>

      <details className="group">
        <summary className="inline-flex min-h-12 cursor-pointer list-none items-center rounded-button border border-controlline bg-card px-5 text-body font-semibold text-text">
          {copy.queue.actions.rejectOpen}
        </summary>
        <form action={decide} className="mt-3 flex max-w-prose flex-col gap-2">
          <Hidden item={item} filter={filter} decision="reject" />
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
            className="rounded-control border border-cardline bg-card px-4 py-3 text-body text-text"
          />
          <div>
            <Button type="submit" variant="secondary">
              {copy.queue.actions.rejectSubmit}
            </Button>
          </div>
        </form>
      </details>

      <details className="group ml-auto">
        <summary className="inline-flex min-h-12 cursor-pointer list-none items-center rounded-button border border-danger px-5 text-body font-semibold text-danger">
          {copy.queue.actions.removeOpen}
        </summary>
        <form action={decide} className="mt-3 flex max-w-prose flex-col gap-2">
          <Hidden item={item} filter={filter} decision="remove" />
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
            className="rounded-control border border-cardline bg-card px-4 py-3 text-body text-text"
          />
          <div>
            <Button type="submit" variant="secondary">
              {copy.queue.actions.removeSubmit}
            </Button>
          </div>
        </form>
      </details>
    </div>
  );
}

function Hidden({
  item,
  filter,
  decision,
}: {
  item: QueueItem;
  filter?: string;
  decision: string;
}) {
  return (
    <>
      <input type="hidden" name="kind" value={item.kind} />
      <input type="hidden" name="id" value={item.id} />
      {/* The version this reviewer actually read. The database refuses the decision if
          the author has moved on since (PT409 -> "content changed since review"). */}
      <input type="hidden" name="reviewedUpdatedAt" value={item.updatedAt} />
      <input type="hidden" name="decision" value={decision} />
      {filter ? <input type="hidden" name="filter" value={filter} /> : null}
    </>
  );
}
