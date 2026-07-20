import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

import type { BranchSummary } from './branches-snapshot';

export function useBranchesQuery() {
  return useQuery<BranchSummary[]>({
    queryKey: ['branches'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('branches')
        .select('id, slug, name, city, country, is_hq, order')
        .eq('status', 'active')
        .order('order');
      if (error) throw new Error(error.message);
      return data;
    },
    staleTime: 5 * 60_000,
  });
}
