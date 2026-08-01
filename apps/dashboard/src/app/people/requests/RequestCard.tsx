import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Pill } from '@/components/ui/Pill';
import { copy } from '@/copy/en';
import {
  WAITING_TOO_LONG_MS,
  type BranchRequest,
} from '@/server/branchRequests';

import { decide } from './actions';

/**
 * One request, waiting (frame: `W2.7 · REQUESTS · the destination decides`).
 *
 * Approve is one click, because it is the common act and it is what clears the queue.
 * Refusing is a separate view rather than a disclosure inside this card: the frame makes it
 * a place you go, and the reason is that a refusal needs a note written for somebody else
 * to read years later, which is not a thing to type in a gap between two other people's
 * cards. It is a link, so the whole flow works without JavaScript.
 */
export function WaitingRequest({
  request,
  now,
}: {
  request: BranchRequest;
  now: number;
}) {
  const waited = now - new Date(request.createdAt).getTime();
  const days = Math.floor(waited / (24 * 60 * 60 * 1000));

  return (
    <article className="mb-3 rounded-card border border-cardline bg-card p-4">
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <Pill tone="notice">{copy.requests.wantsToJoin}</Pill>
        {waited >= WAITING_TOO_LONG_MS ? (
          <Pill tone="urgent">{copy.queue.waitingDays(days)}</Pill>
        ) : null}
        <time
          dateTime={request.createdAt}
          className="ml-auto text-label font-bold text-muted"
        >
          {relative(request.createdAt, now)}
        </time>
      </div>

      <Person request={request} emphasis="destination" />

      <div className="mt-4 flex flex-wrap items-center gap-2.5 border-t border-cardline pt-3.5">
        <form action={decide}>
          <input type="hidden" name="requestId" value={request.id} />
          <input type="hidden" name="decision" value="approve" />
          <Button type="submit">{copy.requests.approve}</Button>
        </form>
        {/* A link, not a script: the refusal view is a URL, so it survives a refresh and
            can be reached with the keyboard alone. The id is opaque and discloses nothing,
            which is why this surface may use the URL where `/people` may not. */}
        <a
          href={`/people/requests?refuse=${request.id}`}
          className="inline-flex min-h-12 items-center rounded-button border border-cardline bg-card px-5 text-body font-semibold text-text hover:bg-alt"
        >
          {copy.requests.refuseOpen}
        </a>
      </div>
    </article>
  );
}

/**
 * A move that already happened, out of this branch (frame: `who left us`).
 *
 * No actions, deliberately, and the absence is the point: the source branch is told after
 * the fact and cannot block somebody leaving (decision 14). Only approved moves reach here,
 * which the view enforces rather than this component.
 */
export function PastMove({ request }: { request: BranchRequest }) {
  return (
    <article className="mb-3 rounded-card border border-cardline bg-card p-4">
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <Pill tone="quiet">{copy.requests.leftPill}</Pill>
        {request.decidedAt ? (
          <time
            dateTime={request.decidedAt}
            className="ml-auto text-label font-bold text-muted"
          >
            {dayAndMonth(request.decidedAt)}
          </time>
        ) : null}
      </div>
      <Person request={request} emphasis="none" />
    </article>
  );
}

/** Who, and the move: `from -> to`, with the end that matters carrying the weight. */
export function Person({
  request,
  emphasis,
}: {
  request: BranchRequest;
  emphasis: 'destination' | 'none';
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Avatar name={request.displayName} />
      <div className="min-w-0">
        <p className="font-display text-[1.05rem] leading-snug font-extrabold break-words">
          {request.displayName}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-[0.78rem] text-muted">
          <span className="break-words">{request.fromBranchName}</span>
          <Arrow />
          <span
            className={
              emphasis === 'destination'
                ? 'font-extrabold break-words text-text'
                : 'break-words'
            }
          >
            {request.toBranchName}
          </span>
        </p>
      </div>
    </div>
  );
}

function Arrow() {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="flex-none"
    >
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  );
}

/** Plain relative time, from the platform rather than a date library. */
function relative(iso: string, now: number): string {
  const minutes = Math.round((new Date(iso).getTime() - now) / 60000);
  const format = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

  if (Math.abs(minutes) < 60) return format.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return format.format(hours, 'hour');
  return format.format(Math.round(hours / 24), 'day');
}

/**
 * `en-GB`, not `en`. Plain `en` is US-ordered and renders "May 14"; the frame says
 * "14 May", and so does everyone in Glasgow, Berlin, Emmen and Ogbomosho. The relative
 * times above need no locale because their shape does not vary this way.
 */
function dayAndMonth(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(iso));
}
