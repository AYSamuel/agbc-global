import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

// When the app is allowed to ask about notifications (docs/spec/06).
//
// The OS prompt never appears in onboarding. It fires at the first VALUE MOMENT
// instead, and only after a sheet has explained why, because iOS shows its
// dialog once per install and a refusal there is permanent. So there are two
// facts to keep: whether a value moment has just happened (this session), and
// whether the sheet has ever been shown (forever).
//
// `asked` persists and `pending` does not, which is the whole design: a member
// who backgrounds the app mid-sheet is not asked again on the next launch out of
// nowhere, and one who has been asked once is never asked again by this app at
// all. Settings is where it can be turned on later (`16`, W3.3).

interface AskState {
  /** The sheet has been shown once. Never shown again. */
  asked: boolean;
  /** A value moment happened just now and the sheet is due. Not persisted. */
  pending: boolean;
  /** Called at the moment itself: a recorded check-in today (RSVP joins at W2.9). */
  reachedValueMoment: () => void;
  markAsked: () => void;
  clearPending: () => void;
  reset: () => void;
}

export const useNotificationAskStore = create<AskState>()(
  persist(
    (set, get) => ({
      asked: false,
      pending: false,
      reachedValueMoment: () => {
        // Nothing to raise if this app has already had its one ask.
        if (get().asked) return;
        set({ pending: true });
      },
      markAsked: () => {
        set({ asked: true, pending: false });
      },
      clearPending: () => {
        set({ pending: false });
      },
      reset: () => {
        set({ asked: false, pending: false });
      },
    }),
    {
      name: 'agbc-notification-ask',
      storage: createJSONStorage(() => AsyncStorage),
      // `pending` is a moment, not a state to restore.
      partialize: (state) => ({ asked: state.asked }),
    },
  ),
);
