import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface LaunchState {
  hasOnboarded: boolean;
  /** True once the persisted state has loaded; SPLASH waits on it before routing. */
  hydrated: boolean;
  completeOnboarding: () => void;
  setHydrated: () => void;
}

export const useLaunchStore = create<LaunchState>()(
  persist(
    (set) => ({
      hasOnboarded: false,
      hydrated: false,
      completeOnboarding: () => set({ hasOnboarded: true }),
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: 'agbc-launch',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ hasOnboarded: state.hasOnboarded }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
      },
    },
  ),
);

// Pure so SPLASH routing is unit-testable (docs/spec/06: first launch goes to
// onboarding; returning users go straight to Home with restored choices). Literal
// return union keeps expo-router's typed routes satisfied.
export function resolveEntryRoute(
  hasOnboarded: boolean,
): '/home' | '/onboarding/welcome' {
  return hasOnboarded ? '/home' : '/onboarding/welcome';
}
