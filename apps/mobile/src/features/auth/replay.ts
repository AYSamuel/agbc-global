import { queryClient } from '@/lib/queryPersist';
import { supabase } from '@/lib/supabase';
import type { GateAction } from '@/state/gate';

// Gate-return executors (docs/spec/03, 04 rule 9): after AUTH-4 lands the user
// back on the origin screen, the remembered action completes here. Each kind's
// REAL executor arrives with its own work item; until then it resolves 'noop'
// (the user is back where they started, which is already the promise kept).
//
// glory is live now (decided 2026-07-26): its backend has existed since W1.5
// and W2.2's Done criterion is the reaction landing. W2.4 swaps this direct
// write for the offline queue and adds the button UI.

export type ReplayOutcome = 'done' | 'noop' | 'failed';

export async function replayGateAction(
  action: GateAction,
): Promise<ReplayOutcome> {
  switch (action.kind) {
    case 'glory': {
      try {
        const { data } = await supabase.auth.getSession();
        const userId = data.session?.user.id;
        if (!userId) return 'failed';
        // Conflict-tolerant per the table's contract (docs/spec/02): a repeat
        // replay or an existing reaction stays count-correct.
        const { error } = await supabase
          .from('glory_reactions')
          .upsert(
            { testimony_id: action.testimonyId, profile_id: userId },
            { onConflict: 'testimony_id,profile_id', ignoreDuplicates: true },
          );
        if (error) return 'failed';
        // Counters are server-maintained; refetch the family surfaces so the
        // count updates in place (04: "count +1 in place").
        await queryClient.invalidateQueries({ queryKey: ['family'] });
        return 'done';
      } catch {
        return 'failed';
      }
    }
    // Executors land with their work items: compose (W2.3), intercede (W2.4),
    // rsvp (W2.9), im_here (W2.8), save/notes/resume (W3.1),
    // notifications (W3.3).
    default:
      return 'noop';
  }
}
