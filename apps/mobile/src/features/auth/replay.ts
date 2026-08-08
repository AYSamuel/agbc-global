import { router } from 'expo-router';

import { applyGloryToCaches } from '@/features/family/gloryCache';
import { applyIntercessionToCaches } from '@/features/family/prayerCache';
import { queueCheckIn } from '@/features/rhythm/useImHere';
import { pushWrite } from '@/lib/writeQueue';
import type { GateAction } from '@/state/gate';

// Gate-return executors (docs/spec/03, 04 rule 9): after AUTH-4 lands the user
// back on the origin screen, the remembered action completes here. Each kind's
// REAL executor arrives with its own work item; until then it resolves 'noop'
// (the user is back where they started, which is already the promise kept).
//
// glory went live at W2.2 (its backend has existed since W1.5), as a direct
// write from here. W2.4 replaced that with an enqueue, so the gate-return path
// and an ordinary tap are now the SAME path: one place decides what a Glory
// means, one place retries it, and a member who signs in on a train still has
// their reaction land when the signal comes back.

export type ReplayOutcome = 'done' | 'noop' | 'failed';

// Returns a promise rather than being `async`: every executor here happens to
// be synchronous today (one enqueue, one navigation), but the contract is
// asynchronous because the ones still to land are not (rsvp, playback).
export function replayGateAction(action: GateAction): Promise<ReplayOutcome> {
  switch (action.kind) {
    case 'glory': {
      // The gated action was "say Glory to this", and it is queued rather than
      // sent: the queue owns idempotency, retries and the optimistic count, and
      // the card reads its state from there either way (docs/spec/01 §8).
      // Same two steps as an ordinary tap (features/family/useGlory): show it,
      // then queue it. The member is landing back on the card that sent them to
      // sign in, and it should already be reacted when they get there.
      applyGloryToCaches(action.testimonyId, true);
      pushWrite('glory', action.testimonyId, 'on');
      return Promise.resolve('done');
    }
    case 'intercede': {
      // The gated action was "I will pray", the FIRST step and never the second:
      // a member returning from sign-in has promised to pray, not yet prayed.
      // Same two steps as an ordinary tap: show it, then queue it.
      applyIntercessionToCaches(action.prayerId, 'committed');
      pushWrite('intercession', action.prayerId, 'committed');
      return Promise.resolve('done');
    }
    case 'compose': {
      // The gated action WAS "open the composer", so replaying it is opening
      // the composer. The route is chosen from the action's own target and
      // never from anything a link could supply (docs/spec/03: the pending
      // action exists only in memory, set only by a gate tap this session).
      router.push(
        action.target === 'prayer' ? '/prayer/compose' : '/testimony/compose',
      );
      return Promise.resolve('done');
    }
    case 'im_here': {
      // The gated action was "I'm here", and it takes the same path an ordinary
      // tap does: show it, queue it, say it. The branch travelled with the
      // action rather than being read from the chip now, because the member is
      // being returned to the card they tapped and that is the branch they were
      // standing in (docs/spec/07).
      queueCheckIn(action.branchId);
      return Promise.resolve('done');
    }
    case 'my_posts': {
      // The gated action WAS "show me my posts", so replaying it is the screen. `replace`
      // and not `push`: AUTH-4 has already returned them to /(tabs)/more, which is where
      // they started, and a pushed screen would leave a back stack of the sign-in they
      // just finished.
      router.replace('/my-posts');
      return Promise.resolve('done');
    }
    case 'rhythm': {
      // Same shape as my_posts: the gated action WAS the screen. `replace` for
      // the same reason, so the finished sign-in leaves no back stack behind.
      router.replace('/rhythm');
      return Promise.resolve('done');
    }
    // Executors land with their work items: rsvp (W2.9), im_here (W2.8),
    // save/notes/resume (W3.1), notifications (W3.3).
    default:
      return Promise.resolve('noop');
  }
}
