import { useQuery, type QueryClient } from '@tanstack/react-query';

import { latestTestimonyQueryOptions } from '@/features/family/queries';
import { supabase } from '@/lib/supabase';

import type { ServiceRow } from './nextService';

// Home reads (docs/spec/07). Both are launch-warmed per the prefetch inventory
// (docs/spec/01 §9): Home is one tap from a cold start, and both must survive
// offline from cache.

/** Device-LOCAL date (docs/spec/07 rollover), not UTC. */
export function localDateKey(now: Date): string {
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export interface DailyVerse {
  date: string;
  reference: string;
  text: string;
  translation: string;
}

export function dailyVerseQueryOptions(dateKey: string, language: string) {
  return {
    queryKey: ['daily-verse', dateKey, language] as const,
    queryFn: async (): Promise<DailyVerse | null> => {
      const { data, error } = await supabase
        .from('daily_verses')
        .select('date, reference, text, translation')
        .eq('language', language)
        .lte('date', dateKey)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      // lte + newest-first means a missing day falls back to the most recent
      // verse rather than blanking the card (docs/spec/07 edge case).
      return data;
    },
    staleTime: 60 * 60_000,
  };
}

export function useDailyVerseQuery(dateKey: string, language: string) {
  return useQuery(dailyVerseQueryOptions(dateKey, language));
}

export function branchServicesQueryOptions(branchId: string | null) {
  return {
    queryKey: ['branch-services', branchId] as const,
    queryFn: async (): Promise<ServiceRow[]> => {
      if (branchId === null) return [];
      const { data, error } = await supabase
        .from('branch_services')
        .select('weekday, start_time, duration_min, kind, label')
        .eq('branch_id', branchId)
        .order('weekday');
      if (error) throw new Error(error.message);
      return data;
    },
    staleTime: 30 * 60_000,
  };
}

export function useBranchServicesQuery(branchId: string | null) {
  return useQuery(branchServicesQueryOptions(branchId));
}

/** Launch warm-up for Home's date-anchored reads (docs/spec/01 §9). */
export async function prefetchHome(
  queryClient: QueryClient,
  branchId: string | null,
  language: string,
): Promise<void> {
  const dateKey = localDateKey(new Date());
  await Promise.all([
    queryClient.prefetchQuery(dailyVerseQueryOptions(dateKey, language)),
    queryClient.prefetchQuery(branchServicesQueryOptions(branchId)),
    queryClient.prefetchQuery(latestTestimonyQueryOptions()),
  ]);
}
