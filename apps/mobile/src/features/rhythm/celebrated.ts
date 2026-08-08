import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

// Which milestones this device has already celebrated (docs/spec/10: "no double
// celebrations").
//
// The `milestones` rows are the truth about what was ACHIEVED, and the server
// keeps that unique per member. What it cannot know is whether this person has
// yet been TOLD, which is a fact about a screen rather than about a member, so
// it lives here: the same shape as the branch-outcome store W2.7 built for
// "have they seen the welcome yet".
//
// THE BASELINE is the part worth reading twice. A member who has been here for
// months already holds `first_service` and `4_week_rhythm`; celebrating those
// the first time this device fetches them would be the app congratulating
// somebody for something they did in June. So the first list a member's device
// ever sees is recorded WITHOUT celebrating any of it, and only what appears
// afterwards is new. The cost is that a milestone earned in the gap before the
// first fetch is never celebrated; the alternative is a party for old news, and
// `10` is clear which of those is worse.
//
// Cleared when the session's identity changes (state/auth), because "already
// told" is true of a person, and the next person on this phone has not been told
// anything.

interface CelebratedState {
  /** Null until this member's first list has been seen. */
  known: string[] | null;
  /**
   * The kind currently on screen, so the notification ask can wait its turn
   * (the frames' flow: checked in -> celebration -> reminder sheet). Not
   * persisted: it is what is happening, not what has happened.
   */
  showing: string | null;
  /** The first sighting: everything already achieved counts as already told. */
  seedBaseline: (kinds: string[]) => void;
  setShowing: (kind: string | null) => void;
  /** After the overlay has been shown. */
  markCelebrated: (kind: string) => void;
  reset: () => void;
}

export const useCelebratedStore = create<CelebratedState>()(
  persist(
    (set, get) => ({
      known: null,
      showing: null,
      setShowing: (kind) => {
        set({ showing: kind });
      },
      seedBaseline: (kinds) => {
        // Only ever the FIRST time: a later empty answer (an error, a signed-out
        // moment) must not re-arm every milestone the member holds.
        if (get().known !== null) return;
        set({ known: [...kinds] });
      },
      markCelebrated: (kind) => {
        const known = get().known;
        if (known === null) {
          set({ known: [kind] });
          return;
        }
        if (known.includes(kind)) return;
        set({ known: [...known, kind] });
      },
      reset: () => {
        set({ known: null, showing: null });
      },
    }),
    {
      name: 'agbc-celebrated',
      storage: createJSONStorage(() => AsyncStorage),
      // Only what has happened persists; what is on screen does not.
      partialize: (state) => ({ known: state.known }),
    },
  ),
);

/**
 * The kinds achieved but not yet celebrated, oldest first, or `[]` while the
 * baseline is still being established.
 *
 * Pure so the baseline rule can be asserted without a store or a screen.
 */
export function uncelebrated(
  achieved: readonly string[],
  known: readonly string[] | null,
): string[] {
  if (known === null) return [];
  return achieved.filter((kind) => !known.includes(kind));
}
