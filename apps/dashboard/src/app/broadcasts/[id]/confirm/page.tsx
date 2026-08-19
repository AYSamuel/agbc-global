import { redirect } from 'next/navigation';

import { DashboardShell } from '@/components/DashboardShell';
import { PageHeader } from '@/components/PageHeader';
import { Notice } from '@/components/ui/Notice';
import { Pill } from '@/components/ui/Pill';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Stat } from '@/components/ui/Stat';
import { copy } from '@/copy/en';
import { createServerComponentClient } from '@/lib/supabase/server';
import { authorize } from '@/server/authorize';
import { loadBroadcasts, reachBreakdown } from '@/server/broadcasts';

import { submitAction } from '../../actions';
import { WhatsAppCopy } from './WhatsAppCopy';

export const dynamic = 'force-dynamic';

/**
 * The last screen before it is somebody's lock screen (CONFIRM frame, approved 2026-08-19).
 *
 * THE REACH IS SPLIT RATHER THAN TOTALLED. `17` §2 asks for the exact recipient count, and
 * the split is here because "128 people, 32 of whom will not see this until they next open
 * the app" is a materially different decision from "128 people". Both numbers come from
 * `broadcast_recipient_count()` and one query over devices, which is the same audience the
 * fan-out will use: the number a leader approves and the set that receives cannot drift,
 * because they are the same definition.
 *
 * The message is shown as it will ARRIVE rather than as it was typed, which for a
 * broadcast means the English body: the per-locale versions are what a German reader gets,
 * and showing all four here would be a proof-reading screen rather than a decision.
 */
export default async function ConfirmBroadcastPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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
  const { id } = await params;

  // Read through the scoped list rather than by id: `visible_broadcasts()` already decides
  // what this caller may see, so a stranger's id in the URL finds nothing instead of
  // needing its own check.
  const lists = await loadBroadcasts(supabase, caller);
  const broadcast = [...lists.mine, ...lists.waiting, ...lists.sent].find(
    (row) => row.id === id,
  );
  if (!broadcast) redirect('/broadcasts');

  const reach = await reachBreakdown(supabase, id);

  return (
    <DashboardShell caller={caller} current="broadcasts">
      <PageHeader
        title={copy.broadcasts.confirmTitle}
        scope={copy.broadcasts.confirmScope}
      />

      <div className="mt-4 flex gap-2.5">
        <Stat value={reach.total} label={copy.broadcasts.statReached} />
        <Stat value={reach.withDevice} label={copy.broadcasts.statPhone} />
        <Stat value={reach.inAppOnly} label={copy.broadcasts.statInApp} />
      </div>

      <h2 className="px-0.5 pt-5 pb-2.5 text-caption font-extrabold tracking-widest text-muted uppercase">
        {copy.broadcasts.asItArrives}
      </h2>
      <article className="rounded-card border border-cardline bg-card p-4">
        <div className="mb-2.5 flex flex-wrap items-center gap-2">
          <Pill tone={broadcast.scope === 'ministry' ? 'urgent' : 'info'}>
            {broadcast.scope === 'ministry'
              ? copy.broadcasts.scopeLabel.ministry
              : copy.broadcasts.scopeLabel.branch(broadcast.branchName ?? '')}
          </Pill>
          <Pill>EN</Pill>
        </div>
        <h3 className="text-body font-extrabold text-text">
          {broadcast.title}
        </h3>
        <p className="mt-1 text-body leading-relaxed text-text">
          {broadcast.body}
        </p>
        {broadcast.link && (
          <p className="mt-3 text-small font-bold text-muted">
            {copy.broadcasts.opensLabel} · {broadcast.link}
          </p>
        )}
      </article>

      <div className="mt-4">
        <WhatsAppCopy
          text={whatsappText(broadcast.title, broadcast.body, broadcast.link)}
        />
      </div>

      {reach.inAppOnly > 0 && (
        <div className="mt-4">
          <Notice
            tone="off"
            title={copy.broadcasts.inAppOnlyNotice(reach.inAppOnly)}
          >
            {copy.broadcasts.inAppOnlyBody}
          </Notice>
        </div>
      )}

      <div className="mt-4 flex gap-2.5 border-t border-cardline pt-3.5">
        <form action={submitAction}>
          <input type="hidden" name="id" value={broadcast.id} />
          <SubmitButton
            label={copy.broadcasts.sendForApproval}
            pendingLabel={copy.broadcasts.submitting}
          />
        </form>
      </div>
    </DashboardShell>
  );
}

/**
 * The pasteable version.
 *
 * Plain text with the link on its own line, because WhatsApp linkifies a bare URL and
 * mangles anything cleverer. No member data, by construction: this is the church's own
 * words and nothing else.
 */
function whatsappText(
  title: string,
  body: string,
  link: string | null,
): string {
  return [title, '', body, link ? `\n${link}` : ''].join('\n').trim();
}
