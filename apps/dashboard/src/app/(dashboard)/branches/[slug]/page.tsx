import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { PageHeader } from '@/components/PageHeader';
import { copy } from '@/copy/en';
import { createServerComponentClient } from '@/lib/supabase/server';
import { authorize } from '@/server/authorize';
import { loadBranch, loadHeadquarters } from '@/server/branches';

import { saveBranchAction } from '../actions';
import { BranchForm } from '../BranchForm';

export const dynamic = 'force-dynamic';

/**
 * Editing a branch (EDIT BRANCH frame, approved 2026-08-21).
 *
 * The two acts a branch can be subjected to live at the FOOT of this form, each leading to
 * its own page: closing it and moving the headquarters. Neither is a dialog, for the reason
 * the events cancel screen gives: what has to be read before confirming does not fit in one.
 *
 * The HQ banner needs to know which branch currently holds it, which is a fact about
 * ANOTHER row, so it is read here rather than guessed from this one. One row, in the same
 * wave as the branch itself (W4.13): it depends on nothing this page has yet.
 */
export default async function BranchPage({
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
  const [branch, hq] = await Promise.all([
    loadBranch(supabase, slug),
    loadHeadquarters(supabase),
  ]);
  if (!branch) notFound();

  return (
    <>
      <PageHeader
        title={branch.name}
        scope={
          branch.status === 'archived'
            ? copy.branches.editScopeClosed(
                branch.memberCount,
                when(branch.archivedAt),
              )
            : copy.branches.editScope(branch.memberCount, branch.timezone)
        }
      />

      <div className="pt-2">
        <Link
          href="/branches"
          className="text-body font-bold text-blue underline-offset-4 hover:underline"
        >
          {copy.branches.backToBranches}
        </Link>
      </div>

      <BranchForm
        save={saveBranchAction}
        existing={branch}
        headquarters={
          hq ? { name: hq.name, isThisOne: hq.id === branch.id } : undefined
        }
      />
    </>
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
