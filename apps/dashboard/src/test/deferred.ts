/**
 * A promise the test decides when to settle.
 *
 * For asserting on PENDING states. A pending state only exists while a submission is in
 * flight, and a stub that returns an already-settled promise is finished before the first
 * assertion can run, so the test would be checking the idle state and passing for the wrong
 * reason. Holding the action open makes the in-flight moment observable, and releasing it
 * afterwards lets the component settle so nothing leaks into the next test.
 *
 * Used by the W4.12 slice 2 pending-label tests.
 */
export interface Deferred {
  /** Hand this to the stubbed action as its return value. */
  promise: Promise<void>;
  /** Call once the pending assertions are done. */
  release: () => void;
}

export function deferred(): Deferred {
  // Assigned synchronously inside the executor, which runs before the constructor returns.
  // The placeholder keeps the type honest without a definite-assignment assertion.
  let settle: () => void = () => undefined;

  const promise = new Promise<void>((resolve) => {
    settle = () => {
      resolve();
    };
  });

  return {
    promise,
    release: () => {
      settle();
    },
  };
}
