import { useMutation, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

import { PRAYER_SURFACE_KEYS, TESTIMONY_SURFACE_KEYS } from './keys';
import { myPostsKey } from './myPosts';

/**
 * MARK-ANSWERED and its undo (docs/spec/09 §the loop, frames `MARK-ANSWERED`,
 * `PRAYER-DETAIL · answered…`, `NOT-ANSWERED`).
 *
 * NOT in the offline write queue, deliberately. The queue (W2.4) carries taps whose whole
 * value is that they are instant and repeatable: Glory, "I will pray", RSVP. This one opens
 * a celebration screen and an invitation to testify, and replaying it from a queue would
 * mean saying "Answered! Glory to God" for something that has not reached the server yet,
 * possibly minutes before it is refused. So it is an online write with an honest failure
 * message, and the answered state on screen comes from the refetched row rather than from a
 * second store that could disagree with it (W2.4's lesson).
 *
 * THE PRECONDITIONS ARE THE DATABASE'S. `prayers_update_guard` refuses a mark-answered on
 * anything but an approved, live request of the caller's own, and refuses the undo while a
 * linked testimony stands (W1.5, asserted in 009 and 028). The screen only decides what to
 * OFFER; `answeredUndoBlocked` is how it recognises the refusal it could not predict,
 * because the testimony landed between the read and the tap.
 */

/** The trigger's own errcode for "delete the linked testimony first". */
const CHECK_VIOLATION = '23514';

export function useMarkAnswered() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      prayerId,
      answered,
    }: {
      prayerId: string;
      answered: boolean;
    }): Promise<void> => {
      const { error } = await supabase
        .from('prayers')
        .update({ answered_at: answered ? new Date().toISOString() : null })
        .eq('id', prayerId);
      if (error) throw error;
    },
    onSuccess: async () => {
      // Prayer surfaces AND My posts: the request's row changed, and MY-POSTS reads
      // `answered_at` off the base table for the same request (W2.6).
      await Promise.all(
        [...PRAYER_SURFACE_KEYS, myPostsKey()].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
    },
  });
}

/**
 * Whether a failed undo was the database refusing because a testimony is linked, rather
 * than the network or anything else. The screen then shows the explanation instead of a
 * generic failure, which is the same thing the confirm sheet says when it can see the
 * testimony coming.
 */
export function answeredUndoBlocked(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === CHECK_VIOLATION
  );
}

/**
 * The surfaces a LINKED testimony changes, which are not the ones an unlinked testimony
 * changes.
 *
 * ComposeFlow's note used to read "a new testimony has nothing to say about the prayer
 * feed", and for an unlinked one that is still true. A linked one is written onto the
 * prayer's row: `my_answer_testimony_status` starts reporting it, so the request must
 * refetch or PRAYER-DETAIL keeps offering "Write a testimony" for a request that already
 * has one, and the second attempt is the 23505 that `from_prayer_id`'s UNIQUE constraint
 * owes nobody an explanation for.
 */
export function surfacesTouchedByTestimony(
  fromPrayerId: string | null | undefined,
): readonly (readonly string[])[] {
  return fromPrayerId
    ? [...TESTIMONY_SURFACE_KEYS, ...PRAYER_SURFACE_KEYS]
    : TESTIMONY_SURFACE_KEYS;
}
