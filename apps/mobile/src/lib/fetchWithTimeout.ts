// Bounded fetch for the Supabase client (docs/spec/04 offline rule: "never a
// blank freeze"). An unreachable-but-routed host (wrong LAN IP, captive portal)
// hangs RN's fetch indefinitely, so error-keyed fallbacks (ONB-2's bundled
// branches, query retry states) never fire. A timeout turns the hang into a
// normal error. Found live on 2026-07-20 (stale dev IP produced endless
// skeletons); the manual AbortController keeps Hermes compatibility
// (AbortSignal.timeout/any are not guaranteed there).

export const FETCH_TIMEOUT_MS = 10_000;

export function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, FETCH_TIMEOUT_MS);

  // Chain the caller's signal so explicit cancellation still works.
  const callerSignal = init?.signal;
  if (callerSignal) {
    if (callerSignal.aborted) {
      controller.abort();
    } else {
      callerSignal.addEventListener(
        'abort',
        () => {
          controller.abort();
        },
        { once: true },
      );
    }
  }

  return fetch(input, { ...init, signal: controller.signal }).finally(() => {
    clearTimeout(timer);
  });
}
