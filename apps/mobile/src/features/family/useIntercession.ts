import { useCallback, useEffect, useRef, useState } from 'react';

import { track } from '@/lib/analytics';
import { pushWrite } from '@/lib/writeQueue';
import { useAuthStore } from '@/state/auth';

import type { CommitmentState } from './PrayerCard';
import {
  applyIntercessionToCaches,
  type IntercessionWish,
} from './prayerCache';
import type { FamilyScope, PrayerFeedItem } from './queries';

// The two-step commitment: "I will pray", then later "I prayed" (docs/spec/09).
//
// Forward-only, and that is the product decision the whole feature rests on: a
// single past-tense tap would be a like, and the second step is what makes the
// first one mean something.
//
// With one exception, added after device testing on 2026-07-28: for five seconds
// after either step, the member can take it back. A mis-tap otherwise misreports
// someone as having prayed, permanently, and shows the author of the request a
// number that is not true about their family. An undo five seconds later is a
// correction, not a change of heart, which is why it is a window and not a
// toggle.
//
// Undo always clears the commitment entirely rather than stepping back one notch
// (Ayo, 2026-07-28): a member who mis-tapped wants to be back at "I will pray",
// not parked in the middle of a two-step they did not mean to start. That also
// keeps the database rule untouched, because deleting your own intercession was
// always permitted while un-praying never was.

/** How long the way back stays open. Long enough to notice a mis-tap, short
 * enough that the commitment means something a moment later. */
export const UNDO_WINDOW_MS = 5_000;

/** The row's state as the card's three-way prop. */
export function commitmentOf(prayer: PrayerFeedItem): CommitmentState {
  return prayer.my_intercession_state ?? 'none';
}

export interface IntercessionControls {
  commitment: CommitmentState;
  /** Undefined once fulfilled and past the window: there is nothing left to ask. */
  onPress: (() => void) | undefined;
  /** Present only while the way back is open. */
  onUndo: (() => void) | undefined;
}

/**
 * @param onGateNeeded opens the screen's gate sheet, for a guest whose tap is an
 * invitation to join rather than a commitment they can make yet.
 * @param scope passed only by the Family feed, which is the one surface that has
 * one (it lives in that screen's component state; docs/spec/22 §5).
 */
export function useIntercessionPress(
  prayer: PrayerFeedItem,
  onGateNeeded: () => void,
  scope?: FamilyScope,
): IntercessionControls {
  const isMember = useAuthStore((state) => state.status === 'member');
  const commitment = commitmentOf(prayer);

  // Whether the way back is currently open. There is nothing to remember about
  // WHERE it goes: undo always clears the commitment.
  const [canUndo, setCanUndo] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const closeWindow = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setCanUndo(false);
  }, []);

  // A card scrolled away mid-window must not leave a timer running, and the
  // window must not survive the screen that opened it.
  useEffect(() => closeWindow, [closeWindow]);

  const send = useCallback((prayerId: string, wish: IntercessionWish) => {
    applyIntercessionToCaches(prayerId, wish);
    pushWrite('intercession', prayerId, wish);
  }, []);

  const step = () => {
    if (!isMember) {
      onGateNeeded();
      return;
    }
    const wish = commitment === 'none' ? 'committed' : 'prayed';
    send(prayer.id, wish);
    // Here on the STEP and never in `send`: the undo goes through `send` too,
    // and a correction is not a tap. `own_branch` is north star 3 read at the
    // source: the prayer's branch against the member's HOME branch, which is
    // not the browsed branch `track()` already sends. The absent scope stays
    // absent (spreading `scope: undefined` would erase the standard null).
    track('i_prayed_tapped', {
      own_branch:
        prayer.branch_id === useAuthStore.getState().profile?.branchId,
      stage: wish === 'committed' ? 'will_pray' : 'prayed',
      ...(scope !== undefined ? { scope } : {}),
    });

    if (timer.current) clearTimeout(timer.current);
    setCanUndo(true);
    timer.current = setTimeout(closeWindow, UNDO_WINDOW_MS);
  };

  const undo = () => {
    send(prayer.id, 'none');
    closeWindow();
  };

  return {
    commitment,
    // Fulfilled is the end of the road. `undefined` rather than a no-op handler
    // so the pill renders as a statement rather than a button nobody should press.
    onPress: commitment === 'prayed' ? undefined : step,
    onUndo: canUndo ? undo : undefined,
  };
}
