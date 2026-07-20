import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { localDateKey } from './queries';

// Midnight rollover (docs/spec/07): date-anchored Home reads key on the
// DEVICE-LOCAL date and invalidate at local midnight while foregrounded AND on
// every foreground transition (a backgrounded app gets no timers, so the
// transition check is what actually catches most rollovers).
export function useLocalDate(): string {
  const [dateKey, setDateKey] = useState(() => localDateKey(new Date()));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const scheduleMidnight = () => {
      if (timer) clearTimeout(timer);
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0);
      // +1s of slack so the timer never fires a hair before the date flips.
      timer = setTimeout(
        () => {
          setDateKey(localDateKey(new Date()));
          scheduleMidnight();
        },
        midnight.getTime() - now.getTime() + 1_000,
      );
    };

    scheduleMidnight();

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setDateKey(localDateKey(new Date()));
        scheduleMidnight();
      }
    });

    return () => {
      if (timer) clearTimeout(timer);
      subscription.remove();
    };
  }, []);

  return dateKey;
}
