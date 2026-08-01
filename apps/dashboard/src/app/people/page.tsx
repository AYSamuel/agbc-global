import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { DashboardShell } from '@/components/DashboardShell';
import { PageHeader } from '@/components/PageHeader';
import { Notice } from '@/components/ui/Notice';
import { copy } from '@/copy/en';
import { createServerComponentClient } from '@/lib/supabase/server';
import { listActiveBranches } from '@/server/assignRole';
import { authorize, type Caller } from '@/server/authorize';

import { assign, find } from './actions';
import { PeoplePanel } from './PeoplePanel';

export const dynamic = 'force-dynamic';

/**
 * People: roles, and the branch that comes with one (docs/spec/17 §People, ADR 0015).
 *
 * ADMIN ONLY, and asked for by name rather than checked here: `authorize()` answers
 * `assign_role`, so the rule lives with every other authority decision this app makes and
 * cannot be forgotten by the next route. A leader who follows the rail here is told so
 * inside the shell, with their own queue one click away, rather than being bounced to a
 * bare refusal screen. The rail link is theirs too, because `/people/requests` is the
 * next slice and it belongs to leaders.
 *
 * The page itself holds no person. It reads the branch list, hands it to the panel, and
 * every fact about a member arrives through a POST that leaves no trace in the URL.
 */
export default async function PeoplePage() {
  const supabase = await createServerComponentClient();
  const verdict = await authorize(supabase, { action: 'assign_role' });

  if (!verdict.ok) {
    if (verdict.reason === 'unauthenticated') redirect('/sign-in');
    if (
      verdict.reason === 'mfa_enrolment_required' ||
      verdict.reason === 'mfa_challenge_required'
    ) {
      redirect('/mfa');
    }
    if (verdict.reason === 'not_admin' && verdict.caller) {
      return (
        <Frame caller={verdict.caller}>
          <Notice
            tone="off"
            title={copy.refused.notAdminTitle}
            action={
              // Never a dead end: a leader who follows the rail here is handed the
              // surface that IS theirs, rather than being told what is not.
              <a
                href="/people/requests"
                className="inline-flex min-h-12 items-center rounded-button border border-cardline bg-card px-5 text-body font-semibold text-text hover:bg-alt"
              >
                {copy.refused.notAdminAction}
              </a>
            }
          >
            {copy.refused.notAdminBody}
          </Notice>
        </Frame>
      );
    }
    // A member, a closed account, or a session with no profile: `/` is where those
    // explanations live, and they are about the person rather than this screen.
    redirect('/');
  }

  // Throws rather than degrading, like the queue: a People screen with no branches to
  // choose from is not a lesser version of itself, it is a broken one, and the segment's
  // error boundary already says so with a way to retry.
  const branches = await listActiveBranches(supabase);

  return (
    <Frame caller={verdict.caller}>
      {/* An admin decides branch requests too, immediately when the destination has no
          leader and after 48 hours when it does, so their People screen has to reach
          that queue rather than leaving it to a typed URL. */}
      <p className="mt-3">
        <a
          href="/people/requests"
          className="text-body font-semibold text-blue underline-offset-4 hover:underline"
        >
          {copy.people.toRequests}
        </a>
      </p>
      <PeoplePanel branches={branches} find={find} assign={assign} />
    </Frame>
  );
}

function Frame({ caller, children }: { caller: Caller; children: ReactNode }) {
  return (
    <DashboardShell caller={caller} current="people">
      <PageHeader title={copy.people.title} scope={copy.people.scope} />
      {children}
    </DashboardShell>
  );
}
