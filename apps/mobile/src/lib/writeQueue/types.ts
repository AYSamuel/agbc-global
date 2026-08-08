// The offline write queue's vocabulary (docs/spec/01 §8).
//
// The queue stores the DESIRED END STATE per entity, never an operation log. A
// member who taps Glory, untaps it and taps it again has expressed one wish, so
// exactly one idempotent write replays and ordering races cannot occur. Every
// type here exists to make that shape impossible to misuse.

/**
 * One entity kind the queue knows how to replay. `01` §8 lists six; three are
 * live (glory and intercession at W2.4, attendance at W2.8) and the rest are
 * registered by the work item that builds their surface: `rsvp` (W2.9),
 * `playback` (W3.1), `plan_day` (Phase 4). Adding a kind here without a handler
 * is caught at compile time by the registry.
 */
export type QueuedKind = 'glory' | 'intercession' | 'attendance';

/**
 * The end state per kind. Glory is a toggle because `09` says "tap again to
 * remove". The prayer commitment is forward-only in spirit, and `none` is not a
 * fourth direction: it is the member taking back a mis-tap, which the database
 * permits for a couple of minutes and refuses after (W2.4, 2026-07-28).
 *
 * Because the queue keeps only the LAST wish per entity, tapping and undoing
 * before the queue drains sends nothing at all: the two collapse and the server
 * never hears about either.
 */
export interface QueuedStates {
  glory: 'on' | 'off';
  intercession: 'none' | 'committed' | 'prayed';
  /**
   * The branch the member was standing in. Attendance has no off switch, so the
   * end state of a day is not "on" but WHERE: a member who taps at Berlin,
   * notices they were browsing Glasgow and taps again has expressed one day at
   * one branch, and the queue collapses it to exactly that (W2.8).
   */
  attendance: string;
}

export type QueuedWrite = {
  [K in QueuedKind]: {
    kind: K;
    /**
     * Testimony id for glory, prayer id for an intercession, and for attendance
     * the DEVICE-LOCAL date of the tap (`features/home/queries` localDateKey).
     *
     * That date is bookkeeping and nothing else: it is never displayed, never
     * sent, and never decides anything. `service_date` stays the server's, from
     * `client_taken_at` in the branch's timezone (`20260807120000`). What it
     * buys is one slot per day, so two Sundays tapped during one long offline
     * stretch stay two wishes instead of the second overwriting the first.
     */
    entityId: string;
    state: QueuedStates[K];
    /**
     * For eviction order (oldest entity first). Attendance also SENDS it, as
     * `client_taken_at`, which is why the clamp exists: a Sunday tap replayed on
     * Monday still records Sunday (docs/spec/02).
     */
    queuedAt: number;
  };
}[QueuedKind];

/** `${kind}:${entityId}`: one slot per entity, which IS the collapsing rule. */
export type QueueKey = string;

/** Partial on purpose: indexing a queue must yield `QueuedWrite | undefined`, so
 * every "is this entity queued?" check is a real check rather than one the type
 * system quietly optimises away. */
export type WriteQueue = Readonly<Partial<Record<QueueKey, QueuedWrite>>>;

export function queueKey(kind: QueuedKind, entityId: string): QueueKey {
  return `${kind}:${entityId}`;
}

/**
 * What a handler reports back.
 *
 * - `done`: the server accepted it (or had already accepted an identical write,
 *   which is the same thing to a queue built on idempotent writes).
 * - `refused`: the server said no and will keep saying no. The post was removed,
 *   the prayer was answered, the member was blocked. Drop the entry and let the
 *   UI fall back to server state, quietly: `01` §8 says server state wins and a
 *   rejected replay reconciles without ceremony.
 * - `retry`: transport. Nothing was decided, so the wish stays queued.
 */
export type ReplayOutcome = 'done' | 'refused' | 'retry';

export type WriteHandler = (write: QueuedWrite) => Promise<ReplayOutcome>;

/** Every kind must have a handler before the driver will run: a queued write
 * with nowhere to go is a promise the app cannot keep. */
export type WriteHandlers = Readonly<Record<QueuedKind, WriteHandler>>;
