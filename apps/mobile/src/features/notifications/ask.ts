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

/**
 * Which moment earned the ask. The sheet reassures the member that the thing
 * they just did stands whatever they answer, and that sentence has to name the
 * right thing: "you're checked in either way" read as a lie under an RSVP
 * (found on device, 2026-08-09).
 *
 * `signed_in` is the third of the three triggers `06` names and the LAST to be
 * built (2026-09-07). Without it a member who never checked in and never RSVPd
 * was never asked at all, so the OS was never asked either: notifications piled
 * up in the centre while nothing reached the phone, and NOTIF-PREFS said
 * nothing, because its banner waits for this app to have had its one ask. Ayo
 * lived that for days and had to find the OS setting himself.
 */
export type ValueMoment = 'check_in' | 'rsvp' | 'signed_in';

interface AskState {
  /** The sheet has been shown once. Never shown again. */
  asked: boolean;
  /** The moment that just happened and is owed a sheet. Not persisted. */
  pending: ValueMoment | null;
  /** Called at the moment itself: a recorded check-in, or an RSVP given. */
  reachedValueMoment: (moment: ValueMoment) => void;
  markAsked: () => void;
  clearPending: () => void;
  reset: () => void;
}

export const useNotificationAskStore = create<AskState>()(
  persist(
    (set, get) => ({
      asked: false,
      pending: null,
      reachedValueMoment: (moment) => {
        // Nothing to raise if this app has already had its one ask.
        if (get().asked) return;
        set({ pending: moment });
      },
      markAsked: () => {
        set({ asked: true, pending: null });
      },
      clearPending: () => {
        set({ pending: null });
      },
      reset: () => {
        set({ asked: false, pending: null });
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
