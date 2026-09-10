import type { SupabaseClient } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';

import type { Database } from '@agbc/shared/database';

import { authorize, type Caller } from '@/server/authorize';

/**
 * The same door on all four verse routes.
 *
 * Four pages (`/verses`, `/verses/import`, `/verses/new`, `/verses/<date>/<language>`) ask
 * the same question and owe the same answers: sign-in for a visitor, `/mfa` for a session
 * that has not cleared its factor, `/` for anyone the dashboard is not for, and the
 * REFUSAL INSIDE THE SHELL for a leader, who followed the rail here and must not land on a
 * dead end (the shape PR #116 fixed on `/people`).
 *
 * Written once because four copies of it is four chances to forget the leader case, which
 * is precisely the one nobody notices missing: the developer testing this is an admin.
 *
 * The role question itself is `authorize()`'s, asked by name as `manage_verses`, so this
 * function decides nothing about authority. It only routes the verdict.
 */
export interface VerseAccess {
  caller: Caller;
  /** False for staff who may read the dashboard but not keep the schedule. */
  admin: boolean;
}

export async function verseAccess(
  supabase: SupabaseClient<Database>,
): Promise<VerseAccess> {
  const verdict = await authorize(supabase, { action: 'manage_verses' });
  if (verdict.ok) return { caller: verdict.caller, admin: true };

  if (verdict.reason === 'unauthenticated') redirect('/sign-in');
  if (
    verdict.reason === 'mfa_enrolment_required' ||
    verdict.reason === 'mfa_challenge_required'
  ) {
    redirect('/mfa');
  }
  // A leader: kept in the shell, told why, and pointed at their own queue.
  if (verdict.reason === 'not_admin' && verdict.caller) {
    return { caller: verdict.caller, admin: false };
  }
  // A member, a closed account, or a session with no profile. `/` is where those
  // explanations live, and they are about the person rather than about this screen.
  redirect('/');
}
