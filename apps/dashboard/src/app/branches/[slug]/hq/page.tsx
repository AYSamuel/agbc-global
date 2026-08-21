import { notFound, redirect } from 'next/navigation';

import { DashboardShell } from '@/components/DashboardShell';
import { PageHeader } from '@/components/PageHeader';
import { Notice } from '@/components/ui/Notice';
import { copy } from '@/copy/en';
import { createServerComponentClient } from '@/lib/supabase/server';
import { authorize } from '@/server/authorize';
import { loadBranch, loadBranches } from '@/server/branches';

import { moveHeadquartersAction } from '../../actions';
import { ConfirmForm } from '../../ConfirmForm';

export const dynamic = 'force-dynamic';

/**
 * Moving the headquarters (MOVE HQ frame, approved 2026-08-21).
 *
 * THREE CONSEQUENCES, AND THE FIRST IS THE ONE PEOPLE FORGET: `is_hq` is not a setting, it
 * is a gold badge drawn beside the branch name in the app's switcher and in the list new
 * members choose from. Moving it changes what every member sees, silently and immediately,
 * which is why this act asks for a fresh code and why the screen leads with the badge rather
 * than with the defaults.
 *
 * The other two are the reason it is refused in some states: HQ decides the default clock
 * for an event belonging to the whole family, and it is the one branch `archive_branch`
 * refuses to close. Handing it over hands both away.
 */
export default async function MoveHeadquartersPage({
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

  // Both are refusals `set_headquarters` makes; asking the question anyway would end in an
  // error the reader could not have avoided.
  if (branch.isHq) redirect(`/branches/${slug}`);
  if (branch.status !== 'active') redirect(`/branches/${slug}`);

  const all = await loadBranches(supabase);
  const current = all.find((row) => row.isHq);

  return (
    <DashboardShell caller={verdict.caller} current="branches">
      <PageHeader
        title={copy.branches.hqTitle(branch.name)}
        scope={copy.branches.hqScope(current?.name ?? '')}
      />

      <Notice tone="tell" title={copy.branches.hqBadgeTitle}>
        {copy.branches.hqBadgeBody}
      </Notice>

      <Notice tone="tell" title={copy.branches.hqDefaultsTitle}>
        {copy.branches.hqDefaultsBody(branch.timezone)}
      </Notice>

      <Notice
        tone="bad"
        title={copy.branches.hqLosesTitle(current?.name ?? '')}
      >
        {copy.branches.hqLosesBody}
      </Notice>

      <ConfirmForm
        act={moveHeadquartersAction}
        slug={branch.slug}
        codeHint={copy.branches.hqCodeHint}
        submitLabel={copy.branches.hqSubmit(branch.name)}
        pendingLabel={copy.branches.hqPending}
        cancelLabel={copy.branches.hqCancel(current?.name ?? '')}
        tone="primary"
      />
    </DashboardShell>
  );
}
