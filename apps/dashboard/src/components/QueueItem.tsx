import { QueueActions } from '@/components/QueueActions';
import { Pill } from '@/components/ui/Pill';
import { copy } from '@/copy/en';
import type { QueueItem as Item } from '@/server/moderationQueue';

/**
 * One pending item, from `design/mockups/dashboard.html`.
 *
 * The whole item is on the card: type, language, how long it has waited, the words, the
 * photo, and who and where. Bodies cap at 2000 characters (`02`), so there is no detail
 * pane and nothing to keep in sync with a list.
 */
export function QueueItem({
  item,
  now,
  filter,
}: {
  item: Item;
  now: number;
  filter?: string;
}) {
  const waitedDays = Math.floor(
    (now - new Date(item.createdAt).getTime()) / (24 * 60 * 60 * 1000),
  );
  // The 48h escalation in `17` §1 is the whole reason a queue has an age at all.
  const overdue = waitedDays >= 2;

  return (
    <article className="mb-3 rounded-card border border-cardline bg-card p-4">
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <Pill tone={item.kind === 'prayer' ? 'info' : 'notice'}>
          {copy.queue.kind[item.kind]}
        </Pill>
        <Pill tone="quiet">{item.language.toUpperCase()}</Pill>
        {overdue ? (
          <Pill tone="urgent">{copy.queue.waitingDays(waitedDays)}</Pill>
        ) : null}
        <time
          dateTime={item.createdAt}
          className="ml-auto text-label font-bold text-muted"
        >
          {relative(item.createdAt, now)}
        </time>
      </div>

      <p className="text-body leading-relaxed break-words text-text">
        {item.body}
      </p>

      {item.photoUrl ? (
        /* A short-lived signed URL from Supabase Storage. next/image is deliberately not
           used: the optimizer would fetch and cache UNAPPROVED content on our own origin,
           outliving the signed URL that was supposed to bound it. */
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.photoUrl}
          alt={copy.queue.photoAlt}
          className="mt-3 h-32 w-48 rounded-control border border-cardline object-cover"
        />
      ) : null}

      <p className="mt-3 flex flex-wrap items-center gap-2 text-label font-bold text-muted">
        <span>
          {item.isAnonymous ? copy.queue.anonymous : (item.authorName ?? '')}
        </span>
        <span aria-hidden="true">·</span>
        <span>{item.branchName}</span>
        {item.isAnsweredPrayer ? (
          <>
            <span aria-hidden="true">·</span>
            <span>{copy.queue.answeredPrayer}</span>
          </>
        ) : null}
      </p>

      <QueueActions item={item} filter={filter} />
    </article>
  );
}

/** Plain relative time. Intl.RelativeTimeFormat rather than a date library. */
function relative(iso: string, now: number): string {
  const diffMs = new Date(iso).getTime() - now;
  const minutes = Math.round(diffMs / 60000);
  const format = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

  if (Math.abs(minutes) < 60) return format.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return format.format(hours, 'hour');
  return format.format(Math.round(hours / 24), 'day');
}
