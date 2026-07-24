import { branchAvatarPalette, palette } from '@agbc/shared/theme';

import { BRANCHES_SNAPSHOT } from '@/features/onboarding/branches-snapshot';
import { useBranchesQuery } from '@/features/onboarding/useBranches';

import { branchColorAt } from './mapProjection';

/**
 * branch_id -> avatar gradient top colour. Each branch gets its own hue, in the
 * SAME order the Family map assigns its pins, so a member's avatar signals their
 * branch wherever it appears (feed, testimony detail, map sheet). Returns a
 * lookup that falls back to the deep gold for an unknown branch, mirroring
 * useBranchNames' resilience to an offline cold start (docs/spec/06).
 */
export function useBranchColors(): (branchId: string) => string {
  const { data } = useBranchesQuery();
  const branches = data ?? BRANCHES_SNAPSHOT;
  // A Map so .get returns `string | undefined` honestly and the fallback below
  // is a real branch, not lint-flagged dead code (a Record types it present).
  const colorByBranch = new Map<string, string>();
  branches.forEach((b, i) => {
    colorByBranch.set(b.id, branchColorAt(i, branchAvatarPalette));
  });
  return (branchId) => colorByBranch.get(branchId) ?? palette.goldDeep;
}
