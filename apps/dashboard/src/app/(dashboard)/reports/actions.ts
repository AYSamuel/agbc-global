'use server';

import { redirect } from 'next/navigation';

import { createServerComponentClient } from '@/lib/supabase/server';
import { moderateItem } from '@/server/moderateItem';
import type { QueueKind } from '@/server/moderationQueue';
import { markReportsActioned, resolveReports } from '@/server/resolveReports';

/**
 * The four things a leader can do with a report, as one Server Action.
 *
 * Same shape as `moderation/actions.ts`: thin, strict about what it reads, and no branch
 * from the form. Two of the four also decide the CONTENT, and when they do, the reports
 * close with it: a leader who removes a reported post should not then have to dismiss the
 * reports about it as a second chore in a second click.
 *
 * The order matters. The content decision goes first, and the reports only close if it
 * succeeded. Closing them first would leave a compare-and-set failure with no reports left
 * to explain why the post is still there.
 */
export async function act(formData: FormData): Promise<void> {
  const kind = readKind(formData.get('kind'));
  const action = readAction(formData.get('action'));
  const id = readString(formData.get('id'));

  if (!kind || !action || !id) redirect(back('failed'));

  const supabase = await createServerComponentClient();

  if (action === 'dismiss' || action === 'flag_safeguarding') {
    const result = await resolveReports(supabase, { kind, id, action });
    if (result.ok) {
      redirect(back(action === 'dismiss' ? 'dismissed' : 'flagged'));
    }
    redirect(back(result.reason));
  }

  // Reject and remove: the content decision, then the reports.
  const reviewedUpdatedAt = readString(formData.get('reviewedUpdatedAt'));
  if (!reviewedUpdatedAt) redirect(back('failed'));

  const decided = await moderateItem(supabase, {
    kind,
    id,
    reviewedUpdatedAt,
    decision: action,
    rejectionReason: readString(formData.get('rejectionReason')),
    moderationNote: readString(formData.get('moderationNote')),
  });
  if (!decided.ok) redirect(back(decided.reason));

  const closed = await markReportsActioned(supabase, kind, id);
  // The post WAS decided. If only the flagged reports remain open, that is the rule
  // working rather than a failure, and it is what the reader needs to be told: the
  // safeguarding duty outlives the post (`02`).
  if (!closed.ok && closed.reason === 'safeguarding_stays_open') {
    redirect(back('safeguarding_stays_open'));
  }
  redirect(back(action === 'reject' ? 'rejected' : 'removed'));
}

type Action = 'dismiss' | 'flag_safeguarding' | 'reject' | 'remove';

/** Always our own path, never anything derived from the request. */
function back(outcome: string): string {
  return `/reports?outcome=${encodeURIComponent(outcome)}`;
}

function readString(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readKind(value: FormDataEntryValue | null): QueueKind | undefined {
  return value === 'testimony' || value === 'prayer' ? value : undefined;
}

function readAction(value: FormDataEntryValue | null): Action | undefined {
  return value === 'dismiss' ||
    value === 'flag_safeguarding' ||
    value === 'reject' ||
    value === 'remove'
    ? value
    : undefined;
}
