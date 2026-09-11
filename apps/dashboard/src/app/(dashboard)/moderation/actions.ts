'use server';

import { revalidatePath } from 'next/cache';

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
 * IT RETURNS ITS OUTCOME RATHER THAN REDIRECTING WITH ONE (W4.13, changed 2026-09-11).
 * It used to answer with `redirect('/moderation?outcome=approved')`, which kept the whole
 * flow working with plain HTML. Ayo dropped the no-JavaScript requirement for this staff
 * tool on 2026-09-10, and this is the first place that decision is spent: an optimistic
 * queue cannot be built on a redirect, because a redirect throws, discards the return
 * value, and re-renders the page the optimistic update was trying to avoid re-rendering.
 *
 * `revalidatePath` replaces what the redirect was quietly doing: keeping the server's copy
 * of the queue honest. The optimistic removal is what the reviewer sees immediately; this
 * is what makes it true a moment later, and what puts the item BACK if the database refused
 * the decision.
 *
 * The rest of the file is unchanged, deliberately. What is read from the form, what is not
 * (the branch, which `moderateItem()` reads from the row so a crafted field cannot nominate
 * the caller's own authority), and the compare-and-set on `reviewedUpdatedAt` are all the
 * same. This changed how the answer travels, not what the answer is.
 */
export type DecisionOutcome =
  { ok: true; decision: Decision } | { ok: false; reason: string };

export async function decide(formData: FormData): Promise<DecisionOutcome> {
  const kind = readKind(formData.get('kind'));
  const decision = readDecision(formData.get('decision'));
  const id = readString(formData.get('id'));
  const reviewedUpdatedAt = readString(formData.get('reviewedUpdatedAt'));

  if (!kind || !decision || !id || !reviewedUpdatedAt) {
    return { ok: false, reason: 'failed' };
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

  // The server's copy of the queue, brought back in line with what just happened. On a
  // refusal this is what restores the row the client optimistically removed.
  revalidatePath('/moderation');

  return result.ok
    ? { ok: true, decision }
    : { ok: false, reason: result.reason };
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
