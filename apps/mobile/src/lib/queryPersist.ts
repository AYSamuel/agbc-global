import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient } from '@tanstack/react-query';
import type { PersistQueryClientProviderProps } from '@tanstack/react-query-persist-client';

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
const PERSIST_BUSTER = 'v1';

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
