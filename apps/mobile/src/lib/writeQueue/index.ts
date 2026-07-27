import { AppState, type AppStateStatus } from 'react-native';
import { create } from 'zustand';

import { onReconnect } from './connectivity';
import {
  clearQueue,
  enqueue,
  pendingState,
  queueSize,
  replayOrder,
  settle,
} from './reducer';
import { loadQueue, saveQueue } from './storage';
import {
  queueKey,
  type QueuedKind,
  type QueuedStates,
  type WriteHandlers,
  type WriteQueue,
} from './types';

// The offline write queue (docs/spec/01 §8). One idempotent write per entity,
// replayed when the app can reach the server; the member taps and moves on.
//
// The UI reads its optimistic state FROM here (`usePendingWrite`) rather than
// holding its own copy, which is what makes the eviction rule real: when an
// entity is dropped to stay under the cap its entry vanishes, the card falls
// back to server state, and no component needed a line of code to revert.

export * from './types';
export { QUEUE_CAP } from './reducer';
export { reconnectDetectionAvailable } from './connectivity';

/** Backoff between drain attempts while anything is still waiting. Bounded and
 * short: this is the fallback for builds with no reconnect detection, so it has
 * to be the difference between "a few seconds late" and "never". */
const RETRY_MS = [10_000, 30_000, 60_000] as const;

interface WriteQueueState {
  queue: WriteQueue;
  hydrated: boolean;
  /** Absent until the composition root wires the feature handlers. */
  handlers: WriteHandlers | null;
  /** Called when the cap forces a wish to be dropped. `01` §8 requires eviction
   * to revert that entity's optimistic UI, and only the feature that applied it
   * knows how to take it back. */
  onEvicted: (() => void) | null;
  draining: boolean;
  failures: number;
  setHandlers: (handlers: WriteHandlers, onEvicted?: () => void) => void;
  hydrate: () => Promise<void>;
  /** Record what the member now wants, then try to send it straight away. */
  push: <K extends QueuedKind>(
    kind: K,
    entityId: string,
    state: QueuedStates[K],
  ) => void;
  drain: () => Promise<void>;
  /** Sign-out: a member's unsent intentions leave with them (`01` §8). */
  reset: () => Promise<void>;
}

