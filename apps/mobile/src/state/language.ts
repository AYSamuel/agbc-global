import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import i18n, { deviceLanguage, type SupportedLanguage } from '@/i18n';

export type LanguagePref = 'system' | SupportedLanguage;

// Pure resolution, same shape as the theme store's (docs/spec/16: `system` follows
// the device; explicit choice wins; members sync profiles.language from W2.1).
export function resolveLanguage(
  pref: LanguagePref,
  device: SupportedLanguage,
): SupportedLanguage {
  return pref === 'system' ? device : pref;
}

interface LanguagePrefState {
  pref: LanguagePref;
  setPref: (pref: LanguagePref) => void;
}

function applyLanguage(pref: LanguagePref) {
  // changeLanguage is async (event fan-out); UI re-renders via react-i18next.
  void i18n.changeLanguage(resolveLanguage(pref, deviceLanguage()));
}

export const useLanguagePrefStore = create<LanguagePrefState>()(
  persist(
    (set) => ({
      pref: 'system',
      setPref: (pref) => {
        set({ pref });
        applyLanguage(pref);
      },
    }),
    {
      name: 'agbc-language-pref',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        // Apply the persisted choice once hydration completes (init used the device
        // language; a stored explicit pref overrides it, docs/spec/16).
        if (state && state.pref !== 'system') {
          applyLanguage(state.pref);
        }
      },
    },
  ),
);
