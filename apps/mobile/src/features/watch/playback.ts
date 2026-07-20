import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

// Local playback positions (decision 2026-07-20, docs/spec/08): losing your
// place because a call came in is not acceptable, signed in or not. This store
// is the DEVICE-LOCAL half: it works for guests and members alike and survives
// process death. Members additionally sync `playback_positions` server-side so
// the position follows across devices (W3.1); that layer wins when present.

/** Below this, the user has barely started: not worth saving or restoring. */
export const MIN_RESUME_SEC = 15;
/** Within this of the end, treat it as finished and start over. */
export const END_GRACE_SEC = 30;
/** Bounded: an unbounded map would grow with every sermon ever opened. */
const MAX_ENTRIES = 100;

export interface PlaybackEntry {
  positionSec: number;
  updatedAt: number;
}

interface PlaybackState {
  positions: Record<string, PlaybackEntry>;
  save: (sermonId: string, positionSec: number, now?: number) => void;
  clear: (sermonId: string) => void;
}

export const usePlaybackStore = create<PlaybackState>()(
  persist(
    (set) => ({
      positions: {},
      save: (sermonId, positionSec, now = Date.now()) => {
        set((state) => ({
          positions: prunePositions(
            {
              ...state.positions,
              [sermonId]: {
                positionSec: Math.floor(positionSec),
                updatedAt: now,
              },
            },
            MAX_ENTRIES,
          ),
        }));
      },
      clear: (sermonId) => {
        set((state) => ({
          positions: Object.fromEntries(
            Object.entries(state.positions).filter(([id]) => id !== sermonId),
          ),
        }));
      },
    }),
    {
      name: 'agbc-playback-positions',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);

/** Keep the most recently touched entries only. Pure, for tests. */
export function prunePositions(
  positions: Record<string, PlaybackEntry>,
  max: number,
): Record<string, PlaybackEntry> {
  const entries = Object.entries(positions);
  if (entries.length <= max) return positions;
  return Object.fromEntries(
    entries.sort((a, b) => b[1].updatedAt - a[1].updatedAt).slice(0, max),
  );
}

/**
 * Where playback should start, or null to begin at 0: too early in, or close
 * enough to the end that the user has effectively finished it. Pure, for tests.
 */
export function resumeTarget(
  entry: PlaybackEntry | undefined,
  durationSec: number | null,
): number | null {
  if (!entry || entry.positionSec < MIN_RESUME_SEC) return null;
  if (durationSec !== null && entry.positionSec > durationSec - END_GRACE_SEC) {
    return null;
  }
  return entry.positionSec;
}

/** Whether a reported position is worth persisting. Pure, for tests. */
export function shouldSave(positionSec: number): boolean {
  return Number.isFinite(positionSec) && positionSec >= MIN_RESUME_SEC;
}
