import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { focusManager, QueryClient } from '@tanstack/react-query';
import type { PersistQueryClientProviderProps } from '@tanstack/react-query-persist-client';
import { AppState, type AppStateStatus } from 'react-native';

import { shouldPersistQuery } from './queryMeta';

// One data layer for the whole app (frontend standard): stale-while-revalidate by
// default; per-feature options tune from here.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
    },
  },
});

/**
 * Coming back to the app counts as focus.
 *
 * React Query refetches stale data when a window regains focus, and on the web that is
 * automatic. In React Native there is no window, so the setup step is this one: hand it
 * AppState. Without it, `refetchOnWindowFocus` is dead code and nothing ever refetches
 * except on mount, on an explicit pull-to-refresh, or on an interval nothing sets.
 *
 * Found on device 2026-08-01, in the place it hurts most: a leader approved a branch
 * request on the dashboard, the member returned to the app, and the arrival welcome did
 * not appear until the app was force-restarted. Every query in the app was affected; that
 * one was simply the first where the change came from OUTSIDE the phone and somebody was
 * waiting for it.
 *
 * The cost is bounded by `staleTime`: a foreground within 60 seconds of the last read
 * refetches nothing at all.
 */
AppState.addEventListener('change', (status: AppStateStatus) => {
  focusManager.setFocused(status === 'active');
});

// Offline persistence (docs/spec/04 "offline: cached view or retry"; W1.6 GIVE-BANK
// "fully offline-capable from cached giving_config"). The query cache is mirrored to
// AsyncStorage so a COLD launch with no network paints the last-seen public data
// instead of a retry card. Opt-in by design (see queryMeta.shouldPersistQuery): only
// queries flagged PERSIST_META are written, so member/PII reads added in Phase 2
// never touch unencrypted storage unless a query deliberately opts in.
const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'agbc-query-cache',
});

// Bump when a persisted query's shape changes so a cache written by older code is
// discarded rather than hydrated into a shape it no longer matches.
//
// v2 (W2.4): testimony rows gained `reacted_by_me`. A cache written before that
// hydrates rows with the field simply absent, so a card cannot tell whether this
// member has reacted until a refetch replaces it.
const PERSIST_BUSTER = 'v2';

// A week: long enough to serve a returning-offline guest, short enough that a dead
// cache can't keep serving genuinely stale public content (a moved service time).
const MAX_AGE_MS = 7 * 24 * 60 * 60_000;

export const persistOptions: PersistQueryClientProviderProps['persistOptions'] =
  {
    persister,
    maxAge: MAX_AGE_MS,
    buster: PERSIST_BUSTER,
    dehydrateOptions: {
      shouldDehydrateQuery: shouldPersistQuery,
    },
  };
