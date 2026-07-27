import { queryClient } from '@/lib/queryPersist';

import { TESTIMONY_SURFACE_KEYS } from './keys';
// Type-only: erased at runtime, so it cannot re-form the import cycle that
// keys.ts exists to break.
import type { TestimonyFeedItem } from './queries';

// A reaction, applied to every cached copy of the testimony it belongs to: the
// feed in either scope, the detail screen, Home's highlight.
//
// This is THE place a Glory changes what is on screen. The tap calls it, and the
// queue handler calls it again only to undo a write the server refused. Nothing
// else moves the card, which is the whole point.
//
// It replaced an optimistic state that lived in the write queue. That state was
// correct and still flickered: the queue is a Zustand store notifying React
// synchronously, the cache is TanStack notifying on a microtask, so when a write
// landed the queue entry vanished one render BEFORE the patched row appeared,
// and for that render the card fell back to a row that had not caught up. The
// border visibly went on, off, on (device log, 2026-07-27). Two stores cannot be
// made to land together; one store has nothing to land against.

/**
 * What this member has done to a testimony since the last fetch that could have
 * known about it, and when. Kept so a read that LEFT before the tap cannot land
 * afterwards and quietly undo it: the row it carries is not wrong, it is just
 * older than the member's own action.
 *
 * An entry lives only until a fetch that started after it comes back agreeing,
 * at which point the server is saying the same thing and there is nothing left
 * to protect.
 */
const localGlory = new Map<string, { reacted: boolean; at: number }>();

/** Test seam: the map is module state and every suite starts from empty. */
export function resetLocalGlory(): void {
  localGlory.clear();
}

/**
 * Reapplies this member's own recent reactions on top of freshly fetched rows.
 *
 * @param startedAt when the fetch was issued. A row is overridden only by a tap
 * that happened AFTER that moment, because anything earlier is already included
 * in what the server sent.
 */
export function reconcileGlory(
  rows: readonly TestimonyFeedItem[],
  startedAt: number,
): TestimonyFeedItem[] {
  return rows.map((row) => {
    const local = localGlory.get(row.id);
    if (!local) return row;

    if (local.at <= startedAt) {
      // The fetch is at least as new as the tap, so it already accounts for it.
      // Drop the local memory: from here the server is the only voice, which is
      // what lets another device's un-react eventually show up here.
      localGlory.delete(row.id);
      return row;
    }

    if (row.reacted_by_me === local.reacted) return row;
    return {
      ...row,
      reacted_by_me: local.reacted,
      glory_count: Math.max(row.glory_count + (local.reacted ? 1 : -1), 0),
    };
  });
}

/**
 * @param reacted the state the member has asked for. Applying the same value
 * twice is a no-op, so a retried replay, a double tap, or a refetch that already
 * brought the row up to date cannot drift the count.
 */
export function applyGloryToCaches(
  testimonyId: string,
  reacted: boolean,
): void {
  localGlory.set(testimonyId, { reacted, at: Date.now() });

  const patch = (row: TestimonyFeedItem): TestimonyFeedItem => {
    if (row.id !== testimonyId || row.reacted_by_me === reacted) return row;
    return {
      ...row,
      reacted_by_me: reacted,
      // The count follows the member's own reaction and nothing else; everyone
      // else's arrives by refetch. Clamped because a stale row must never
      // render as -1.
      glory_count: Math.max(row.glory_count + (reacted ? 1 : -1), 0),
    };
  };

  for (const queryKey of TESTIMONY_SURFACE_KEYS) {
    queryClient.setQueriesData<TestimonyFeedItem[] | TestimonyFeedItem | null>(
      { queryKey },
      (current) => {
        if (!current) return current;
        return Array.isArray(current) ? current.map(patch) : patch(current);
      },
    );
  }
}
