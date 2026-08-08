import { useWriteQueueStore } from '..';
import type { QueuedWrite, ReplayOutcome, WriteHandlers } from '../types';

// The replay driver: the imperative shell around the reducer. What is under test
// is how it treats a handler's three answers (docs/spec/01 §8), because each one
// is a different promise to the member.

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return --
   documented jest.mock factory shape */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return */

const T1 = 'a1111111-1111-4111-8111-111111111111';
const T2 = 'b2222222-2222-4222-8222-222222222222';

const sent: QueuedWrite[] = [];

/** Handlers whose answer is scripted per entity, recording what they were sent. */
function handlers(script: Record<string, ReplayOutcome>): WriteHandlers {
  const handle = (write: QueuedWrite): Promise<ReplayOutcome> => {
    sent.push(write);
    return Promise.resolve(script[write.entityId] ?? 'done');
  };
  return { glory: handle, intercession: handle, attendance: handle };
}

beforeEach(() => {
  sent.length = 0;
  useWriteQueueStore.setState({
    queue: {},
    hydrated: true,
    handlers: null,
    draining: false,
    failures: 0,
  });
});

// Pushes happen BEFORE the handlers are wired in most tests below: `push`
// triggers a drain of its own, and a drain that starts on its own schedule would
// race every assertion here. With no handlers the auto-drain is a no-op, so each
// test drives exactly one pass and owns its timing.

test('an accepted write leaves the queue', async () => {
  useWriteQueueStore.getState().push('glory', T1, 'on');
  useWriteQueueStore.getState().setHandlers(handlers({}));
  await useWriteQueueStore.getState().drain();

  expect(sent).toHaveLength(1);
  expect(useWriteQueueStore.getState().queue).toEqual({});
});

test('a refused write also leaves, and reconciles by simply disappearing', async () => {
  // The post was removed, or the prayer was answered. Server state wins and the
  // card falls back to it with no toast: `01` §8 asks for a quiet reconcile, and
  // because every card reads through the queue, "quiet" is automatic.
  useWriteQueueStore.getState().push('glory', T1, 'on');
  useWriteQueueStore.getState().setHandlers(handlers({ [T1]: 'refused' }));
  await useWriteQueueStore.getState().drain();

  expect(useWriteQueueStore.getState().queue).toEqual({});
});

test('a transport failure keeps the wish and counts a failure for the backoff', async () => {
  useWriteQueueStore.getState().push('glory', T1, 'on');
  useWriteQueueStore.getState().setHandlers(handlers({ [T1]: 'retry' }));
  await useWriteQueueStore.getState().drain();

  expect(Object.keys(useWriteQueueStore.getState().queue)).toHaveLength(1);
  expect(useWriteQueueStore.getState().failures).toBe(1);
});

test('one stuck entity does not hold up the rest', async () => {
  useWriteQueueStore.getState().push('glory', T1, 'on');
  useWriteQueueStore.getState().push('glory', T2, 'on');
  useWriteQueueStore.getState().setHandlers(handlers({ [T1]: 'retry' }));
  await useWriteQueueStore.getState().drain();

  expect(sent.map((w) => w.entityId)).toEqual([T1, T2]);
  expect(Object.keys(useWriteQueueStore.getState().queue)).toHaveLength(1);
});

test('a handler that throws is treated as transport, not as an answer', async () => {
  // A bug in a handler must not silently discard what the member asked for.
  const boom = (): Promise<ReplayOutcome> => {
    throw new Error('handler bug');
  };
  useWriteQueueStore.getState().push('glory', T1, 'on');
  useWriteQueueStore
    .getState()
    .setHandlers({ glory: boom, intercession: boom, attendance: boom });
  await useWriteQueueStore.getState().drain();

  expect(Object.keys(useWriteQueueStore.getState().queue)).toHaveLength(1);
});

test('a tap during the drain wins: the newer wish is what goes out', async () => {
  // Assigned synchronously by the Promise executor; typed as definite so the
  // narrowing from `null` does not make the call below look impossible.
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const handle = async (write: QueuedWrite): Promise<ReplayOutcome> => {
    sent.push(write);
    await gate;
    return 'done';
  };
  useWriteQueueStore.getState().push('glory', T1, 'on');
  useWriteQueueStore.getState().push('glory', T2, 'on');
  useWriteQueueStore
    .getState()
    .setHandlers({ glory: handle, intercession: handle, attendance: handle });

  const draining = useWriteQueueStore.getState().drain();
  await Promise.resolve();
  // While T1 is in flight the member changes their mind about T2.
  useWriteQueueStore.getState().push('glory', T2, 'off');
  release();
  await draining;

  expect(sent.filter((w) => w.entityId === T2)).toEqual([
    expect.objectContaining({ state: 'off' }),
  ]);
});

test('drains do not overlap', async () => {
  let inFlight = 0;
  let overlapped = false;
  const handle = async (): Promise<ReplayOutcome> => {
    inFlight += 1;
    if (inFlight > 1) overlapped = true;
    await Promise.resolve();
    inFlight -= 1;
    return 'done';
  };
  useWriteQueueStore.getState().push('glory', T1, 'on');
  useWriteQueueStore.getState().push('glory', T2, 'on');
  useWriteQueueStore
    .getState()
    .setHandlers({ glory: handle, intercession: handle, attendance: handle });

  await Promise.all([
    useWriteQueueStore.getState().drain(),
    useWriteQueueStore.getState().drain(),
  ]);
  expect(overlapped).toBe(false);
});

test('nothing is sent before the composition root has wired the handlers', async () => {
  useWriteQueueStore.getState().push('glory', T1, 'on');
  await useWriteQueueStore.getState().drain();
  expect(sent).toHaveLength(0);
  // And the wish is still there, waiting for handlers rather than lost.
  expect(Object.keys(useWriteQueueStore.getState().queue)).toHaveLength(1);
});

test('sign-out empties the queue', async () => {
  useWriteQueueStore.getState().push('glory', T1, 'on');
  useWriteQueueStore.getState().setHandlers(handlers({ [T1]: 'retry' }));
  await useWriteQueueStore.getState().reset();
  expect(useWriteQueueStore.getState().queue).toEqual({});
});
