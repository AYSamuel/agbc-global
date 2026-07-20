import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface SelectedBranch {
  id: string;
  slug: string;
  name: string;
}

interface BranchState {
  branch: SelectedBranch | null;
  setBranch: (branch: SelectedBranch) => void;
}

// The guest's home-branch choice (docs/spec/06): local-only until sign-in seeds
// AUTH-3 with it (W2.1). Branch-context semantics for browsing live in docs/spec/07.
export const useBranchStore = create<BranchState>()(
  persist(
    (set) => ({
      branch: null,
      setBranch: (branch) => set({ branch }),
    }),
    {
      name: 'agbc-branch',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
