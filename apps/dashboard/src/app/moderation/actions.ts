'use server';

import { redirect } from 'next/navigation';

import { createServerComponentClient } from '@/lib/supabase/server';
import { moderateItem, type Decision } from '@/server/moderateItem';
import type { QueueKind } from '@/server/moderationQueue';

/**
 * The decision, as a Server Action.
 *
 * A thin wrapper on purpose: everything that could go wrong lives in moderateItem(),
 * where it is tested against real sessions. This layer only parses the form, and it
 * validates strictly rather than trusting the shape (`~/.claude/standards/backend.md`:
 * the boundary is the only place you control).
 *
 * Note what is NOT read from the form: the branch. moderateItem() reads it from the row
 * being decided, so a crafted field cannot nominate the caller's own authority.
 *
 * The outcome comes back as a query parameter rather than a return value, which keeps
 * the whole flow working with plain HTML: no JavaScript, no useActionState, and a
 * refresh after deciding does not re-submit anything.
 */
export async function decide(formData: FormData): Promise<void> {
  const kind = readKind(formData.get('kind'));
  const decision = readDecision(formData.get('decision'));
  const id = readString(formData.get('id'));
  const reviewedUpdatedAt = readString(formData.get('reviewedUpdatedAt'));
  const filter = readString(formData.get('filter'));

  if (!kind || !decision || !id || !reviewedUpdatedAt) {
    redirect(back(filter, 'failed'));
  }

  const supabase = await createServerComponentClient();
  const result = await moderateItem(supabase, {
    kind,
    id,
    reviewedUpdatedAt,
    decision,
    rejectionReason: readString(formData.get('rejectionReason')),
    moderationNote: readString(formData.get('moderationNote')),
  });

  if (result.ok) {
    redirect(back(filter, DONE[decision]));
  }

  redirect(back(filter, result.reason));
}

const DONE: Record<Decision, string> = {
  approve: 'approved',
  reject: 'rejected',
  remove: 'removed',
};

/** Always our own path, never anything derived from the request. */
function back(filter: string | undefined, outcome: string): string {
  const params = new URLSearchParams();
  if (filter === 'testimony' || filter === 'prayer') params.set('kind', filter);
  params.set('outcome', outcome);
  return `/moderation?${params.toString()}`;
}

function readString(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readKind(value: FormDataEntryValue | null): QueueKind | undefined {
  return value === 'testimony' || value === 'prayer' ? value : undefined;
}

function readDecision(value: FormDataEntryValue | null): Decision | undefined {
  return value === 'approve' || value === 'reject' || value === 'remove'
    ? value
    : undefined;
}
