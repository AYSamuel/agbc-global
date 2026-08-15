import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { PlaybackSpeed, PositionSample } from './audio';

// Local playback positions (decision 2026-07-20, docs/spec/08): losing your
// place because a call came in is not acceptable, signed in or not. This store
// is the DEVICE-LOCAL half: it works for guests and members alike and survives
// process death. Members additionally sync `playback_positions` server-side
// (W3.1), and `preferredPosition` decides between the two on open.

/** Below this, the user has barely started: not worth RESTORING them to. It no
 * longer decides what is stored (see `shouldSave`), because other things read
 * the stored position for other reasons. */
export const MIN_RESUME_SEC = 15;
/** Within this of the end, treat it as finished and start over. */
export const END_GRACE_SEC = 30;
/** Bounded: an unbounded map would grow with every sermon ever opened. */
const MAX_ENTRIES = 100;

/** One name for the shape, whichever layer wrote it (see `preferredPosition`). */
export type PlaybackEntry = PositionSample;

interface PlaybackState {
  positions: Record<string, PlaybackEntry>;
  /** Sticky across sermons: a member who listens at 1.25x means it every time. */
  speed: PlaybackSpeed;
  save: (sermonId: string, positionSec: number, now?: number) => void;
  clear: (sermonId: string) => void;
  setSpeed: (speed: PlaybackSpeed) => void;
}

export const usePlaybackStore = create<PlaybackState>()(
  persist(
    (set) => ({
      positions: {},
      speed: 1,
      setSpeed: (speed) => {
        set({ speed });
      },
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

/**
 * Whether a reported position is worth persisting. Pure, for tests.
 *
 * Anything past the very start counts, which is NOT the same question as
 * `resumeTarget`'s (amended 2026-08-15, Ayo's report). This used to share
 * `MIN_RESUME_SEC` with it, and that conflated two rules: "you have barely
 * started, do not drag me back here" is about RESUMING, while what gets stored
 * also decides whether SERMON-NOTES can offer "Add a note at 0:08". A thought
 * worth writing down in the first fifteen seconds is an ordinary thing; being
 * resumed to second eight is not, and `resumeTarget` still refuses it on its
 * own. Separating them changes no resume behaviour whatsoever: every early
 * position stored here is one that function keeps ignoring.
 */
export function shouldSave(positionSec: number): boolean {
  return Number.isFinite(positionSec) && positionSec > 0;
}
