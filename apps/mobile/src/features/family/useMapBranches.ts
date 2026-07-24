import { BRANCHES_SNAPSHOT } from '@/features/onboarding/branches-snapshot';
import { useBranchesQuery } from '@/features/onboarding/useBranches';

import type { BranchPoint } from './mapProjection';

/**
 * Branch coordinates for the Family map (docs/spec/09). Same shared branches query
 * the rest of the app uses, falling back to the bundled snapshot so the map still
 * draws its pins on a first-launch-offline open (docs/spec/06). Rows without real
 * coordinates are dropped rather than pinned at 0,0 in the ocean.
 */
export function useMapBranches(): BranchPoint[] {
  const { data } = useBranchesQuery();
  const branches = data ?? BRANCHES_SNAPSHOT;
  return branches
    .filter((b) => b.lat !== 0 || b.lng !== 0)
    .map((b) => ({
      id: b.id,
      slug: b.slug,
      name: b.name,
      lat: b.lat,
      lng: b.lng,
    }));
}
