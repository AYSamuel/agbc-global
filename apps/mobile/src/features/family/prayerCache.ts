import { queryClient } from '@/lib/queryPersist';

import { PRAYER_SURFACE_KEYS } from './keys';
// Type-only: erased at runtime, so it cannot form an import cycle with queries.
import type { PrayerFeedItem } from './queries';

// The prayer two-step, applied to every cached copy of the request it belongs to.
// Sibling of gloryCache and deliberately its own file rather than a shared
// generic: the shapes look alike but the arithmetic is not. A Glory moves one
// counter; committing moves one; fulfilling moves TWO, because "I prayed" takes
// the member out of `praying` and puts them into `prayed` (docs/spec/02).
//
// Same rule as its sibling, learned the hard way in slice 2: ONE source of truth
// for what is on screen. The row carries `my_intercession_state` beside the two
// counts, a tap patches the row, and the write queue delivers the same intention
// to the server. There is no second store to fall out of step with.

export type IntercessionState = 'committed' | 'prayed';

/** What the member wants the row to say. `none` is the undo: no commitment at
 * all, which is where a mis-tap on "I will pray" should leave them. */
export type IntercessionWish = IntercessionState | 'none';

/** See gloryCache: a read that LEFT before the tap must not land afterwards and
 * undo it. Cleared once a fetch issued after the tap comes back agreeing. */
const localIntercession = new Map<
  string,
  { state: IntercessionState | null; at: number }
>();

/** Test seam: module state, and every suite starts from empty. */
export function resetLocalIntercession(): void {
  localIntercession.clear();
}

/** How the counts move for a transition. `from` is what the row currently says,
 * `to` is what the member has asked for. Expressed once, here, because getting
 * it wrong shows a congregation the wrong number of people praying for them. */
function counterDelta(
  from: IntercessionState | null,
  to: IntercessionState | null,
): { praying: number; prayed: number } {
  if (from === to) return { praying: 0, prayed: 0 };
  // Never committed before: they join the people praying.
  if (from === null && to === 'committed') return { praying: 1, prayed: 0 };
  // The second step: they leave `praying` and join `prayed` (docs/spec/02).
  if (from === 'committed' && to === 'prayed')
    return { praying: -1, prayed: 1 };
  // Undoing that second step, back the same way they came (W2.4).
  if (from === 'prayed' && to === 'committed')
    return { praying: 1, prayed: -1 };
  // Undoing a commitment altogether: they leave whichever count they were in.
  if (to === null) {
    return from === 'committed'
      ? { praying: -1, prayed: 0 }
      : { praying: 0, prayed: -1 };
  }
  // Anything left is a shape the UI never offers (a jump straight to prayed).
  // Move nothing rather than invent a number.
  return { praying: 0, prayed: 0 };
}

export function applyIntercessionToCaches(
  prayerId: string,
  wish: IntercessionWish,
): void {
  // `none` is stored as null, which is exactly what the row says for a member
  // with no commitment; the two vocabularies meet here and nowhere else.
  const state = wish === 'none' ? null : wish;
  localIntercession.set(prayerId, { state, at: Date.now() });

  const patch = (row: PrayerFeedItem): PrayerFeedItem => {
    if (row.id !== prayerId || row.my_intercession_state === state) return row;
    const delta = counterDelta(row.my_intercession_state, state);
    return {
      ...row,
      my_intercession_state: state,
      praying_count: Math.max(row.praying_count + delta.praying, 0),
      prayed_count: Math.max(row.prayed_count + delta.prayed, 0),
    };
  };

  for (const queryKey of PRAYER_SURFACE_KEYS) {
    queryClient.setQueriesData<PrayerFeedItem[] | PrayerFeedItem | null>(
      { queryKey },
      (current) => {
        if (!current) return current;
        return Array.isArray(current) ? current.map(patch) : patch(current);
      },
    );
  }
}

/**
 * Reapplies this member's own recent commitments on top of freshly fetched rows.
 *
 * @param startedAt when the fetch was issued. A row is overridden only by a tap
 * that happened after that moment; anything earlier is already in what arrived.
 */
export function reconcileIntercession(
  rows: readonly PrayerFeedItem[],
  startedAt: number,
): PrayerFeedItem[] {
  return rows.map((row) => {
    const local = localIntercession.get(row.id);
    if (!local) return row;

    if (local.at <= startedAt) {
      localIntercession.delete(row.id);
      return row;
    }

    if (row.my_intercession_state === local.state) return row;
    const delta = counterDelta(row.my_intercession_state, local.state);
    return {
      ...row,
      my_intercession_state: local.state,
      praying_count: Math.max(row.praying_count + delta.praying, 0),
      prayed_count: Math.max(row.prayed_count + delta.prayed, 0),
    };
  });
}
