import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { ThemeName } from '@agbc/shared/theme';

export type ThemePref = 'system' | ThemeName;

// Pure so the resolution matrix is unit-testable without React (docs/spec/05: `system`
// follows the OS; explicit prefs win). Accepts RN's loosely-typed ColorSchemeName and
// narrows: anything that is not exactly 'dark' resolves light.
export function resolveTheme(
  pref: ThemePref,
  system: string | null | undefined,
): ThemeName {
  if (pref !== 'system') return pref;
  return system === 'dark' ? 'dark' : 'light';
}

interface ThemePrefState {
  pref: ThemePref;
  setPref: (pref: ThemePref) => void;
}

// AsyncStorage by design: theme preference is not a secret; SecureStore is reserved for
// the auth encryption key (docs/spec/03). Members additionally sync profiles.theme_pref
// server-side from W2.1 so the choice follows across devices.
export const useThemePrefStore = create<ThemePrefState>()(
  persist(
    (set) => ({
      pref: 'system',
      setPref: (pref) => set({ pref }),
    }),
    {
      name: 'agbc-theme-pref',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
