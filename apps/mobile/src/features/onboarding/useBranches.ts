import { useQuery, type QueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

import type { BranchSummary } from './branches-snapshot';

// One options object so the launch prefetch and ONB-2's hook share a cache entry.
export const branchesQueryOptions = {
  queryKey: ['branches'] as const,
  queryFn: async (): Promise<BranchSummary[]> => {
    const { data, error } = await supabase
      .from('branches')
      .select(
        'id, slug, name, city, country, is_hq, youtube_channel_id, timezone, address, order',
      )
      .eq('status', 'active')
      .order('order');
    if (error) throw new Error(error.message);
    // address is jsonb (generic Json in the generated types): narrow it here so
    // screens read a typed shape rather than casting at every call site.
    return data.map((row) => ({ ...row, address: narrowAddress(row.address) }));
  },
  staleTime: 5 * 60_000,
};

function narrowAddress(value: unknown): BranchSummary['address'] {
  if (typeof value !== 'object' || value === null) return null;
  const { line1, line2 } = value as Record<string, unknown>;
  return {
    line1: typeof line1 === 'string' ? line1 : undefined,
    line2: typeof line2 === 'string' ? line2 : undefined,
  };
}

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
