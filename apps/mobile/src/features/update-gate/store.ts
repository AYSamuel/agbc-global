import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { supabase } from '@/lib/supabase';

import { resolveMinimumVersion } from './version';

// The cached forced-update floor (docs/spec/21 §8): app_config.
// minimum_supported_version is fetched on every launch and persisted, so a
// below-minimum binary blocks even when it starts offline. No cached value yet
// (first launch offline) fails open; the gate never strands a fresh install.
//
// What is stored is the floor ALREADY RESOLVED for this platform, not the raw
// config value. That is deliberate: the persisted shape stays a plain string, so
// making the remote value per-platform needed no persist migration and no cache
// invalidation. A device holding a floor cached before that change keeps working.

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

  // value is jsonb: an object keyed by platform ({"ios":"1.0.0","android":"1.0.0"}),
  // or a bare string meaning both. resolveMinimumVersion() owns that contract and
  // fails open on anything else.
  const floor = resolveMinimumVersion(data.value, Platform.OS);

  // Only overwrite the cache when the server gave us something usable. A malformed
  // value must not clear a floor that was legitimately set: that would silently
  // unblock a build the ministry had decided to block, and it would look like the
  // gate simply stopped working.
  if (floor !== null) {
    useUpdateGateStore.getState().setMinimumVersion(floor);
  }
}
