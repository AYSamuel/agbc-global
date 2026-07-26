// Per-instance request limiting, shared by the client-called functions
// (contact-form since W1.7, review-signin since W2.1).

export interface RateLimiterOptions {
  limit: number;
  windowMs: number;
  /** Injectable clock so tests never sleep (qa standard). */
  now?: () => number;
}

/**
 * Per-key sliding window. In-memory, so it bounds a single warm instance and
 * resets on cold start: a speed bump against casual flooding, not a quota
 * system. Real abuse pressure is also capped by the platform limits behind
 * each caller (Resend send limits, Supabase auth rate limits).
 */
export function createRateLimiter({
  limit,
  windowMs,
  now = Date.now,
}: RateLimiterOptions): (key: string) => boolean {
  const hits = new Map<string, number[]>();
  return (key: string): boolean => {
    const cutoff = now() - windowMs;
    const recent = (hits.get(key) ?? []).filter((at) => at > cutoff);
    if (recent.length >= limit) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now());
    hits.set(key, recent);
    return true;
  };
}

/** First address in x-forwarded-for, or a shared bucket when absent. */
export function clientKey(forwardedFor: string | null): string {
  const first = forwardedFor?.split(',')[0]?.trim();
  return first && first !== '' ? first : 'unknown';
}
