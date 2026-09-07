import { create } from 'zustand';

// The visiting question (docs/spec/07, mockup "HOME · visiting · the confirm").
//
// A check-in records the branch the member is STANDING in, which is the browsed
// one and may not be the one they belong to (`07`, `10`). The card has said so
// since W2.8, in the visit note under the buttons, but a note DISCLOSES and
// never asks, and the tap it sits under writes something no member can undo:
// `attendance` is unique on (profile_id, service_date) and members hold insert
// only, so a tap made while browsing credits the wrong branch AND spends that
// member's one check-in for the day. They reach their own service to find the
// badge already showing, and their branch never gets the row.
//
// So the tap becomes a question whenever the branch tapped is not home. A STORE
// rather than screen state, for the same reason the gate is one (docs/spec/03):
// three taps reach this question, from Home, from BRANCH-INFO and from the
// gate-return replay, and a copy of it per caller is a copy to get wrong. The
// sheet that answers it is mounted at the ROOT (features/rhythm/VisitConfirm),
// beside the celebration and the notification ask, because the screen a member
// is looking at when the question arrives is not always the screen that raised
// it: signing in through the gate can land them on Home with the chip already
// switched to the branch they just made home.
//
// The NAME travels with the id because the asker always knows it and the
// answerer would otherwise have to look it up in a list that can be stale.
//
// Deliberately NOT persisted. An unanswered question is about where somebody is
// standing right now; carrying it across a launch would ask about a day that may
// already be over.

export interface PendingVisit {
  branchId: string;
  branchName: string;
}

interface VisitConfirmState {
  /** The check-in waiting on an answer, or null. */
  pending: PendingVisit | null;
  ask: (visit: PendingVisit) => void;
  clear: () => void;
}

export const useVisitConfirmStore = create<VisitConfirmState>()((set) => ({
  pending: null,
  ask: (visit) => {
    set({ pending: visit });
  },
  clear: () => {
    set({ pending: null });
  },
}));

/**
 * Is this tap a visit, rather than an ordinary Sunday at home?
 *
 * One function because two things read it and they must never disagree: the
 * question above, and the `visiting` property on `attendance_marked`. A guest
 * has no home branch to differ from, so `null` is never visiting.
 */
export function isVisiting(
  homeBranchId: string | null,
  branchId: string,
): boolean {
  return homeBranchId !== null && homeBranchId !== branchId;
}
