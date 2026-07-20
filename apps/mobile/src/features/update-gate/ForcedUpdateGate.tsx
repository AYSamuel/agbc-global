import Constants from 'expo-constants';
import { useEffect, type PropsWithChildren } from 'react';

import { refreshMinimumVersion, useUpdateGateStore } from './store';
import { UpdateRequiredScreen } from './UpdateRequiredScreen';
import { isBelowMinimum } from './version';

// Launch gate (docs/spec/21 §8): compares the running binary's version against
// the cached app_config floor and blocks below it. Renders children immediately
// while the fresh value loads; a below-minimum verdict flips to the blocking
// screen as soon as the cache hydrates or the fetch lands.
export function ForcedUpdateGate({ children }: PropsWithChildren) {
  const minimumVersion = useUpdateGateStore((s) => s.minimumVersion);
  const currentVersion = Constants.expoConfig?.version ?? null;

  useEffect(() => {
    void refreshMinimumVersion();
  }, []);

  if (isBelowMinimum(currentVersion, minimumVersion)) {
    return <UpdateRequiredScreen />;
  }
  return children;
}