export const useWriteQueueStore = create<WriteQueueState>()((set, get) => ({
  queue: {},
  hydrated: false,
  handlers: null,
  onEvicted: null,
  draining: false,
  failures: 0,

  setHandlers: (handlers, onEvicted) => {
    set({ handlers, onEvicted: onEvicted ?? null });
  },

  hydrate: async () => {
    const stored = await loadQueue();
    // Merge under anything pushed while the read was in flight: a tap made
    // during launch outranks the version of that entity on disk.
    set((state) => ({
      queue: { ...stored, ...state.queue },
      hydrated: true,
    }));
    void get().drain();
  },

  push: (kind, entityId, state) => {
    const { queue, evicted } = enqueue(
      get().queue,
      kind,
      entityId,
      state,
      Date.now(),
    );
    if (evicted.length > 0) {
      // Nothing to undo by hand: those entities no longer have a pending state,
      // so every card reading through usePendingWrite is already showing the
      // server's answer again.
      console.warn(
        `writeQueue: evicted ${String(evicted.length)} pending write(s)`,
      );
    }
    set({ queue });
    void saveQueue(queue);
    void get().drain();
  },

  drain: async () => {
    const { draining, handlers, queue } = get();
    // One drain at a time: two concurrent passes would each take the same
    // snapshot and send every write twice. Idempotency makes that survivable,
    // not acceptable.
    if (draining || handlers === null) return;
    if (queueSize(queue) === 0) {
      set({ failures: 0 });
      return;
    }

    set({ draining: true });
    let retried = false;
    try {
      // Deliberately NOT a loop over a snapshot. `push` triggers a drain, so a
      // second tap while the first is in flight finds this pass already running
      // and returns; if this pass only knew its opening snapshot, that tap would
      // sit unsent until the retry timer. Instead the pass keeps asking the
      // CURRENT queue what it has not tried yet.
      const attempted = new Set<string>();
      for (;;) {
        const next = replayOrder(get().queue).find(
          (write) => !attempted.has(queueKey(write.kind, write.entityId)),
        );
        if (next === undefined) {
          // Everything present has been tried once. Anything still queued is
          // either waiting on transport (the timer's job) or a fresh tap on an
          // entity this pass already handled, which is worth another round
          // precisely because the previous round proved the connection works.
          if (retried || queueSize(get().queue) === 0) break;
          attempted.clear();
          continue;
        }

        const key = queueKey(next.kind, next.entityId);
        attempted.add(key);

        let outcome;
        try {
          outcome = await handlers[next.kind](next);
        } catch {
          // A handler that throws is a bug, not an answer: keep the wish rather
          // than silently dropping what the member asked for.
          outcome = 'retry' as const;
        }

        if (outcome === 'retry') {
          retried = true;
          continue;
        }
        // done and refused both end this wish. Both settle the SAME wish that
        // was sent: if a tap landed while the write was in flight, the queue now
        // holds a newer wish that this response does not answer, and erasing it
        // would swallow the member's last tap.
        set((state) => {
          const current = state.queue[key];
          if (current === undefined || current.state !== next.state) {
            return state;
          }
          return { queue: settle(state.queue, key) };
        });
      }
    } finally {
      set({ draining: false });
      void saveQueue(get().queue);
    }

    set((state) => ({ failures: retried ? state.failures + 1 : 0 }));
  },

  reset: async () => {
    set({ queue: clearQueue(), failures: 0 });
    await saveQueue({});
  },
}));

/**
 * The member's pending wish for one entity, or undefined when they have none.
 * Callers render `pending ?? whateverTheServerSaid`.
 */
export function usePendingWrite<K extends QueuedKind>(
  kind: K,
  entityId: string,
): QueuedStates[K] | undefined {
  return useWriteQueueStore((state) =>
    pendingState(state.queue, kind, entityId),
  );
}

/** Enqueue from anywhere, including non-React code (the gate-return replay). */
export function pushWrite<K extends QueuedKind>(
  kind: K,
  entityId: string,
  state: QueuedStates[K],
): void {
  useWriteQueueStore.getState().push(kind, entityId, state);
}

/**
 * Starts the queue: hydrate, then the three triggers that need nothing native
 * (foreground, backoff timer, and the attempt `push` already makes), plus
 * netinfo's reconnect when this build has it. Called once from the root layout;
 * returns its own teardown.
 */
export function startWriteQueue(): () => void {
  const store = useWriteQueueStore.getState();
  void store.hydrate();

  const drain = () => {
    void useWriteQueueStore.getState().drain();
  };

  const appState = AppState.addEventListener(
    'change',
    (status: AppStateStatus) => {
      if (status === 'active') drain();
    },
  );
  const stopReconnect = onReconnect(drain);

  // Retry ladder, re-armed from the store's own failure count so a long outage
  // backs off instead of hammering a network that is plainly not there.
  let timer: ReturnType<typeof setTimeout> | null = null;
  const arm = () => {
    const { queue, failures } = useWriteQueueStore.getState();
    const delay = RETRY_MS[Math.min(failures, RETRY_MS.length - 1)];
    if (timer) clearTimeout(timer);
    timer = queueSize(queue) === 0 ? null : setTimeout(tick, delay);
  };
  const tick = () => {
    void useWriteQueueStore.getState().drain().finally(arm);
  };
  const unsubscribe = useWriteQueueStore.subscribe(arm);
  arm();

  return () => {
    appState.remove();
    stopReconnect();
    unsubscribe();
    if (timer) clearTimeout(timer);
  };
}
