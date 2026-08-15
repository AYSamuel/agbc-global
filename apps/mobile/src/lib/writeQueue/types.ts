// The offline write queue's vocabulary (docs/spec/01 §8).
//
// The queue stores the DESIRED END STATE per entity, never an operation log. A
// member who taps Glory, untaps it and taps it again has expressed one wish, so
// exactly one idempotent write replays and ordering races cannot occur. Every
// type here exists to make that shape impossible to misuse.

/**
 * One entity kind the queue knows how to replay. Five are live (glory and
 * intercession at W2.4, attendance at W2.8, rsvp at W2.9, saved at W3.1);
 * `plan_day` (Phase 4) registers with the work item that builds its surface.
 * Playback position is deliberately NOT a kind: it supersedes itself every ten
 * seconds and rides its own throttled direct write instead
 * (features/watch/serverPosition.ts; `01` §8 says both).
 *
 * Adding a kind here without a handler is caught at compile time by the
 * registry, and without a stored-state rule by `storage.VALID_STATE`. Both
 * checks exist because a kind that is only half-registered does not fail: it
 * quietly drops the member's tap (W2.9).
 */
export type QueuedKind =
  'glory' | 'intercession' | 'attendance' | 'rsvp' | 'saved';

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
  /**
   * The answer, which is the whole state: `rsvps` keeps ONE row per member per
   * event and changing your mind is an UPDATE, so "cancelled" is a value rather
   * than a deletion and the row is remembered (docs/spec/11).
   *
   * The end-state model earns its keep here more than anywhere: a member who
   * taps going, then interested, then cancels while offline has expressed one
   * answer, and exactly one write replays.
   */
  rsvp: 'going' | 'interested' | 'cancelled';
  /**
   * Glory's shape for the same reason (docs/spec/08, W3.1 slice 4): My List
   * membership is a toggle, so save-unsave-save while offline collapses to the
   * one wish still standing, and exactly one idempotent write replays.
   */
  saved: 'on' | 'off';
}

export type QueuedWrite = {
  [K in QueuedKind]: {
    kind: K;
    /**
     * Testimony id for glory, prayer id for an intercession, event id for an
     * RSVP, sermon id for a save, and for attendance the DEVICE-LOCAL date of
     * the tap (`features/home/queries` localDateKey).
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
