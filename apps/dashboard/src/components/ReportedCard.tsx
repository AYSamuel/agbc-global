import { ReportedActions } from '@/components/ReportedActions';
import { Avatar } from '@/components/ui/Avatar';
import { Pill } from '@/components/ui/Pill';
import { copy } from '@/copy/en';
import type { ReportedItem } from '@/server/reportsInbox';

/**
 * One reported post, from the `REPORTS` frame in `design/mockups/dashboard.html`.
 *
 * ONE CARD PER POST, not per report: a leader reads the words once and decides once. The
 * count and the reasons ride inside the card, which is why the reasons are a list with
 * tallies rather than a repeated row.
 *
 * The reader's order is the frame's order and it is deliberate: the post first, the
 * reasons second. A leader who reads "someone may be at risk" before the words will find
 * risk in them.
 */
export function ReportedCard({
  item,
  now,
}: {
  item: ReportedItem;
  now: number;
}) {
  return (
    <article className="mb-3 rounded-card border border-cardline bg-card p-4">
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <Pill tone={item.kind === 'prayer' ? 'info' : 'notice'}>
          {copy.reports.kind[item.kind]}
        </Pill>
        <Pill tone="quiet">{item.language.toUpperCase()}</Pill>
        {item.reportCount > 1 ? (
          <Pill tone="urgent">
            {copy.reports.reportCount(item.reportCount)}
          </Pill>
        ) : null}
        {item.isSafeguarding ? (
          <Pill tone="urgent">{copy.reports.safeguardingPill}</Pill>
        ) : null}
        <time
          dateTime={item.firstReportedAt}
          className="ml-auto text-label font-bold text-muted"
        >
          {copy.reports.firstReported(relative(item.firstReportedAt, now))}
        </time>
      </div>

      <p className="text-body leading-relaxed break-words text-text">
        {item.body}
      </p>

      {/* No photo here, and not an oversight: a moderator reviewing a report needs the
          words, and a signed URL minted for every card would put unapproved images on a
          screen that may be read in a room with other people in it. The queue is where a
          photo is judged. */}

      <ul className="mt-3 flex flex-col gap-1.5 border-t border-cardline pt-3">
        {item.reasons.map((tally) => (
          <li key={tally.reason} className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              // min-width rather than a fixed square, like the frame's `.rc`: a tenth
              // report has two digits and must widen the badge, not be squeezed into it.
              className="grid h-[1.375rem] min-w-[1.375rem] flex-none place-items-center rounded-control bg-alt px-1 text-label font-extrabold text-text"
            >
              {tally.count}
            </span>
            {/* The badge is a number in a box, which says nothing on its own. The count
                is read out in words alongside the reason instead (the `Schedule` idiom). */}
            <span className="text-body text-sub">
              <span className="sr-only">
                {copy.reports.reasonCount(tally.count)}{' '}
              </span>
              {copy.reports.reasons[tally.reason] ?? copy.reports.unknownReason}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-3 flex flex-wrap items-center gap-2 text-label font-bold text-muted">
        {item.isAnonymous ? (
          <span
            aria-hidden="true"
            className="grid size-[1.875rem] flex-none place-items-center rounded-full bg-alt text-label font-bold text-muted"
          >
            ●
          </span>
        ) : (
          <Avatar name={item.authorName ?? ''} />
        )}
        <span>
          {item.isAnonymous ? copy.reports.anonymous : (item.authorName ?? '')}
        </span>
        <span aria-hidden="true">·</span>
        <span>{item.branchName}</span>
        <span aria-hidden="true">·</span>
        <span>{copy.reports.posted(posted(item.postedAt))}</span>
        {/* Reports outlive decisions, so a card can be sitting on a post that is already
            gone. Said in words rather than left for the leader to discover by removing
            something twice. */}
        {item.contentStatus === 'approved' ? null : (
          <>
            <span aria-hidden="true">·</span>
            <span>{copy.reports.contentStatus[item.contentStatus]}</span>
          </>
        )}
      </p>

      {item.isSafeguarding ? (
        <p
          role="note"
          className="mt-3 rounded-control bg-[rgba(224,52,44,0.08)] px-3 py-2.5 text-label leading-relaxed font-normal text-sub"
        >
          {copy.reports.flagged}
        </p>
      ) : null}

      <ReportedActions item={item} />
    </article>
  );
}

/** The day it was posted, spelled the way a person says it: "24 July". */
function posted(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(iso));
}

/** Plain relative time, the same shape the queue uses. */
function relative(iso: string, now: number): string {
  const minutes = Math.round((new Date(iso).getTime() - now) / 60000);
  const format = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

  if (Math.abs(minutes) < 60) return format.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return format.format(hours, 'hour');
  return format.format(Math.round(hours / 24), 'day');
}
