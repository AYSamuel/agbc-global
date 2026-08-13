import { useState } from 'react';

import { track } from '@/lib/analytics';
import { pushWrite } from '@/lib/writeQueue';
import { useAuthStore } from '@/state/auth';

import { applyGloryToCaches } from './gloryCache';
import type { FamilyScope } from './queries';

// What a Glory control shows, and what a tap does.
//
// ONE source of truth: the testimony's own cached row. `reacted_by_me` and
// `glory_count` travel together on it (W2.4 migration), a tap patches it
// immediately, and the write queue then delivers that same intention to the
// server with retries and offline replay. By the time the write lands there is
// nothing left to change on screen, so there is no second render to get wrong.
//
// The optimistic state used to live in the queue instead, and the card read both
// stores at once. That was arithmetically correct and still flickered, because
// the two notify React at different times: see the note in gloryCache.ts.

export interface GloryReaction {
  reacted: boolean;
  count: number;
  /** Applies the opposite of the current state, then queues it for delivery. */
  toggle: () => void;
}

/**
 * What `glory_tapped` needs that the mutation would not otherwise know. Required
 * rather than optional, so a new Glory surface has to decide these instead of
 * quietly shipping taps that are invisible to north star 3 (docs/spec/22 §5).
 */
export interface GloryAnalytics {
  /** The TESTIMONY's branch. `own_branch` is whether it matches the member's
   * home branch, which is not the browsed branch `track()` already sends. */
  branchId: string | null;
  /** Only the Family feed has one; everywhere else the event omits it. */
  scope?: FamilyScope;
}

/**
 * @param count `glory_count` from the row.
 * @param reacted `reacted_by_me` from the same row.
 */
export function useGloryReaction(
  testimonyId: string,
  count: number,
  reacted: boolean,
  analytics: GloryAnalytics,
): GloryReaction {
  return {
    reacted,
    count,
    toggle: () => {
      const next = !reacted;
      // Screen first, then the wire: the tap is answered by the next frame
      // whether or not there is a network to answer it.
      applyGloryToCaches(testimonyId, next);
      pushWrite('glory', testimonyId, next ? 'on' : 'off');
      // The event follows the write, and only the ON tap is a reaction: the
      // undo is a correction, not a second act. North star 3 reads `own_branch`
      // at the source; with no row loaded there is no truthful answer, so no
      // event beats a guessed one (in practice the pill only renders from a
      // loaded row). The absent scope stays absent: spreading `scope:
      // undefined` would erase the standard `scope: null` in track().
      if (next && analytics.branchId !== null) {
        track('glory_tapped', {
          own_branch:
            analytics.branchId === useAuthStore.getState().profile?.branchId,
          ...(analytics.scope !== undefined ? { scope: analytics.scope } : {}),
        });
      }
    },
  };
}

/**
 * Everything a Glory control needs: what to show, and what a tap does. The guest
 * branch lives here rather than in each screen because "browsing is free,
 * contributing signs you in" is one app-wide rule (docs/spec/03), and three
 * copies of it would be three chances to get it wrong.
 *
 * @param onGateNeeded opens that screen's gate sheet. The sheet itself stays
 * with the screen, which is what owns its visibility.
 */
export function useGloryPress(
  testimonyId: string,
  serverCount: number,
  serverReacted: boolean,
  onGateNeeded: () => void,
  analytics: GloryAnalytics,
): { reacted: boolean; count: number; bursts: number; onPress: () => void } {
  const isMember = useAuthStore((state) => state.status === 'member');
  const { reacted, count, toggle } = useGloryReaction(
    testimonyId,
    serverCount,
    serverReacted,
    analytics,
  );
  // Counted here, on the TAP, and never derived from `reacted` changing. A
  // transition-watching effect looked equivalent and was not: it also fired when
  // the server's answer arrived, celebrating a reaction the member had already
  // been shown (found on device, 2026-07-27). Celebration belongs to the act.
  const [bursts, setBursts] = useState(0);

  return {
    reacted,
    count,
    bursts,
    onPress: () => {
      if (!isMember) {
        onGateNeeded();
        return;
      }
      if (!reacted) setBursts((n) => n + 1);
      toggle();
    },
  };
}
