import { useQuery, type QueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

import type { BranchSummary } from './branches-snapshot';

// One options object so the launch prefetch and ONB-2's hook share a cache entry.
export const branchesQueryOptions = {
  queryKey: ['branches'] as const,
  queryFn: async (): Promise<BranchSummary[]> => {
    const { data, error } = await supabase
      .from('branches')
      .select('id, slug, name, city, country, is_hq, order')
      .eq('status', 'active')
      .order('order');
    if (error) throw new Error(error.message);
    return data;
  },
  staleTime: 5 * 60_000,
};

export function useBranchesQuery() {
  return useQuery(branchesQueryOptions);
}

// Warms the cache at app start (root layout) so ONB-2 renders instantly by the
// time a first-launcher taps through the welcome screen (2026-07-20: the cold
// on-mount fetch left seconds of skeleton). A failed prefetch is fine: the
// screen's own fetch and the bundled snapshot fallback still apply. The same
// cache feeds BRANCH-SWITCH and BRANCHES later (W1.4/W1.7).
export function prefetchBranches(queryClient: QueryClient): Promise<void> {
  return queryClient.prefetchQuery(branchesQueryOptions);
}
