import { redirect } from 'next/navigation';

import { DashboardShell } from '@/components/DashboardShell';
import { PageHeader } from '@/components/PageHeader';
import { copy } from '@/copy/en';
import { createServerComponentClient } from '@/lib/supabase/server';
import { authorize } from '@/server/authorize';
import { postingAudience } from '@/server/events';

import { saveEventAction } from '../actions';
import { EventForm } from '../EventForm';

export const dynamic = 'force-dynamic';

/**
 * Posting an event (NEW EVENT frame, approved 2026-08-20).
 *
 * `manage_events` is asked for by name rather than checked as `role !== 'member'`, and the
 * ministry-wide control appears only for an admin, because `manage_ministry_events` is its
 * own action. Neither is what STOPS a leader posting to the whole family: the insert takes
 * the branch from the caller's own profile and `can_moderate_branch(null)` refuses the
 * ministry-wide row. This layer decides what the screen offers.
 */
export default async function NewEventPage() {
  const supabase = await createServerComponentClient();
  const verdict = await authorize(supabase, { action: 'manage_events' });

  if (!verdict.ok) {
    if (verdict.reason === 'unauthenticated') redirect('/sign-in');
    if (
      verdict.reason === 'mfa_enrolment_required' ||
      verdict.reason === 'mfa_challenge_required'
    ) {
      redirect('/mfa');
    }
    redirect('/events');
  }

  const { caller } = verdict;
  const ministry = await authorize(supabase, {
    action: 'manage_ministry_events',
  });

  // How many people posting would actually reach, from the SAME definition the notice job
  // uses: the branch, minus anyone who switched branch updates off. It has to be a definer
  // function rather than a count from here, because a leader cannot read another member's
  // `notification_prefs` at all, and a count that ignored the gate would promise a number
  // the notice is never going to reach.
  const reachable = await postingAudience(supabase, caller.branchId);

  return (
    <DashboardShell caller={caller} current="events">
      <PageHeader
        title={copy.events.createTitle}
        scope={copy.events.createScope(caller.branchName)}
      />
      <EventForm
        save={saveEventAction}
        branchName={caller.branchName}
        canPostMinistry={ministry.ok}
        audience={{ going: 0, interested: 0, reachable }}
        defaults={{
          scope: 'branch',
          picture: { url: null, kind: 'none' },
          title: '',
          description: '',
          startsAtLocal: '',
          endsAtLocal: '',
          location: '',
          rsvpEnabled: true,
        }}
      />
    </DashboardShell>
  );
}
