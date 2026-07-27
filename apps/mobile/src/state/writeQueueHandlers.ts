import { applyGloryToCaches } from '@/features/family/gloryCache';
import { TESTIMONY_SURFACE_KEYS } from '@/features/family/keys';
import { queryClient } from '@/lib/queryPersist';
import { supabase } from '@/lib/supabase';
import {
  useWriteQueueStore,
  type QueuedWrite,
  type ReplayOutcome,
  type WriteHandlers,
} from '@/lib/writeQueue';

// The composition root for the write queue: what each queued wish actually does
// when it reaches the server.
//
// It lives in state/ rather than lib/ because it is the one place allowed to
// know about both. lib/writeQueue owns the machinery and imports no feature;
// this module wires features into it, which keeps the dependency arrow pointing
// one way (~/.claude/standards/frontend.md: lower layers never import higher).
//
// Handlers land here as their work items build the surface that queues them:
// glory (W2.4), intercession (W2.4 slice 3), rsvp (W2.9), attendance (W2.8),
// playback (W3.1), plan_day (Phase 4).

/**
 * Postgres codes that mean "and it will still say no next time": a check
 * violation from a guard trigger (the testimony was removed, so it is no longer
 * published), a foreign key that no longer resolves (it was deleted outright),
 * or an RLS refusal. Anything else, including no code at all, is transport.
 */
const FINAL_CODES = new Set(['23514', '23503', '42501', 'PGRST301']);

function outcomeFor(error: { code?: string | null } | null): ReplayOutcome {
  if (error === null) return 'done';
  return FINAL_CODES.has(error.code ?? '') ? 'refused' : 'retry';
}

async function handleGlory(write: QueuedWrite): Promise<ReplayOutcome> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  // Signed out between the tap and the replay. The queue is cleared on sign-out,
  // so this is a race rather than a state; keep the wish and let that clear win.
  if (!userId) return 'retry';

  const error =
    write.state === 'on'
      ? // Conflict-tolerant on purpose (docs/spec/02): a repeat replay, or a
        // reaction that already exists, must leave the count exactly as it is.
        // The counter trigger is written around this: a skipped conflicting
        // insert fires no trigger.
        (
          await supabase
            .from('glory_reactions')
            .upsert(
              { testimony_id: write.entityId, profile_id: userId },
              { onConflict: 'testimony_id,profile_id', ignoreDuplicates: true },
            )
        ).error
      : // Deleting something already gone is a success: the member's wish is
        // that there be no reaction, and there is none.
        (
          await supabase
            .from('glory_reactions')
            .delete()
            .eq('testimony_id', write.entityId)
            .eq('profile_id', userId)
        ).error;

  const outcome = outcomeFor(error);

  // Nothing to do on success. The card was patched the moment the member tapped
  // (features/family/useGlory), which is the whole reason there is no second
  // render here to get wrong.
  //
  // A refusal is the one case that has to touch the screen: the server will keep
  // saying no (the testimony was removed, or deleted outright), so the optimistic
  // change is put back rather than left standing as a promise the app cannot
  // keep. `01` §8 asks for exactly this, quietly and with no toast.
  if (outcome === 'refused') {
    applyGloryToCaches(write.entityId, write.state !== 'on');
  }
  return outcome;
}
export const writeHandlers: WriteHandlers = {
  glory: handleGlory,
  // Slice 3. Until then a queued intercession would have nowhere to go, and
  // nothing queues one: the prayer controls still open the gate or do nothing.
  intercession: () => Promise.resolve('retry'),
};

/**
 * Puts an entity's rows back to server truth. The queue calls this for wishes it
 * has to drop to stay under its cap: `01` §8 requires eviction to revert the
 * optimistic UI, and since the tap wrote that state into the cache, only a
 * refetch can say what is actually true now.
 */
function revertEvicted(): void {
  for (const queryKey of TESTIMONY_SURFACE_KEYS) {
    void queryClient.invalidateQueries({ queryKey });
  }
}

/** Called once from the root layout, before the queue starts draining. */
export function installWriteHandlers(): void {
  useWriteQueueStore.getState().setHandlers(writeHandlers, revertEvicted);
}
