import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { copy } from '@/copy/en';
import type { BranchRequest } from '@/server/branchRequests';

import { LABEL } from '../fields';
import { decide } from './actions';
import { Person } from './RequestCard';

/**
 * Refusing, as its own view (frame: `W2.7 · REQUESTS · refusing`).
 *
 * A place you go rather than a box that unfolds under a card, because the note is written
 * for somebody who will read it years from now, and because what happens to it is worth
 * saying BEFORE it is written rather than after: the member never sees it, never learns who
 * decided, and the leader who wrote it cannot read it back (ADR 0015, decision 3 and its
 * consequence). That is the disclosure this screen owes them, and it sits above the button.
 *
 * The note is required by the database, not only by this form. `decide_branch_request`
 * refuses an empty one, so a submit that gets past the browser still cannot record a
 * refusal with no reason.
 */
export function RefuseForm({ request }: { request: BranchRequest }) {
  return (
    <>
      <h2 className="pt-5 text-label font-extrabold tracking-[0.14em] text-muted uppercase">
        {copy.requests.refusingLabel(request.displayName)}
      </h2>

      <article className="mt-3 rounded-card border border-cardline bg-card p-4">
        <Person request={request} emphasis="destination" />

        <form action={decide}>
          <input type="hidden" name="requestId" value={request.id} />
          <input type="hidden" name="decision" value="refuse" />

          <div className="mt-4">
            <label htmlFor="refuse-note" className={LABEL}>
              {copy.requests.noteLabel}
            </label>
            <textarea
              id="refuse-note"
              name="note"
              required
              rows={4}
              placeholder={copy.requests.notePlaceholder}
              className="mt-1.5 w-full rounded-control border border-cardline bg-card px-4 py-3 text-body leading-relaxed text-text"
            />
          </div>

          <Notice
            tone="off"
            title={copy.requests.privateTitle(request.displayName)}
          >
            {copy.requests.private(request.toBranchName)}
          </Notice>

          <div className="mt-4 flex flex-wrap items-center gap-2.5 border-t border-cardline pt-3.5">
            {/* The mockup's `.btn.danger`: outlined rather than filled, because refusing is
                not the primary act on this screen even when it is the right one. */}
            <Button
              type="submit"
              variant="secondary"
              className="border-danger text-danger"
            >
              {copy.requests.refuseSubmit}
            </Button>
            <a
              href="/people/requests"
              className="inline-flex min-h-12 items-center px-2 text-body font-semibold text-blue underline-offset-4 hover:underline"
            >
              {copy.requests.cancel}
            </a>
          </div>
        </form>
      </article>
    </>
  );
}
