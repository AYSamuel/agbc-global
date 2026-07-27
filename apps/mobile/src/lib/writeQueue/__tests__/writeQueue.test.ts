import {
  clearQueue,
  enqueue,
  pendingState,
  QUEUE_CAP,
  replayOrder,
  settle,
} from '../reducer';
import { parseQueue } from '../storage';
import { queueKey, type WriteQueue } from '../types';

// The queue's rules, tested where they live: pure functions, no clock, no
// network, no store. The claim under test throughout is docs/spec/01 §8's
// "the queue stores desired END-STATE per entity, not an op log".

const T1 = 'a1111111-1111-4111-8111-111111111111';
const T2 = 'b2222222-2222-4222-8222-222222222222';
const P1 = 'c3333333-3333-4333-8333-333333333333';

describe('enqueue collapses to one wish per entity', () => {
  test('tap, untap, tap replays as a single "on" write', () => {
    // The Done criterion for W2.4 (docs/spec/25), and the reason the queue is a
    // map rather than a list: three taps, one write, no ordering race possible.
    let queue: WriteQueue = {};
    queue = enqueue(queue, 'glory', T1, 'on', 1000).queue;
    queue = enqueue(queue, 'glory', T1, 'off', 1001).queue;
    queue = enqueue(queue, 'glory', T1, 'on', 1002).queue;

    const writes = replayOrder(queue);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      kind: 'glory',
      entityId: T1,
      state: 'on',
    });
  });

  test('tap and untap still replays once, as "off"', () => {
    let queue: WriteQueue = {};
    queue = enqueue(queue, 'glory', T1, 'on', 1000).queue;
    queue = enqueue(queue, 'glory', T1, 'off', 1001).queue;
    expect(replayOrder(queue)).toHaveLength(1);
    expect(pendingState(queue, 'glory', T1)).toBe('off');
  });

  test('different entities and different kinds keep their own slots', () => {
    let queue: WriteQueue = {};
    queue = enqueue(queue, 'glory', T1, 'on', 1000).queue;
    queue = enqueue(queue, 'glory', T2, 'on', 1001).queue;
    queue = enqueue(queue, 'intercession', P1, 'committed', 1002).queue;
    expect(replayOrder(queue)).toHaveLength(3);
  });

  test('an id that appears under two kinds is not one entity', () => {
    // The key is (kind, id): a testimony and a prayer could share an id and must
    // not collapse into each other.
    let queue: WriteQueue = {};
    queue = enqueue(queue, 'glory', T1, 'on', 1000).queue;
    queue = enqueue(queue, 'intercession', T1, 'committed', 1001).queue;
    expect(replayOrder(queue)).toHaveLength(2);
    expect(pendingState(queue, 'glory', T1)).toBe('on');
    expect(pendingState(queue, 'intercession', T1)).toBe('committed');
  });

  test('changing your mind does not renew your place in the queue', () => {
    // queuedAt survives an overwrite, so re-tapping one testimony cannot push an
    // older, patiently waiting entity out under the cap.
    let queue: WriteQueue = {};
    queue = enqueue(queue, 'glory', T1, 'on', 1000).queue;
    queue = enqueue(queue, 'glory', T1, 'off', 9999).queue;
    expect(replayOrder(queue)[0].queuedAt).toBe(1000);
  });
});

describe('replay order', () => {
  test('oldest wish first', () => {
    let queue: WriteQueue = {};
    queue = enqueue(queue, 'glory', T2, 'on', 2000).queue;
    queue = enqueue(queue, 'glory', T1, 'on', 1000).queue;
    queue = enqueue(queue, 'intercession', P1, 'prayed', 1500).queue;
    expect(replayOrder(queue).map((w) => w.entityId)).toEqual([T1, P1, T2]);
  });
});

