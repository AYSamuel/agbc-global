import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { DashboardShell } from '@/components/DashboardShell';
import { PageHeader } from '@/components/PageHeader';
import { Notice } from '@/components/ui/Notice';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { copy } from '@/copy/en';
import { createServerComponentClient } from '@/lib/supabase/server';
import { authorize } from '@/server/authorize';
import { loadAudience, loadEvent } from '@/server/events';

import { saveEventAction, setStatusAction } from '../actions';
import { EventForm } from '../EventForm';

export const dynamic = 'force-dynamic';

/**
 * Editing an event (EDIT frame, approved 2026-08-20).
 *
 * The banner above the fields is the whole point of the screen: a change to the time or the
 * place tells everyone still holding an RSVP, and the count it names comes from
 * `event_rsvp_audience`, which is the same set the notice reaches. A number a leader is
 * deciding against must not be an estimate.
 *
 * CANCELLING IS A SEPARATE SCREEN, not a dialog. A browser dialog would be a modal over a
 * form the reader was mid-way through, and the thing that has to be read before confirming
 * (who hears, what survives, how long the undo lasts) does not fit in one.
 */
export default async function EventPage({
  params,
}: {
  params: Promise<{ id: string }>;
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
  const { id } = await params;
  const event = await loadEvent(supabase, caller, id);
  if (!event) notFound();

  // A leader may READ a ministry-wide event (their members are invited to it) and may not
  // edit it. Sending them back rather than rendering a form the database would refuse.
  if (!event.editable) redirect('/events');

  const audience = await loadAudience(supabase, event.id);

  return (
    <DashboardShell caller={caller} current="events">
      <PageHeader
        title={event.title}
        scope={
          event.branchId === null
            ? copy.events.ministryScopeNote
            : `${event.branchName ?? ''} · ${copy.events.goingAndInterested(
                audience.going,
                audience.interested,
              )}`
        }
      />

      <div className="pt-2">
        <Link
          href="/events"
          className="text-body font-bold text-blue underline-offset-4 hover:underline"
        >
          {copy.events.backToEvents}
        </Link>
      </div>

      {event.status === 'cancelled' && (
        <div className="pt-4">
          <Notice tone="bad" title={copy.events.cancelledPill}>
            {copy.events.reinstateNote}
          </Notice>
          <form action={setStatusAction} className="mt-3">
            <input type="hidden" name="id" value={event.id} />
            <input type="hidden" name="status" value="scheduled" />
            <SubmitButton
              variant="secondary"
              label={copy.events.reinstate}
              pendingLabel={copy.events.reinstating}
            />
          </form>
        </div>
      )}

      <EventForm
        save={saveEventAction}
        branchName={event.branchName ?? caller.branchName}
        canPostMinistry={caller.role === 'admin'}
        audience={audience}
        cancelHref={
          event.status === 'scheduled'
            ? `/events/${event.id}/cancel`
            : undefined
        }
        defaults={{
          id: event.id,
          scope: event.branchId === null ? 'ministry' : 'branch',
          title: event.title,
          description: event.description,
          startsAtLocal: event.startsAtLocal,
          endsAtLocal: event.endsAtLocal ?? '',
          location: event.location,
          rsvpEnabled: event.rsvpEnabled,
        }}
      />
    </DashboardShell>
  );
}
