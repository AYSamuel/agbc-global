import type { ReactNode } from 'react';

import { copy } from '@/copy/en';
import type { BroadcastRow } from '@/server/broadcasts';

import { Notice } from './ui/Notice';
import { Pill, type PillTone } from './ui/Pill';

/**
 * One broadcast, as a card (frames: APPROVALS and IN FLIGHT, approved 2026-08-19).
 *
 * Presentational and free of fetching, so every judgement it makes can be tested without a
 * database: which pills a status wears, whether the actions are offered at all, and the one
 * that matters most, what an admin sees on their OWN broadcast.
 *
 * THE SELF-APPROVAL REFUSAL IS SPELLED OUT IN PLACE rather than shown as a disabled button.
 * A greyed control with no sentence beside it reads as a bug, and the reader is an admin who
 * is about to go looking for why the dashboard is broken. The frame names the other admin,
 * because with two of them that naming IS the answer to "so who does release this".
 */

const STATUS_TONE: Record<BroadcastRow['status'], PillTone> = {
  draft: 'quiet',
  pending_approval: 'notice',
  rejected: 'urgent',
  sending: 'info',
  sent: 'good',
  halted: 'urgent',
  failed: 'urgent',
};

export interface BroadcastCardProps {
  broadcast: BroadcastRow;
  /** The signed-in staff member, so the card can tell "yours" from "theirs". */
  viewerId: string;
  /** Whether this viewer holds the approve authority at all (admins only). */
  canApprove: boolean;
  /** Other admins who could release it, when this viewer cannot. */
  otherApprovers?: string[];
  /** Approve / send back / stop, supplied by the page as forms. */
  actions?: ReactNode;
}

export function BroadcastCard({
  broadcast,
  viewerId,
  canApprove,
  otherApprovers = [],
  actions,
}: BroadcastCardProps) {
  const isMine = broadcast.authorId === viewerId;
  const waiting = broadcast.status === 'pending_approval';
  // The whole rule in one line: an admin may approve anything except their own.
  const blockedByAuthorship = waiting && canApprove && isMine;

  return (
    <article className="mb-3 rounded-card border border-cardline bg-card p-4">
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <Pill tone={STATUS_TONE[broadcast.status]}>
          {copy.broadcasts.status[broadcast.status]}
        </Pill>
        <Pill tone={broadcast.scope === 'ministry' ? 'urgent' : 'info'}>
          {broadcast.scope === 'ministry'
            ? copy.broadcasts.scopeLabel.ministry
            : copy.broadcasts.scopeLabel.branch(broadcast.branchName ?? '')}
        </Pill>
        {broadcast.recipientCount !== null && (
          <Pill>{copy.broadcasts.people(broadcast.recipientCount)}</Pill>
        )}
      </div>

      <h3 className="text-body font-extrabold text-text">{broadcast.title}</h3>
      <p className="mt-1 text-body leading-relaxed text-text">
        {broadcast.body}
      </p>

      <p className="mt-3 text-small font-bold text-muted">
        {isMine ? 'You wrote this' : broadcast.authorName}
        {broadcast.approvedByName && (
          <> · {copy.broadcasts.approvedBy(broadcast.approvedByName)}</>
        )}
      </p>

      {/* Sent back, with the reason the author has to act on. */}
      {broadcast.status === 'rejected' && broadcast.reviewNote && (
        <div className="mt-3">
          <Notice tone="bad" title={copy.broadcasts.status.rejected}>
            {broadcast.reviewNote}
          </Notice>
        </div>
      )}

      {blockedByAuthorship ? (
        <div className="mt-3">
          <Notice tone="off" title={copy.broadcasts.ownTitle}>
            {otherApprovers.length > 0
              ? copy.broadcasts.ownBodyWithNames(otherApprovers.join(', '))
              : copy.broadcasts.ownBody}
          </Notice>
        </div>
      ) : (
        actions && (
          <div className="mt-4 flex gap-2.5 border-t border-cardline pt-3.5">
            {actions}
          </div>
        )
      )}
    </article>
  );
}
