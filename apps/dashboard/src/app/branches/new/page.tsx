import { redirect } from 'next/navigation';

import { DashboardShell } from '@/components/DashboardShell';
import { PageHeader } from '@/components/PageHeader';
import { copy } from '@/copy/en';
import { createServerComponentClient } from '@/lib/supabase/server';
import { authorize } from '@/server/authorize';
import { loadBranches } from '@/server/branches';

import { saveBranchAction } from '../actions';
import { BranchForm } from '../BranchForm';

export const dynamic = 'force-dynamic';

/**
 * Adding a branch (ADD BRANCH frame, approved 2026-08-21).
 *
 * `manage_branches` is asked for by name rather than checked as `role === 'admin'`, for the
 * reason at the top of `authorize.ts`: one place, one answer, so no future route can be
 * written that forgets it. Neither this nor the policy underneath it is what makes the act
 * safe on its own; both are.
 *
 * THE SUBTITLE COUNTS THE BRANCHES because the frame does, and because it is the quietest
 * possible way of saying what this page is about to do: this will be the fifth place AGBC
 * meets, and everyone will see it.
 */
export default async function NewBranchPage() {
  const supabase = await createServerComponentClient();
  const verdict = await authorize(supabase, { action: 'manage_branches' });

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

  const existing = await loadBranches(supabase);

  return (
    <DashboardShell caller={verdict.caller} current="branches">
      <PageHeader
        title={copy.branches.createTitle}
        scope={copy.branches.createScope(ordinal(existing.length + 1))}
      />
      <BranchForm save={saveBranchAction} />
    </DashboardShell>
  );
}

/** "fifth", not "5th": this sits in a sentence, not a table. */
function ordinal(value: number): string {
  const words = [
    'first',
    'second',
    'third',
    'fourth',
    'fifth',
    'sixth',
    'seventh',
    'eighth',
    'ninth',
    'tenth',
  ];
  return words[value - 1] ?? `${String(value)}th`;
}
