import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

// Analytics consent (docs/spec/20 §Consent mechanics, ADR 0020).
//
// Product analytics is opt-in: nothing is captured until somebody says yes, and the
// answer lives on the DEVICE rather than on a profile, because first run has no account
// and a guest's taps are exactly what the funnel is measuring (gate_shown is a guest
// event by definition).
//
// Three states, not a boolean: 'unasked' is the reason the sheet appears, and it has to
// be distinguishable from 'denied' so a refusal is never asked again. Same shape and the
// same reasoning as the notification pre-permission store (features/notifications/ask.ts).
//
// The default before hydration is 'unasked', so the gate FAILS CLOSED: the few hundred
// milliseconds before AsyncStorage answers capture nothing rather than capturing on a
// guess. `hydrated` exists so the sheet does not flash at somebody who already answered.

export type AnalyticsConsent = 'unasked' | 'granted' | 'denied';

interface ConsentState {
  consent: AnalyticsConsent;
  /** True once the persisted answer has loaded. The sheet waits for it. */
  hydrated: boolean;
  grant: () => void;
  deny: () => void;
  setHydrated: () => void;
  /** Test seam, and the path a future "start over" would use. */
  reset: () => void;
}

export const useAnalyticsConsentStore = create<ConsentState>()(
  persist(
    (set) => ({
      consent: 'unasked',
      hydrated: false,
      grant: () => set({ consent: 'granted' }),
      deny: () => set({ consent: 'denied' }),
      setHydrated: () => set({ hydrated: true }),
      reset: () => set({ consent: 'unasked' }),
    }),
    {
      name: 'agbc-analytics-consent',
      storage: createJSONStorage(() => AsyncStorage),
      // `hydrated` is about this launch, never restored from the last one.
      partialize: (state) => ({ consent: state.consent }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
      },
    },
  ),
);

/** The one question the capture path asks. Anything but a recorded yes means no. */
export function hasAnalyticsConsent(): boolean {
  return useAnalyticsConsentStore.getState().consent === 'granted';
}
