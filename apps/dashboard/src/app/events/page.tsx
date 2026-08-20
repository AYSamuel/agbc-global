import Link from 'next/link';
import { redirect } from 'next/navigation';

import { DashboardShell } from '@/components/DashboardShell';
import { PageHeader } from '@/components/PageHeader';
import { Notice } from '@/components/ui/Notice';
import { Pill } from '@/components/ui/Pill';
import { copy } from '@/copy/en';
import { createServerComponentClient } from '@/lib/supabase/server';
import { authorize } from '@/server/authorize';
import { loadEvents, type EventRow } from '@/server/events';

import { eventWhen } from './format';

export const dynamic = 'force-dynamic';

/**
 * The events list (docs/spec/17 §3, `11`).
 *
 * NO FRAME, on the W2.7 rule: title, date, place and status is a conventional list and not a
 * decision. The three surfaces that ARE decisions (posting, moving, cancelling) have frames
 * of their own, because each is a sentence about who is about to hear from the church.
 *
 * A leader sees their own branch and the ministry-wide events their members are invited to;
 * the second are read-only for them, and the card says so rather than offering a control the
 * database would refuse.
 */
export default async function EventsPage({
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
  const lists = await loadEvents(supabase, caller);

  return (
    <DashboardShell caller={caller} current="events">
      <PageHeader title={copy.events.title} scope={copy.events.scope} />

      {outcome && <Outcome code={outcome} />}

      <div className="pt-4">
        <Link
          href="/events/new"
          className="inline-flex min-h-12 items-center rounded-button bg-btn px-5 text-body font-extrabold text-btn-text"
        >
          {copy.events.newEvent}
        </Link>
      </div>

      {lists.upcoming.length > 0 && (
        <section aria-labelledby="upcoming-heading">
          <h2
            id="upcoming-heading"
            className="px-0.5 pt-5 pb-2.5 text-caption font-extrabold tracking-widest text-muted uppercase"
          >
            {copy.events.upcomingHeading}
          </h2>
          {lists.upcoming.map((row) => (
            <EventCard key={row.id} event={row} />
          ))}
        </section>
      )}

      {lists.past.length > 0 && (
        <section aria-labelledby="past-heading">
          <h2
            id="past-heading"
            className="px-0.5 pt-5 pb-2.5 text-caption font-extrabold tracking-widest text-muted uppercase"
          >
            {copy.events.pastHeading}
          </h2>
          {lists.past.map((row) => (
            <EventCard key={row.id} event={row} />
          ))}
        </section>
      )}

      {lists.upcoming.length === 0 && lists.past.length === 0 && (
        <div className="pt-8">
          <Notice tone="off" title={copy.events.emptyTitle}>
            {copy.events.emptyBody}
          </Notice>
        </div>
      )}
    </DashboardShell>
  );
}

function EventCard({ event }: { event: EventRow }) {
  return (
    <article className="mb-3 rounded-card border border-cardline bg-card p-4.5">
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        {/* Blue for the whole family, the file's neutral classification wash; a branch is
            metadata and wears the quiet one. */}
        <Pill tone={event.branchId === null ? 'info' : 'quiet'}>
          {event.branchName ?? copy.events.ministryWide}
        </Pill>
        {event.status === 'cancelled' && (
          <Pill tone="urgent">{copy.events.cancelledPill}</Pill>
        )}
        {!event.rsvpEnabled && <Pill tone="quiet">{copy.events.rsvpOff}</Pill>}
      </div>
      <h3 className="font-display text-h3 font-extrabold text-text">
        {event.title}
      </h3>
      <p className="mt-1 text-body text-sub">
        <When startsAtLocal={event.startsAtLocal} /> · {event.location}
      </p>
      <div className="mt-3 flex items-center gap-3 border-t border-cardline pt-3">
        {event.editable ? (
          <Link
            href={`/events/${event.id}`}
            className="text-body font-bold text-blue underline-offset-4 hover:underline"
          >
            {copy.events.open}
          </Link>
        ) : (
          <span className="text-small font-bold text-muted">
            {copy.events.readOnly}
          </span>
        )}
      </div>
    </article>
  );
}

/**
 * The event's own wall clock, in words.
 *
 * Never converted into the reader's zone: `02` stores an event as wall clock plus an IANA
 * zone precisely so a change in that zone's law cannot move a church service, and a leader
 * in Glasgow reading a Berlin event needs Berlin's clock, not their own.
 */
function When({ startsAtLocal }: { startsAtLocal: string }) {
  return <time dateTime={startsAtLocal}>{eventWhen(startsAtLocal)}</time>;
}

/** What just happened, announced rather than only shown. */
function Outcome({ code }: { code: string }) {
  const messages: Partial<
    Record<string, { tone: 'good' | 'bad'; text: string }>
  > = {
    posted: { tone: 'good', text: copy.events.outcome.posted },
    'posted-ministry': {
      tone: 'good',
      text: copy.events.outcome.postedMinistry,
    },
    saved: { tone: 'good', text: copy.events.outcome.saved },
    'saved-and-told': { tone: 'good', text: copy.events.outcome.savedAndTold },
    cancelled: { tone: 'good', text: copy.events.outcome.cancelled },
    reinstated: { tone: 'good', text: copy.events.outcome.reinstated },
    'already-started': {
      tone: 'bad',
      text: copy.events.outcome.alreadyStarted,
    },
    refused: { tone: 'bad', text: copy.events.problems.refused },
    failed: { tone: 'bad', text: copy.events.problems.failed },
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
