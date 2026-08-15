import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  queueKey,
  type QueuedKind,
  type QueuedWrite,
  type WriteQueue,
} from './types';

// The queue survives process death, because "I tapped that on the train" has to
// still be true when the app comes back (docs/spec/01 §8: enqueue locally,
// persisted). It is stored under its OWN key rather than through the TanStack
// persister: that one is opt-in per query (lib/queryMeta) and holds cached reads,
// while this holds a member's unsent intentions, which are cleared on sign-out.

/** Bump the suffix when the stored shape changes: an older queue is then
 * discarded rather than hydrated into a shape it no longer matches. */
const STORAGE_KEY = 'agbc.writeQueue.v1';

/**
 * What counts as a valid stored state, per kind.
 *
 * `Record<QueuedKind, ...>` is the point: this used to be a hand-written list of
 * two kinds, so when `attendance` (W2.8) and `rsvp` (W2.9) joined the queue,
 * every stored one was rejected on hydration and silently dropped. A check-in or
 * an RSVP tapped offline survived until the app was killed and then quietly
 * ceased to exist, which is the exact promise `01` §8 makes and the exact way it
 * cannot be allowed to break. Now a new kind fails to compile until it says what
 * a valid state looks like (found on device, 2026-08-09).
 */
const VALID_STATE: Readonly<Record<QueuedKind, (state: string) => boolean>> = {
  glory: (state) => state === 'on' || state === 'off',
  intercession: (state) =>
    state === 'none' || state === 'committed' || state === 'prayed',
  // The state is the BRANCH the member stood in, an id rather than an enum, so
  // structural validity is all this layer can judge. Whether that branch exists
  // is the server's answer to give.
  attendance: (state) => state.length > 0,
  rsvp: (state) =>
    state === 'going' || state === 'interested' || state === 'cancelled',
  saved: (state) => state === 'on' || state === 'off',
};

const KINDS = Object.keys(VALID_STATE) as readonly QueuedKind[];

/** Pure for tests. Anything malformed reads as "no such entry" rather than
 * throwing: a queue written by an older build must not be able to crash a
 * launch, and losing an unsent tap is recoverable while a boot loop is not. */
export function parseQueue(raw: string | null): WriteQueue {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return {};
    }
    const out: Record<string, QueuedWrite> = {};
    for (const value of Object.values(parsed as Record<string, unknown>)) {
      const write = parseWrite(value);
      // Re-keyed from the entry itself, so a tampered or stale key cannot point
      // at a different entity than the one the entry describes.
      if (write) out[queueKey(write.kind, write.entityId)] = write;
    }
    return out;
  } catch {
    return {};
  }
}

function parseWrite(value: unknown): QueuedWrite | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const kind = KINDS.find((k) => k === record.kind);
  if (!kind) return null;
  if (typeof record.entityId !== 'string' || record.entityId === '')
    return null;
  if (typeof record.state !== 'string' || !VALID_STATE[kind](record.state)) {
    return null;
  }
  return {
    kind,
    entityId: record.entityId,
    state: record.state,
    queuedAt: typeof record.queuedAt === 'number' ? record.queuedAt : 0,
  } as QueuedWrite;
}

export async function loadQueue(): Promise<WriteQueue> {
  try {
    return parseQueue(await AsyncStorage.getItem(STORAGE_KEY));
  } catch {
    // Storage unavailable is not a reason to block someone from tapping.
    return {};
  }
}

export async function saveQueue(queue: WriteQueue): Promise<void> {
  try {
    if (Object.keys(queue).length === 0) {
      await AsyncStorage.removeItem(STORAGE_KEY);
      return;
    }
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // Best effort: the in-memory queue still replays this session.
  }
}
