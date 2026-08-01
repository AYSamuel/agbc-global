import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * Which branch-change outcomes this member has already been shown (ADR 0015, docs/spec/16).
 *
 * WHY THIS IS ON THE DEVICE RATHER THAN IN THE DATABASE, since it is the question the whole
 * outcome flow turns on. The alternative was an `acknowledged_at` column on
 * `branch_change_requests`, which would survive a reinstall and follow the member to a
 * second phone. It was not chosen, for three reasons:
 *
 *  1. `022` pins that table's column list in a pgTAP assertion, precisely so that a column
 *     added later cannot quietly disclose itself to whichever reader the policies already
 *     admit. This one would be safe for every reader, but "safe" is a judgement each new
 *     column re-opens, and a UI acknowledgement is a thin reason to re-open it.
 *  2. Dismissal is already a local act everywhere else in this app: the Home banner is
 *     described in the plan as "quiet, dismissible", and nothing else the member dismisses
 *     travels between devices.
 *  3. The failure mode is mild and bounded. After a reinstall a member may see one
 *     "Welcome to Berlin" or one "not approved" a second time. Neither is harmful, and
 *     both are true.
 *
 * KEYED BY REQUEST ID, not by a single boolean, so a member who moves again months later
 * meets the new outcome properly instead of it being swallowed by an old acknowledgement.
 *
 * NOT KEYED BY MEMBER, deliberately: request ids are uuids, so a second member signing in
 * on the same phone can never collide with the first one's entries, and storing the member
 * alongside them would put an identity in local storage to solve a problem that does not
 * exist.
 */

interface SeenState {
  /** Requests whose decided outcome has been shown once (welcome, or the refusal sheet). */
  acknowledged: string[];
  /** Open requests whose quiet line on Home has been dismissed. */
  dismissed: string[];
  acknowledge: (requestId: string) => void;
  dismiss: (requestId: string) => void;
}

export const useBranchOutcomeStore = create<SeenState>()(
  persist(
    (set) => ({
      acknowledged: [],
      dismissed: [],
      acknowledge: (requestId) =>
        set((state) =>
          state.acknowledged.includes(requestId)
            ? state
            : { acknowledged: [...state.acknowledged, requestId] },
        ),
      dismiss: (requestId) =>
        set((state) =>
          state.dismissed.includes(requestId)
            ? state
            : { dismissed: [...state.dismissed, requestId] },
        ),
    }),
    {
      name: 'agbc-branch-outcomes',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
