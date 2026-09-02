import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { DashboardShell } from '@/components/DashboardShell';
import { PageHeader } from '@/components/PageHeader';
import { Guide } from '@/components/ui/Guide';
import { Notice } from '@/components/ui/Notice';
import { Stat } from '@/components/ui/Stat';
import { copy } from '@/copy/en';
import { createServerComponentClient } from '@/lib/supabase/server';
import { authorize } from '@/server/authorize';
import { loadBranch, loadBranches, loadCloseImpact } from '@/server/branches';

import { closeBranchAction } from '../../actions';
import { ConfirmForm } from '../../ConfirmForm';

export const dynamic = 'force-dynamic';

/**
 * Closing a branch (CLOSE frames, approved 2026-08-21).
 *
 * ONE ROUTE, TWO SURFACES, because they are two states of one question rather than two
 * screens: while a leader still points at the branch there is nothing to confirm, so the
 * page states the block and offers the way out of it instead of a control the database
 * would refuse. That is the "a SURFACE is a STATE" rule (added 2026-08-08) applied where it
 * matters most: the blocked version is the one an admin meets FIRST.
 *
 * EVERY NUMBER COMES FROM `loadCloseImpact`, which reads the same definitions the act uses.
 * "46 people are told" is `event_rsvp_audience`, the definer function the notice job
 * announces to, not a count made here: a count made here would read every absent
 * `notification_prefs` row as the column default and promise one MORE person than the notice
 * reaches (caught by pgTAP the first time slice 4 ran it).
 */
export default async function CloseBranchPage({
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

  // Two refusals this page must not pretend to be able to ask about. Both are enforced by
  // `archive_branch`; sending the reader back is kinder than rendering a confirm that ends
  // in an error they could not have avoided.
  if (branch.status === 'archived') redirect(`/branches/${slug}`);
  if (branch.isHq) redirect(`/branches/${slug}`);

  const [impact, all] = await Promise.all([
    loadCloseImpact(supabase, branch),
    loadBranches(supabase),
  ]);
  const hq = all.find((row) => row.isHq);
  const blocked = impact.leaders.length > 0;

  return (
    <DashboardShell caller={verdict.caller} current="branches">
      <PageHeader
        title={copy.branches.closeTitle(branch.name)}
        scope={
          blocked
            ? copy.branches.closeBlockedScope(impact.leaders.length)
            : copy.branches.closeScope(branch.city)
        }
      />

      {blocked ? (
        <>
          <Notice
            tone="bad"
            title={copy.branches.closeBlockedTitle}
            action={
              <Link
                href="/people"
                className="inline-flex min-h-12 items-center rounded-button border border-controlline px-5 text-body font-bold whitespace-nowrap text-text hover:bg-alt"
              >
                {copy.branches.closeBlockedAction}
              </Link>
            }
          >
            {copy.branches.closeBlockedBody(list(impact.leaders))}
          </Notice>
          <Guide title={copy.branches.closeBlockedGuideTitle}>
            {copy.branches.closeBlockedGuideBody}
          </Guide>
          <div className="pt-4">
            <Link
              href={`/branches/${slug}`}
              className="text-body font-bold text-blue underline-offset-4 hover:underline"
            >
              {copy.branches.backToBranch}
            </Link>
          </div>
        </>
      ) : (
        <>
          {/* A `dl`, because Stat renders dd/dt: three numbers and what each one counts. */}
          <dl className="flex flex-wrap gap-2.5 pt-4">
            <Stat
              value={impact.membersToRehome}
              label={copy.branches.statMembers}
            />
            <Stat
              value={impact.gatheringsCancelled}
              label={copy.branches.statGatherings}
            />
            <Stat
              value={impact.broadcastsStopped}
              label={
                impact.broadcastsStopped === 1
                  ? copy.branches.statBroadcasts
                  : copy.branches.statBroadcastsPlural
              }
            />
          </dl>

          <Notice
            tone={impact.membersToRehome === 0 ? 'off' : 'bad'}
            title={
              impact.membersToRehome === 0
                ? copy.branches.closeMembersNone
                : copy.branches.closeMembersTitle(impact.membersToRehome)
            }
          >
            {impact.membersToRehome === 0
              ? ''
              : copy.branches.closeMembersBody(hq?.name ?? '')}
          </Notice>

          <Notice
            tone={impact.gatheringsCancelled === 0 ? 'off' : 'bad'}
            title={
              impact.gatheringsCancelled === 0
                ? copy.branches.closeEventsNone
                : copy.branches.closeEventsTitle(
                    impact.gatheringsCancelled,
                    impact.peopleTold,
                  )
            }
          >
            {impact.gatheringsCancelled === 0
              ? ''
              : copy.branches.closeEventsBody}
          </Notice>

          <Notice tone="off" title={copy.branches.closeKeptTitle}>
            {copy.branches.closeKeptBody}
          </Notice>

          <ConfirmForm
            act={closeBranchAction}
            slug={branch.slug}
            confirmName={branch.name}
            codeHint={copy.branches.closeCodeHint}
            submitLabel={copy.branches.closeSubmit}
            pendingLabel={copy.branches.closePending}
            cancelLabel={copy.branches.closeCancel}
          />
        </>
      )}
    </DashboardShell>
  );
}

/** "Henk de Vries and Samuel Okafor", the way a person would say it. */
function list(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
