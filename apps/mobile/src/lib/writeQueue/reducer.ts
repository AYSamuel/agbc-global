import {
  queueKey,
  type QueuedKind,
  type QueuedStates,
  type QueuedWrite,
  type QueueKey,
  type WriteQueue,
} from './types';

// The queue's rules, as pure functions. Everything that decides anything lives
// here so it can be tested without a clock, a network, or a store
// (~/.claude/standards/qa-testing.md: functional core, imperative shell).

/**
 * How many entities may wait at once. `01` §8 asks for "small and capped", and
 * the cap exists to bound storage, not to ration taps: fifty pending reactions
 * is already far past any honest session, and going over means something is
 * wrong (a long outage, a stuck replay) rather than someone being enthusiastic.
 */
export const QUEUE_CAP = 50;

export interface EnqueueResult {
  queue: WriteQueue;
  /**
   * Entities dropped to stay under the cap. Eviction silently breaks a promise,
   * so `01` §8 requires the optimistic UI to be REVERTED for exactly these; the
   * caller announces them and the UI falls back to server state on its own.
   */
  evicted: readonly QueuedWrite[];
}

/**
 * Record what the member now wants for one entity. An existing wish for the same
 * entity is REPLACED, never appended: that single line is what makes
 * tap-untap-tap replay as one write.
 */
export function enqueue<K extends QueuedKind>(
  queue: WriteQueue,
  kind: K,
  entityId: string,
  state: QueuedStates[K],
  now: number,
): EnqueueResult {
  const key = queueKey(kind, entityId);
  // The original queuedAt is kept when overwriting, so repeatedly changing your
  // mind about one testimony cannot push older, patiently waiting entities out.
  const queuedAt = queue[key]?.queuedAt ?? now;
  const write = { kind, entityId, state, queuedAt } as QueuedWrite;
  const next: WriteQueue = { ...queue, [key]: write };

  const present = entries(next);
  if (present.length <= QUEUE_CAP) return { queue: next, evicted: [] };

  // Oldest entity first. The entity just touched is by definition not the
  // oldest unless it is the only one, so this cannot evict what it just added.
  const evicted = present
    .map(([, value]) => value)
    .sort((a, b) => a.queuedAt - b.queuedAt)
    .slice(0, present.length - QUEUE_CAP);
  const dropped = new Set(
    evicted.map((write) => queueKey(write.kind, write.entityId)),
  );
  return { queue: without(next, (key) => dropped.has(key)), evicted };
}

/** Drop one entity's wish: it replayed, or the server refused it for good. */
export function settle(queue: WriteQueue, key: QueueKey): WriteQueue {
  if (queue[key] === undefined) return queue;
  return without(queue, (candidate) => candidate === key);
}

/** Present entries only: the map is Partial, so an explicit undefined is not a
 * queued wish. */
function entries(queue: WriteQueue): [QueueKey, QueuedWrite][] {
  const out: [QueueKey, QueuedWrite][] = [];
  for (const [key, value] of Object.entries(queue)) {
    if (value !== undefined) out.push([key, value]);
  }
  return out;
}

/** Rebuilt rather than deleted from: `delete` on a computed key is banned by the
 * lint config, and copying is the same cost at this size. */
function without(
  queue: WriteQueue,
  drop: (key: QueueKey) => boolean,
): WriteQueue {
  return Object.fromEntries(entries(queue).filter(([key]) => !drop(key)));
}

/** The member's own wishes go with them (`01` §8: cleared on sign-out). */
export function clearQueue(): WriteQueue {
  return {};
}

/**
 * What the UI should show for one entity: the member's pending wish if they have
 * one, otherwise nothing (and the caller falls back to server state). Reading
 * the queue rather than holding separate optimistic state in each card is what
 * makes eviction revert the UI for free: the entry disappears and the card is
 * telling the truth again with no extra code.
 */
export function pendingState<K extends QueuedKind>(
  queue: WriteQueue,
  kind: K,
  entityId: string,
): QueuedStates[K] | undefined {
  const write = queue[queueKey(kind, entityId)];
  if (write === undefined) return undefined;
  return write.state as QueuedStates[K];
}

/** Replay order: oldest wish first, so a queue drained after a long offline
 * stretch reaches the server in the order the member expressed it. Within one
 * entity there is only ever one wish, so this is the whole ordering story. */
export function replayOrder(queue: WriteQueue): readonly QueuedWrite[] {
  return entries(queue)
    .map(([, write]) => write)
    .sort((a, b) => a.queuedAt - b.queuedAt);
}

/** How many wishes are waiting. Counts present entries, not object keys. */
export function queueSize(queue: WriteQueue): number {
  return entries(queue).length;
}
