import { BRANCHES_SNAPSHOT } from '@/features/onboarding/branches-snapshot';
import { useBranchesQuery } from '@/features/onboarding/useBranches';

/**
 * branch_id -> display name, for the "AGBC Glasgow · 2h" meta line on every card.
 *
 * Reuses the shared branches query rather than joining the branch name into the
 * feed views: four branches is a lookup, not a join, and the cache is already
 * warm from the launch prefetch. Falls back to the bundled snapshot so the meta
 * line survives an offline cold start (docs/spec/06), where an unnamed branch
 * would otherwise leave cards reading as a bare timestamp.
 */
export function useBranchNames(): Record<string, string> {
  const { data } = useBranchesQuery();
  const branches = data ?? BRANCHES_SNAPSHOT;
  return Object.fromEntries(branches.map((b) => [b.id, b.name]));
}
