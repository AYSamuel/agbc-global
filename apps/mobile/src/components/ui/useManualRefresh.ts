import { useState } from 'react';

/**
 * Drives `Screen`'s pull-to-refresh indicator from a refresh the MEMBER asked
 * for, and from nothing else.
 *
 * The obvious wiring, `refreshing={query.isRefetching}`, is subtly wrong: that
 * flag is true for every refetch, including the ones the app starts on its own
 * (a landed write invalidating its caches, a focus refresh, realtime). The
 * spinner then appears at the top of the screen unbidden and reads as the page
 * reloading under you, which is exactly how it was reported on device after
 * W2.4 made Glory taps refresh the feed (2026-07-27).
 *
 * A refresh indicator is feedback for a gesture. If nobody pulled, nothing spins.
 */
export function useManualRefresh(refetch: () => Promise<unknown>): {
  refreshing: boolean;
  onRefresh: () => void;
} {
  const [refreshing, setRefreshing] = useState(false);

  return {
    refreshing,
    onRefresh: () => {
      setRefreshing(true);
      void refetch()
        // Caught, not just `finally`d: `finally` re-throws, so a refetch that
        // rejects would end the spinner AND leave an unhandled rejection
        // behind. The screen's own error state is what reports the failure to
        // the member; here the gesture simply ends.
        .catch(() => undefined)
        .finally(() => {
          setRefreshing(false);
        });
    },
  };
}
