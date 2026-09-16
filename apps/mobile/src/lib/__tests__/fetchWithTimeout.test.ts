import {
  budget,
  FETCH_TIMEOUT_MS,
  fetchWithTimeout,
} from '../fetchWithTimeout';

// Regression for the 2026-07-20 field bug: an unreachable-but-routed Supabase
// host hung fetch forever, so ONB-2's error fallback (bundled branches) never
// fired and the screen froze on skeletons (docs/spec/04: never a blank freeze).

// RN's types declare fetch as a bare global function, so spying needs an
// explicit receiver shape (node's `global` is not typed here).
const fetchHost = globalThis as unknown as { fetch: typeof fetch };

// A fetch double that honors the abort signal, like the real implementation.
function hangingFetch() {
  return jest.spyOn(fetchHost, 'fetch').mockImplementation(
    (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new Error('Aborted'));
        });
      }),
  );
}

describe('fetchWithTimeout', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test('a hanging request rejects after the timeout instead of hanging forever', async () => {
    hangingFetch();
    const promise = fetchWithTimeout('http://10.0.0.1:55321/rest/v1/branches');
    const assertion = expect(promise).rejects.toThrow('Aborted');
    jest.advanceTimersByTime(FETCH_TIMEOUT_MS + 1);
    await assertion;
  });

  test('a normal response passes through and clears the timer', async () => {
    const response = { ok: true } as Response;
    jest.spyOn(fetchHost, 'fetch').mockResolvedValue(response);
    await expect(fetchWithTimeout('http://example.test')).resolves.toBe(
      response,
    );
    expect(jest.getTimerCount()).toBe(0);
  });

  test("the caller's own abort still cancels before the timeout", async () => {
    hangingFetch();
    const controller = new AbortController();
    const promise = fetchWithTimeout('http://example.test', {
      signal: controller.signal,
    });
    const assertion = expect(promise).rejects.toThrow('Aborted');
    controller.abort();
    await assertion;
  });

  // W4.18 slice 1: one call may bring its own budget. Erasing an account commits
  // twenty tables in one transaction and was being cut off at ten seconds while
  // the server finished the job anyway, so the screen told the member nothing
  // had happened when it had.
  describe('a call that brings its own budget', () => {
    test('a budgeted signal replaces the default timer rather than adding to it', async () => {
      hangingFetch();
      const promise = fetchWithTimeout('http://example.test/rpc/erase', {
        signal: budget(30_000),
      });
      let settled = false;
      const assertion = expect(promise).rejects.toThrow('Aborted');
      void promise.catch(() => {
        settled = true;
      });

      // Past the default budget: still waiting, because the caller said so.
      jest.advanceTimersByTime(FETCH_TIMEOUT_MS + 1);
      await Promise.resolve();
      expect(settled).toBe(false);

      // Past the caller's own budget: now it gives up.
      jest.advanceTimersByTime(30_000 - FETCH_TIMEOUT_MS);
      await assertion;
      expect(settled).toBe(true);
    });

    // THE SAFETY THIS DESIGN HINGES ON. TanStack Query passes a cancellation
    // signal on every fetch. If merely bringing a signal disabled the default
    // timer, every read in the app would lose the protection this file exists
    // for. Only a signal minted by `budget()` is honoured; any other still gets
    // the ten seconds.
    test('an ordinary caller signal still gets the default budget', async () => {
      hangingFetch();
      const controller = new AbortController();
      const promise = fetchWithTimeout('http://example.test/rest/v1/feed', {
        signal: controller.signal,
      });
      const assertion = expect(promise).rejects.toThrow('Aborted');
      jest.advanceTimersByTime(FETCH_TIMEOUT_MS + 1);
      await assertion;
    });

    test('a budgeted request that completes clears its own timer', async () => {
      const response = { ok: true } as Response;
      jest.spyOn(fetchHost, 'fetch').mockResolvedValue(response);
      await expect(
        fetchWithTimeout('http://example.test', { signal: budget(30_000) }),
      ).resolves.toBe(response);
      expect(jest.getTimerCount()).toBe(0);
    });
  });
});
