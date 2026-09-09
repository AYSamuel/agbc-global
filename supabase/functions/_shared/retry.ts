// A retry for the one failure a scheduled job cannot reason about: the API gateway between
// the function and PostgREST answering with nothing useful. On 2026-09-08 it did so 17 times
// between 18:00 and 23:48 UTC, a fast 504 on the first or second call of a run, while
// Postgres, PostgREST and cron were all healthy. Every one of those runs failed, pinged its
// dead-man check's /fail URL, reported to Sentry, and the next tick did the work anyway. So
// the incident cost nothing but a night of alert emails, which is exactly the cost this
// module removes.
//
// This is NOT a retry of the work. `21` §5's rule stands: sends, records and marks are never
// retried in-process, because the next tick derives the same work from live state and a
// duplicate nudge is worse than a late one. What IS retried is a call whose repeat cannot
// change anything: a `stable` batch read, or the lease claim and release, which are keyed
// upserts. Callers hand over a factory rather than a builder, so every attempt is a fresh
// request rather than a re-awaited one.
//
// Transient means the gateway spoke, not PostgREST: 502, 503, 504, or status 0, which is what
// postgrest-js reports when fetch itself threw (connection reset, DNS). A PostgREST answer
// (400, 401, 403, 404, 409, or a 500 carrying a Postgres code) is returned as-is after one
// attempt, because repeating a refused request is how a bug becomes a hot loop.
//
// Budget: two retries, waits of about 1 s and 2 s with jitter. A gateway 504 cost about 5 s
// each time on 2026-09-08, so the worst case is three attempts plus two waits, about 18 s,
// inside the 30 s that `jobs.invoke_edge_function` allows the whole invocation
// (`timeout_milliseconds`, migration 20260819100000). A longer budget would let a retry
// outlive its caller.

/** The two fields every postgrest-js response carries that decide whether to try again. */
export interface RestResult {
  error: unknown;
  status: number;
}

export const TRANSIENT_STATUSES: ReadonlySet<number> = new Set([0, 502, 503, 504]);

/** True when the answer came from the gateway rather than from PostgREST. */
export function isTransient(result: RestResult): boolean {
  return result.error != null && TRANSIENT_STATUSES.has(result.status);
}

export interface RetryOptions {
  /** Names the call in the function log, e.g. `event-notices: due read`. Never carries data. */
  label: string;
  /** One wait per retry, so the length is the retry count. */
  backoffMs?: readonly number[];
  sleep?: (ms: number) => Promise<void>;
  /** A number in [0, 1). Injected so a test is exact and production is spread out. */
  random?: () => number;
  log?: (line: string) => void;
}

export const DEFAULT_BACKOFF_MS: readonly number[] = [1_000, 2_000];

/**
 * Equal jitter: at least half the base, at most the whole of it, so three jobs that hit the
 * same blip at the same second do not all come back at the same second.
 */
export function jitteredDelay(baseMs: number, random: () => number): number {
  const half = baseMs / 2;
  return Math.round(half + random() * half);
}

/**
 * Run `call`, and run it again after a short wait if the gateway answered instead of
 * PostgREST. Returns the LAST answer either way, so a caller's own error handling is
 * unchanged: what it throws, and what it says, are what it threw and said before.
 */
export async function retryTransient<T extends RestResult>(
  call: () => PromiseLike<T>,
  options: RetryOptions,
): Promise<T> {
  const backoff = options.backoffMs ?? DEFAULT_BACKOFF_MS;
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;
  const log = options.log ?? console.warn;

  let result = await call();
  for (let attempt = 0; attempt < backoff.length && isTransient(result); attempt += 1) {
    const wait = jitteredDelay(backoff[attempt] ?? 0, random);
    // The status and the label only. The error's message is the gateway's, and a log line
    // that echoes an upstream body is a log line that will one day echo something it should
    // not (`20`).
    log(
      `${options.label}: ${describe(result.status)} ` +
        `(attempt ${String(attempt + 1)} of ${String(backoff.length + 1)}); ` +
        `retrying in ${String(wait)} ms`,
    );
    await sleep(wait);
    result = await call();
  }
  return result;
}

function describe(status: number): string {
  return status === 0
    ? 'no response from the API gateway'
    : `the API gateway answered ${String(status)}`;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
