import { queryClient } from '@/lib/queryPersist';

import { rhythmQueryKey, type RhythmState } from './queries';

// THE place a check-in changes what is on screen.
//
// Same shape as features/family/gloryCache and for the same reason: the tap
// patches the cached row, the write queue then delivers that intention, and by
// the time the server answers there is nothing left to move. One store, so there
// is no second render to get wrong (the Glory flicker, 2026-07-27).
//
// What the tap may patch is deliberately ONE field. `checked_in` is the only
// thing the app can honestly know before the server answers: the member just
// said they are here. The week counts are the server's arithmetic (grace weeks,
// DST, a replay that bridges two runs), and guessing them here would put a
// second, wronger copy of the streak on screen for a few hundred milliseconds.

/** Optimistic half: the member has tapped, nothing has been sent yet. */
export function applyCheckedInToCache(branchId: string): void {
  queryClient.setQueryData<RhythmState | null>(
    rhythmQueryKey(branchId),
    (current) => {
      if (!current || current.checkedIn) return current;
      return { ...current, checkedIn: true };
    },
  );
}

/**
 * The server's answer, which replaces the row outright: `record_attendance`
 * returns the whole rhythm AFTER the write, so the streak strip and the card are
 * reading the same one answer rather than two reads that could disagree.
 */
export function applyRhythmAnswer(branchId: string, next: RhythmState): void {
  queryClient.setQueryData<RhythmState | null>(rhythmQueryKey(branchId), next);
}

/**
 * A queued check-in the server refused, or one dropped as too old to send. The
 * optimistic tick has to come off, and only the server can say what is true now,
 * so this refetches rather than inventing the previous value.
 */
export function invalidateRhythm(): void {
  void queryClient.invalidateQueries({ queryKey: ['rhythm'] });
}