describe('the cap', () => {
  test('evicts whole entities, oldest first, and reports them', () => {
    let queue: WriteQueue = {};
    for (let i = 0; i < QUEUE_CAP; i += 1) {
      queue = enqueue(queue, 'glory', `id-${String(i)}`, 'on', 1000 + i).queue;
    }
    const result = enqueue(queue, 'glory', 'newcomer', 'on', 99_999);

    expect(Object.keys(result.queue)).toHaveLength(QUEUE_CAP);
    expect(result.evicted).toHaveLength(1);
    expect(result.evicted[0].entityId).toBe('id-0');
    // Eviction reverts that entity's optimistic UI (`01` §8). Because the UI
    // reads through pendingState, "reverted" IS "no longer in the queue".
    expect(pendingState(result.queue, 'glory', 'id-0')).toBeUndefined();
    expect(pendingState(result.queue, 'glory', 'newcomer')).toBe('on');
  });

  test('re-tapping an entity at the cap evicts nobody', () => {
    let queue: WriteQueue = {};
    for (let i = 0; i < QUEUE_CAP; i += 1) {
      queue = enqueue(queue, 'glory', `id-${String(i)}`, 'on', 1000 + i).queue;
    }
    const result = enqueue(queue, 'glory', 'id-5', 'off', 99_999);
    expect(result.evicted).toEqual([]);
    expect(Object.keys(result.queue)).toHaveLength(QUEUE_CAP);
  });
});

describe('settle and clear', () => {
  test('settling drops just that entity', () => {
    let queue: WriteQueue = {};
    queue = enqueue(queue, 'glory', T1, 'on', 1000).queue;
    queue = enqueue(queue, 'glory', T2, 'on', 1001).queue;
    const next = settle(queue, queueKey('glory', T1));
    expect(pendingState(next, 'glory', T1)).toBeUndefined();
    expect(pendingState(next, 'glory', T2)).toBe('on');
  });

  test('settling something already gone is a no-op, not a crash', () => {
    const queue = enqueue({}, 'glory', T1, 'on', 1000).queue;
    expect(settle(queue, queueKey('glory', 'nobody'))).toBe(queue);
  });

  test('sign-out leaves nothing behind', () => {
    expect(clearQueue()).toEqual({});
  });
});

describe('parseQueue', () => {
  test('a well-formed queue round-trips', () => {
    const queue = enqueue({}, 'glory', T1, 'on', 1000).queue;
    expect(parseQueue(JSON.stringify(queue))).toEqual(queue);
  });

  test('nothing and junk read as an empty queue', () => {
    expect(parseQueue(null)).toEqual({});
    expect(parseQueue('not json')).toEqual({});
    expect(parseQueue('[]')).toEqual({});
    expect(parseQueue('"queue"')).toEqual({});
  });

  test('entries from an older or tampered build are dropped, not hydrated', () => {
    // A kind this build cannot replay, a state that is not in its vocabulary,
    // and a missing id: each would be a wish with nowhere to go.
    const stored = JSON.stringify({
      'rsvp:x': { kind: 'rsvp', entityId: 'x', state: 'going', queuedAt: 1 },
      'glory:y': { kind: 'glory', entityId: 'y', state: 'maybe', queuedAt: 2 },
      'glory:': { kind: 'glory', entityId: '', state: 'on', queuedAt: 3 },
      'glory:z': { kind: 'glory', entityId: 'z', state: 'on', queuedAt: 4 },
    });
    const parsed = parseQueue(stored);
    expect(Object.keys(parsed)).toEqual([queueKey('glory', 'z')]);
  });

  test('an entry is re-keyed from itself, so a mismatched key cannot redirect it', () => {
    const stored = JSON.stringify({
      'glory:victim': {
        kind: 'glory',
        entityId: 'real',
        state: 'on',
        queuedAt: 1,
      },
    });
    const parsed = parseQueue(stored);
    expect(Object.keys(parsed)).toEqual([queueKey('glory', 'real')]);
    expect(pendingState(parsed, 'glory', 'victim')).toBeUndefined();
  });

  test('a missing timestamp sorts first rather than throwing', () => {
    const stored = JSON.stringify({
      'glory:a': { kind: 'glory', entityId: 'a', state: 'on' },
    });
    expect(parseQueue(stored)['glory:a']?.queuedAt).toBe(0);
  });
});
