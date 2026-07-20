import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { supabase } from '@/lib/supabase';

// The cached forced-update floor (docs/spec/21 §8): app_config.
// minimum_supported_version is fetched on every launch and persisted, so a
// below-minimum binary blocks even when it starts offline. No cached value yet
// (first launch offline) fails open; the gate never strands a fresh install.

interface UpdateGateState {
  minimumVersion: string | null;
  setMinimumVersion: (version: string | null) => void;
}

export const useUpdateGateStore = create<UpdateGateState>()(
  persist(
    (set) => ({
      minimumVersion: null,
      setMinimumVersion: (minimumVersion) => set({ minimumVersion }),
    }),
    {
      name: 'agbc-update-gate',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

export async function refreshMinimumVersion(): Promise<void> {
  const { data, error } = await supabase
    .from('app_config')
    .select('value')
    .eq('key', 'minimum_supported_version')
    .maybeSingle();

  // Offline/outage is an expected state, not an error surface: the gate keeps the
  // last cached floor and launch proceeds (docs/spec/21 §11 full-outage row).
  if (error || !data) return;

  // value is jsonb; the seed stores a JSON string ("1.0.0").
  const value = data.value;
  if (typeof value === 'string') {
    useUpdateGateStore.getState().setMinimumVersion(value);
  }
}
