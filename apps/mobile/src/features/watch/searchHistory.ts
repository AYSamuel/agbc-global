import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

// Recent search terms for WATCH-SEARCH's empty state (docs/spec/08: "Empty →
// recent searches / suggestions"). Local-only, capped, newest first.

const MAX_RECENT = 8;

interface SearchHistoryState {
  terms: string[];
  remember: (term: string) => void;
  clear: () => void;
}

export const useSearchHistoryStore = create<SearchHistoryState>()(
  persist(
    (set) => ({
      terms: [],
      remember: (term) => {
        const trimmed = term.trim();
        if (trimmed.length < 2) return;
        set((state) => ({
          terms: [
            trimmed,
            ...state.terms.filter(
              (t) => t.toLowerCase() !== trimmed.toLowerCase(),
            ),
          ].slice(0, MAX_RECENT),
        }));
      },
      clear: () => set({ terms: [] }),
    }),
    {
      name: 'agbc-watch-searches',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
