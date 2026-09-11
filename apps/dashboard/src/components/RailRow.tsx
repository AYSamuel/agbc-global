'use client';

import Link from 'next/link';
import { useSelectedLayoutSegment } from 'next/navigation';

import { copy } from '@/copy/en';

/**
 * One row of the rail, and the only client-side piece of the shell.
 *
 * WHY IT KNOWS WHICH ROW IS ACTIVE INSTEAD OF BEING TOLD (W4.12 slice 4). Until the
 * `(dashboard)` layout existed, every page rendered the whole shell itself and passed
 * `current="moderation"`, which meant 31 call sites across 24 files each had to name
 * themselves correctly and none of them could be checked. `useSelectedLayoutSegment()`
 * reads the same fact from the router, so the rail cannot disagree with the URL and the
 * prop is gone.
 *
 * THE SEGMENT COMES FROM THE HREF, not from `destination.key`. Those two look
 * interchangeable and are not: the sermon audio row is keyed `sermonAudio` while its
 * directory, and therefore its segment, is `sermon-audio`. Deriving it from the href keeps
 * one source, and it also handles the People row, whose href is `/people/requests` for a
 * leader while its segment is still `people`.
 *
 * This is the whole cost of the shell in JavaScript: eleven rows and a string compare.
 *
 * `<Link>` SINCE W4.12 SLICE 3, and that one word is what the whole item was for. Until it,
 * every rail click was a full browser document load: React torn down, 810 KB of JavaScript
 * re-parsed from cache, the rail itself rebuilt, and nothing on screen in the meantime but the
 * page the reader was trying to leave. Ayo's report was that the dashboard "doesn't feel like
 * a single page app", and it was not one.
 *
 * It had to come LAST of the three, not first. A client transition removes the browser's own
 * tab spinner and puts nothing in its place, so on its own it would have swapped a crude
 * signal for no signal at all, which is the "impression that the app is not responding" Next's
 * own docs name. The shared layout (slice 4) and the loading states (slice 5) are what make
 * this an improvement rather than a trade.
 *
 * The skip link in `app/layout.tsx` stays a plain `<a href="#main">` and should: it moves
 * focus within the page and navigates nowhere.
 */

export interface Destination {
  key: string;
  label: string;
  href?: string;
  phase?: 'B' | 'C';
  icon: string;
}

/** `/people/requests` -> `people`. The first path part IS the route segment. */
function segmentOf(href: string): string {
  return href.split('/')[1] ?? '';
}

export function RailRow({
  destination,
  count = 0,
}: {
  destination: Destination;
  count?: number;
}) {
  const segment = useSelectedLayoutSegment();
  const active =
    destination.href !== undefined && segmentOf(destination.href) === segment;

  const base =
    'flex items-center gap-2.5 rounded-control px-2.5 py-2.5 text-body font-bold';

  // A destination that does not exist yet is not a link and is not focusable: a keyboard
  // user should not tab through five dead stops to reach the content.
  if (!destination.href) {
    return (
      <span className={`${base} text-muted opacity-60`}>
        <span aria-hidden="true" className="w-4.5">
          {destination.icon}
        </span>
        {destination.label}
        {destination.phase ? (
          <>
            <span
              aria-hidden="true"
              className="ml-auto rounded-full bg-alt px-1.5 py-0.5 text-[0.56rem] font-extrabold tracking-wider uppercase"
            >
              {destination.phase}
            </span>
            {/* The dimming is not the message: say it out loud for assistive tech. */}
            <span className="sr-only">
              {copy.nav.notYet(destination.phase)}
            </span>
          </>
        ) : null}
      </span>
    );
  }

  return (
    <Link
      href={destination.href}
      aria-current={active ? 'page' : undefined}
      className={`${base} ${active ? 'bg-alt text-text' : 'text-sub hover:bg-alt'}`}
    >
      <span aria-hidden="true" className="w-4.5">
        {destination.icon}
      </span>
      {destination.label}
      {count > 0 ? (
        // The number is not the message: it is read out as part of the link's name, so a
        // screen reader hears "People, 2 waiting" rather than "People 2".
        <span className="ml-auto min-w-5 rounded-full bg-btn px-1.5 py-0.5 text-center text-[0.66rem] font-extrabold text-btn-text">
          <span aria-hidden="true">{count}</span>
          <span className="sr-only">{copy.nav.waiting(count)}</span>
        </span>
      ) : null}
    </Link>
  );
}
