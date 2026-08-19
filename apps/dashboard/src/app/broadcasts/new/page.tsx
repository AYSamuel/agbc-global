import { redirect } from 'next/navigation';

import { DashboardShell } from '@/components/DashboardShell';
import { PageHeader } from '@/components/PageHeader';
import { copy } from '@/copy/en';
import { createServerComponentClient } from '@/lib/supabase/server';
import { authorize } from '@/server/authorize';

import { saveDraftAction } from '../actions';
import { Composer } from './Composer';

export const dynamic = 'force-dynamic';

/**
 * Writing a broadcast (COMPOSE frame, approved 2026-08-19).
 *
 * `compose_broadcast` is asked for by name rather than checked as `role !== 'member'`, and
 * the ministry-scope control appears only for an admin, because `compose_ministry_broadcast`
 * is its own action. Neither of those is what STOPS a leader reaching the whole ministry:
 * `create_broadcast_draft()` refuses the call and takes the branch from the caller's own
 * profile. This layer decides what the screen offers; the database decides what happens.
 */
export default async function NewBroadcastPage() {
  const supabase = await createServerComponentClient();
  const verdict = await authorize(supabase, { action: 'compose_broadcast' });

  if (!verdict.ok) {
    if (verdict.reason === 'unauthenticated') redirect('/sign-in');
    if (
      verdict.reason === 'mfa_enrolment_required' ||
      verdict.reason === 'mfa_challenge_required'
    ) {
      redirect('/mfa');
    }
    redirect('/broadcasts');
  }

  const { caller } = verdict;
  const ministry = await authorize(supabase, {
    action: 'compose_ministry_broadcast',
  });

  const { data: branch } = await supabase
    .from('branches')
    .select('name')
    .eq('id', caller.branchId)
    .maybeSingle();
  const branchName = branch?.name ?? '';

  return (
    <DashboardShell caller={caller} current="broadcasts">
      <PageHeader
        title={copy.broadcasts.newBroadcast}
        scope={copy.broadcasts.scopeLabel.branch(branchName)}
      />
      <Composer
        save={saveDraftAction}
        branchName={branchName}
        canSendMinistry={ministry.ok}
        recipientHint={
          ministry.ok
            ? copy.broadcasts.hintAdmin
            : copy.broadcasts.hintLeader(branchName)
        }
      />
    </DashboardShell>
  );
}
