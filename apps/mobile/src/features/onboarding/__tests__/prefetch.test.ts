import { QueryClient } from '@tanstack/react-query';

import type { BranchSummary } from '../branches-snapshot';
import { branchesQueryOptions, prefetchBranches } from '../useBranches';

// The launch prefetch (root layout) warms the same cache entry ONB-2 reads, so
// the picker renders instantly after the welcome screen (2026-07-20 field find).

jest.mock('@/lib/supabase', () => {
  const rows = [
    {
      id: '9a0dcf5a-0000-0000-0000-000000000001',
      slug: 'glasgow',
      name: 'AGBC Glasgow',
      city: 'Glasgow',
      country: 'United Kingdom',
      is_hq: true,
      order: 1,
    },
  ];
  return {
    supabase: {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => Promise.resolve({ data: rows, error: null }),
          }),
        }),
      }),
    },
  };
});

test('prefetchBranches seeds the cache entry ONB-2 reads', async () => {
  const queryClient = new QueryClient();
  await prefetchBranches(queryClient);
  const cached = queryClient.getQueryData<BranchSummary[]>(
    branchesQueryOptions.queryKey,
  );
  expect(cached).toHaveLength(1);
  expect(cached?.[0].slug).toBe('glasgow');
  queryClient.clear();
});
