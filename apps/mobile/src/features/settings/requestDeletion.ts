import { budget } from '@/lib/fetchWithTimeout';
import { supabase } from '@/lib/supabase';

import {
  classifyDeleteError,
  type DeleteAttempt,
  type DeleteOutcome,
} from './deleteOutcome';

// The one caller of `delete_my_account` (docs/spec/16 §DELETE; W4.18 slice 1).
// The screen asks this for an outcome and never sees the wire, so the decision
// about what a failure means lives in one place (deleteOutcome.ts) and the
// screen's tests can say "the server refused" without a client to mock.

/**
 * Erasing an account commits twenty tables in one transaction and is the
 * heaviest write a member can trigger. The client's default ten seconds
 * (`FETCH_TIMEOUT_MS`) was cutting it off while the server finished anyway,
 * which is the whole reason a request can now bring its own budget.
 */
export const DELETE_BUDGET_MS = 30_000;

export async function requestDeletion(
  keepPosts: boolean,
  attempt: DeleteAttempt,
): Promise<DeleteOutcome> {
  try {
    // No id: `delete_my_account` is hard-wired to auth.uid(), so this call cannot
    // name anybody but the person making it (20260901160000).
    const { error } = await supabase
      .rpc('delete_my_account', { p_keep_posts: keepPosts })
      .abortSignal(budget(DELETE_BUDGET_MS));
    if (!error) return 'erased';
    return classifyDeleteError(attempt, error);
  } catch (error) {
    return classifyDeleteError(attempt, error);
  }
}
