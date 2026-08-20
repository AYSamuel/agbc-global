import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { DashboardShell } from '@/components/DashboardShell';
import { PageHeader } from '@/components/PageHeader';
import { Notice } from '@/components/ui/Notice';
import { Stat } from '@/components/ui/Stat';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { copy } from '@/copy/en';
import { createServerComponentClient } from '@/lib/supabase/server';
import { authorize } from '@/server/authorize';
import { loadAudience, loadEvent } from '@/server/events';

import { setStatusAction } from '../../actions';
import { eventWhen } from '../../format';

export const dynamic = 'force-dynamic';

/**
 * The cancel confirmation (CANCEL frame, approved 2026-08-20).
 *
 * A PAGE RATHER THAN A DIALOG, deliberately. Three things have to be read before confirming
 * (who hears, that the event survives as a cancelled event rather than disappearing, and how
 * long the undo lasts) and none of them fits in a browser confirm, which would also be a
 * modal thrown over a form the leader was mid-way through.
 *
 * NO SECOND PAIR OF EYES, decided with Ayo 2026-08-20: broadcasts need an approver because a
 * broadcast is a message, and a cancellation is a fact. What stands in for it is the notice
 * job's two-minute settle window, which is why the copy here can honestly say that putting
 * the event back on straight away sends nothing at all.
 */
export default async function CancelEventPage({
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
  if (!event.editable) redirect('/events');
  // Already off: there is nothing here to confirm, and the edit screen is where it is put
  // back on.
  if (event.status === 'cancelled') redirect(`/events/${event.id}`);

  const audience = await loadAudience(supabase, event.id);

  return (
    <DashboardShell caller={caller} current="events">
      <PageHeader
        title={copy.events.cancelTitle(event.title)}
        scope={`${eventWhen(event.startsAtLocal)} · ${event.location}`}
      />

      <div className="mt-4 flex gap-2.5">
        <Stat value={audience.going} label={copy.events.cancelStats.going} />
        <Stat
          value={audience.interested}
          label={copy.events.cancelStats.interested}
        />
        <Stat
          value={audience.reachable}
          label={copy.events.cancelStats.reachable}
        />
      </div>

      {/* Nobody has RSVP'd: there is no audience to warn about, and "all 0 get" reads as a
          broken counter. The event still becomes a cancelled event, which is the other
          banner's business. */}
      <Notice
        tone={audience.reachable === 0 ? 'off' : 'bad'}
        title={
          audience.reachable === 0
            ? copy.events.cancelTellsNobodyTitle
            : copy.events.cancelWarningTitle
        }
      >
        {audience.reachable === 0
          ? copy.events.cancelTellsNobodyBody
          : copy.events.cancelWarningBody(audience.reachable)}
      </Notice>

      <Notice tone="off" title={copy.events.cancelKeepsTitle}>
        {copy.events.cancelKeepsBody}
      </Notice>

      <div className="mt-4 flex items-center gap-2.5 border-t border-cardline pt-3.5">
        <form action={setStatusAction}>
          <input type="hidden" name="id" value={event.id} />
          <input type="hidden" name="status" value="cancelled" />
          <SubmitButton
            variant="danger"
            label={copy.events.cancelConfirm}
            pendingLabel={copy.events.cancelling}
          />
        </form>
        <Link
          href={`/events/${event.id}`}
          className="inline-flex min-h-12 items-center px-2 text-body font-semibold text-blue underline-offset-4 hover:underline"
        >
          {copy.events.cancelKeep}
        </Link>
      </div>
    </DashboardShell>
  );
}
