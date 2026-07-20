import type { SermonSummary } from './queries';

// The client-side stale-live bound (docs/spec/08): is_live counts ONLY when the
// detection job confirmed it within the last 15 minutes; a dead job can never
// advertise a live service into dead air. Pure and unit-tested.

export const STALE_LIVE_MINUTES = 15;

export function resolveLiveSermon(
  sermons: SermonSummary[],
  now: Date,
): SermonSummary | null {
  const staleBefore = now.getTime() - STALE_LIVE_MINUTES * 60_000;
  return (
    sermons.find(
      (s) =>
        s.is_live &&
        s.live_checked_at !== null &&
        new Date(s.live_checked_at).getTime() >= staleBefore,
    ) ?? null
  );
}
