import type { SupabaseClient } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';

import type { Database } from '@agbc/shared/database';

import { authorize, type Caller } from '@/server/authorize';

/**
 * The same door on all three shelf routes, the `verses/guard.ts` shape: sign-in for a
 * visitor, `/mfa` for a session that has not cleared its factor, `/` for anyone the
 * dashboard is not for, and the refusal INSIDE the shell for a leader, who followed the
 * rail here and must not land on a dead end.
 *
 * The role question itself is `authorize()`'s, asked by name as `manage_sermon_audio`,
 * so this function decides nothing about authority. It only routes the verdict.
 */
export interface ShelfAccess {
  caller: Caller;
  /** False for staff who may read the dashboard but not stock the shelf. */
  admin: boolean;
}

export async function shelfAccess(
  supabase: SupabaseClient<Database>,
): Promise<ShelfAccess> {
  const verdict = await authorize(supabase, { action: 'manage_sermon_audio' });
  if (verdict.ok) return { caller: verdict.caller, admin: true };

  if (verdict.reason === 'unauthenticated') redirect('/sign-in');
  if (
    verdict.reason === 'mfa_enrolment_required' ||
    verdict.reason === 'mfa_challenge_required'
  ) {
    redirect('/mfa');
  }
  if (verdict.reason === 'not_admin' && verdict.caller) {
    return { caller: verdict.caller, admin: false };
  }
  redirect('/');
}
