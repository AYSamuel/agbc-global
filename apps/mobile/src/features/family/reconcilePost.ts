import { supabase } from '@/lib/supabase';

import type { ComposeTarget } from './drafts';

// "Did my earlier attempt land?" (W4.18 slice 2). Asked before a SECOND attempt
// at the same post, never before the first.
//
// Asking is cheaper and kinder than a refused insert. The retry could simply
// send again and let the primary key refuse a duplicate, and it still does as
// the net underneath this; but the insert guard runs BEFORE the conflict check,
// and at the daily quota's edge it would answer "come back tomorrow" for a post
// that is already there. RLS scopes the read to the author's own rows (an
// author may read their own pending post; that is what MY-POSTS is built on),
// so there is no author filter here and no author id for anyone to tamper with.

export type ReconcileOutcome =
  /** The row is on the server: the earlier attempt landed. */
  | 'exists'
  /** The server answered and has no such row. */
  | 'absent'
  /** The question could not be asked; the insert decides, with the id as the net. */
  | 'unknown';

export async function findOwnPost(
  target: ComposeTarget,
  id: string,
): Promise<ReconcileOutcome> {
  try {
    const { data, error } = await supabase
      .from(target === 'testimony' ? 'testimonies' : 'prayers')
      .select('id')
      .eq('id', id)
      .maybeSingle();
    if (error) return 'unknown';
    return data === null ? 'absent' : 'exists';
  } catch {
    return 'unknown';
  }
}
