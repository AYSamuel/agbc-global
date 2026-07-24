import { BRANCHES_SNAPSHOT } from '@/features/onboarding/branches-snapshot';
import { useBranchesQuery } from '@/features/onboarding/useBranches';

/**
 * branch_id -> city, for the "7:00 PM · Berlin" meta line on event rows (same
 * shared-query pattern as family's useBranchNames: four branches is a lookup,
 * not a join, and the snapshot keeps it alive offline).
 */
export function useBranchCities(): Record<string, string> {
  const { data } = useBranchesQuery();
  const branches = data ?? BRANCHES_SNAPSHOT;
  return Object.fromEntries(branches.map((b) => [b.id, b.city]));
}
