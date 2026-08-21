import { notFound, redirect } from 'next/navigation';

import { DashboardShell } from '@/components/DashboardShell';
import { PageHeader } from '@/components/PageHeader';
import { Notice } from '@/components/ui/Notice';
import { copy } from '@/copy/en';
import { createServerComponentClient } from '@/lib/supabase/server';
import { authorize } from '@/server/authorize';
import { loadBranch } from '@/server/branches';

import { reopenBranchAction } from '../../actions';
import { ConfirmForm } from '../../ConfirmForm';

export const dynamic = 'force-dynamic';

/**
 * Opening a closed branch again (RE-OPEN frame, approved 2026-08-21).
 *
 * THE SECOND BANNER IS THE POINT OF THE SCREEN. Re-opening is not an undo, and a control
 * that let somebody believe it was would be worse than no control at all: the cancelled
 * gatherings stay cancelled because people were already told, and the members who chose a
 * new home stay where they went because that was theirs to choose. `restore_branch` does
 * exactly one thing, and this page says exactly that.
 *
 * No typed name here, unlike closing. Opening a branch takes nothing away from anybody, so
 * the fresh code is pause enough; asking for a name as well would be ritual without reason.
 */
export default async function ReopenBranchPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
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

  const { slug } = await params;
  const branch = await loadBranch(supabase, slug);
  if (!branch) notFound();
  if (branch.status === 'active') redirect(`/branches/${slug}`);

  return (
    <DashboardShell caller={verdict.caller} current="branches">
      <PageHeader
        title={copy.branches.reopenTitle(branch.name)}
        scope={copy.branches.reopenScope(
          branch.archivedBy ?? copy.branches.aMinistryAdmin,
          when(branch.archivedAt),
        )}
      />

      <Notice tone="off" title={copy.branches.reopenBackTitle}>
        {copy.branches.reopenBackBody}
      </Notice>

      <Notice tone="bad" title={copy.branches.reopenNotUndoTitle}>
        {copy.branches.reopenNotUndoBody}
      </Notice>

      <ConfirmForm
        act={reopenBranchAction}
        slug={branch.slug}
        submitLabel={copy.branches.reopenSubmit}
        pendingLabel={copy.branches.reopenPending}
        cancelLabel={copy.branches.reopenCancel}
        tone="primary"
      />
    </DashboardShell>
  );
}

function when(value: string | null): string {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(value));
}
