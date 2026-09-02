import { act } from '@/app/reports/actions';
import { Button } from '@/components/ui/Button';
import { copy } from '@/copy/en';
import type { ReportedItem } from '@/server/reportsInbox';

/**
 * What a leader can do about a reported post (docs/spec/17 §1, frame `REPORTS`).
 *
 * Plain forms posting to a Server Action, like `QueueActions`: no JavaScript, no dialogs.
 * Two of these decide the reports, two decide the post, and all four go through one
 * action so the reports close with the decision rather than in a second click.
 *
 * FLAG IS NOT A RESOLUTION. It classifies the report and leaves the card exactly where it
 * is, because the post still has to be decided and the safeguarding duty is a separate
 * thing that outlives whatever is decided (`02`). It disappears once flagged, since the
 * flag is one-way here: unflagging a safeguarding report is not a dashboard action.
 *
 * DISMISS DISAPPEARS ON A FLAGGED CARD, and the card says why in words above. The server
 * refuses it either way (`resolveReports`), so this is the shape of the rule and not the
 * rule itself.
 */
export function ReportedActions({ item }: { item: ReportedItem }) {
  const decided = item.contentStatus === 'removed';

  return (
    <div className="mt-4 flex flex-wrap items-start gap-2.5 border-t border-cardline pt-3.5">
      {item.isSafeguarding ? null : (
        <form action={act}>
          <Hidden item={item} action="dismiss" />
          <Button type="submit" variant="secondary">
            {copy.reports.actions.dismiss}
          </Button>
        </form>
      )}

      {/* Rejecting sends the post back to the author to fix; removing it already happened.
          Neither is offered on something already removed, which would only invite a
          decision the database will refuse. */}
      {decided ? null : (
        <details className="group">
          <summary className="inline-flex min-h-12 cursor-pointer list-none items-center rounded-button border border-controlline bg-card px-5 text-body font-semibold text-text">
            {copy.reports.actions.reject}
          </summary>
          <form action={act} className="mt-3 flex max-w-prose flex-col gap-2">
            <Hidden item={item} action="reject" />
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
      )}

      {item.isSafeguarding ? null : (
        <form action={act}>
          <Hidden item={item} action="flag_safeguarding" />
          <Button type="submit" variant="secondary">
            {copy.reports.actions.flag}
          </Button>
        </form>
      )}

      {decided ? null : (
        <details className="group ml-auto">
          <summary className="inline-flex min-h-12 cursor-pointer list-none items-center rounded-button border border-danger px-5 text-body font-semibold text-danger">
            {copy.reports.actions.remove}
          </summary>
          <form action={act} className="mt-3 flex max-w-prose flex-col gap-2">
            <Hidden item={item} action="remove" />
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
      )}
    </div>
  );
}

function Hidden({ item, action }: { item: ReportedItem; action: string }) {
  return (
    <>
      <input type="hidden" name="kind" value={item.kind} />
      <input type="hidden" name="id" value={item.id} />
      <input type="hidden" name="action" value={action} />
      {/* The version this leader actually read, for the same compare-and-set the queue
          uses: a post edited since the report was filed is a different post. */}
      <input type="hidden" name="reviewedUpdatedAt" value={item.updatedAt} />
    </>
  );
}
