// Bounded fetch for the Supabase client (docs/spec/04 offline rule: "never a
// blank freeze"). An unreachable-but-routed host (wrong LAN IP, captive portal)
// hangs RN's fetch indefinitely, so error-keyed fallbacks (ONB-2's bundled
// branches, query retry states) never fire. A timeout turns the hang into a
// normal error. Found live on 2026-07-20 (stale dev IP produced endless
// skeletons); the manual AbortController keeps Hermes compatibility
// (AbortSignal.timeout/any are not guaranteed there).
//
// ONE CALL MAY BRING ITS OWN BUDGET (W4.18 slice 1). Ten seconds is right for a
// read: a feed that has not answered by then should give up and show its retry
// state. It is wrong for the one heaviest write a member can trigger, erasing an
// account, which commits twenty tables in one transaction and was being cut off
// by this timer while the server finished the job anyway. The caller mints a
// signal with `budget(ms)` and hands it to the request; this wrapper recognises
// that signal and steps aside.
//
// Recognised, not merely present. The obvious rule, "a caller that passes a
// signal owns the budget", would strip the ten seconds from every TanStack
// query, because TanStack passes a cancellation signal on every fetch, and that
// protection is the whole reason this file exists. So only a signal minted HERE
// carries a budget; any other caller signal is chained for cancellation exactly
// as before and still gets the default timer.

export const FETCH_TIMEOUT_MS = 10_000;

/** Signals minted by `budget()`, with the timer that will fire them. */
const budgeted = new WeakMap<AbortSignal, ReturnType<typeof setTimeout>>();

/**
 * A signal that aborts after `ms`, which `fetchWithTimeout` honours INSTEAD of
 * its default. One request per signal: the timer is cleared when that request
 * settles, so a second request on the same signal would run unbounded.
 */
export function budget(ms: number): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, ms);
  budgeted.set(controller.signal, timer);
  return controller.signal;
}

export function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const callerSignal = init?.signal;

  // The caller brought a budget: their timer is the only one.
  const ownTimer = callerSignal ? budgeted.get(callerSignal) : undefined;
  if (callerSignal && ownTimer !== undefined) {
    return fetch(input, init).finally(() => {
      clearTimeout(ownTimer);
      budgeted.delete(callerSignal);
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, FETCH_TIMEOUT_MS);

  // Chain the caller's signal so explicit cancellation still works.
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
