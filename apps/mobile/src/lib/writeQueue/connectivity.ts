// "Replay on reconnect" needs something to notice the reconnect, and this app
// has no connectivity library (decided with Ayo 2026-07-27, option C).
//
// The queue's correctness therefore rests on triggers that need NOTHING native:
// the app coming to the foreground, a bounded retry timer while anything is
// waiting, and an attempt the moment a write is enqueued. On top of that,
// @react-native-community/netinfo is used WHEN PRESENT to make the reconnect
// immediate, behind the same guarded require as the photo picker and the
// clipboard (features/family/photo.ts, features/give/CopyRow.tsx), so a dev
// client built before it was linked keeps working on the triggers alone.
//
// The distinction that matters: netinfo makes the queue FASTER, never correct.
// Nothing below is allowed to become a precondition for a write going out.

interface NetInfoState {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
}

interface NetInfoModule {
  addEventListener: (listener: (state: NetInfoState) => void) => () => void;
}

function loadNetInfo(): NetInfoModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@react-native-community/netinfo') as NetInfoModule;
  } catch {
    return null;
  }
}

const NetInfo = loadNetInfo();

/** True when this build can be told about reconnects instead of guessing. */
export const reconnectDetectionAvailable = NetInfo !== null;

/**
 * Calls back on each transition from "not connected" to "connected". Returns an
 * unsubscribe, and a no-op unsubscribe when the module is absent.
 *
 * Only the transition fires: netinfo emits on every change, and replaying on
 * "still connected" would turn a flapping signal into a write storm.
 */
export function onReconnect(listener: () => void): () => void {
  if (NetInfo === null) return () => undefined;
  // Starts null (unknown) rather than false, so an app that launches online does
  // not treat the first event as a reconnect and replay twice.
  let wasConnected: boolean | null = null;
  return NetInfo.addEventListener((state) => {
    // `isInternetReachable` is null while the probe is in flight; a connected
    // interface is the honest answer until it resolves.
    const connected =
      state.isConnected === true && state.isInternetReachable !== false;
    if (connected && wasConnected === false) listener();
    wasConnected = connected;
  });
}
