import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/state/auth';
import { useBranchStore } from '@/state/branch';

/**
 * "Your branch has closed" (docs/spec/02 §branches, `17` §5; W3.5 slice 5c).
 *
 * A member whose home branch is archived is asked, on next launch, to pick a new one. This
 * is THE ONE branch change that needs nobody's approval and ignores the 90-day settle (ADR
 * 0015): there is no branch left to stay in and no leader to ask, so it is a server-owned
 * assignment rather than a request, and `rehome_from_archived_branch()` is the only door.
 *
 * THE PRECONDITION IS THE SERVER'S, not this screen's. The function reads the caller's own
 * branch status from the live table and refuses `42501` if it is open, which is what stops
 * this becoming a way around the approval flow and the cooldown. Everything here is about
 * what the member is SHOWN.
 */

export interface HomeBranch {
  id: string;
  name: string;
  status: 'active' | 'archived';
}

export function branchStatusKey(branchId: string | null) {
  return ['branch-status', branchId ?? 'none'] as const;
}

/**
 * One branch row by id, status included.
 *
 * A read of its own rather than a reuse of `useBranchesQuery`, and the difference is the
 * whole point: that query filters `status = 'active'`, which is exactly why every picker and
 * the map stop showing a closed branch. A closed branch would simply be ABSENT from it, and
 * "absent" is also what a failed fetch and an empty cache look like. So this asks for the row
 * by id, with no status filter, and the answer is unambiguous.
 *
 * Two callers share it, which is why it takes an id rather than reading the member's own:
 * the launch prompt asks about the member's HOME branch, and Home's hero asks about the
 * branch being BROWSED. They are usually the same row and always the same question.
 *
 * NOT persisted to disk: it is keyed to a member (`lib/queryMeta.ts` reserves persistence
 * for public data). A stale "archived" would be an unnecessary prompt; a stale "active"
 * would only delay one until the next launch.
 */
export function branchStatusQueryOptions(branchId: string | null) {
  return {
    queryKey: branchStatusKey(branchId),
    enabled: branchId !== null,
    queryFn: async (): Promise<HomeBranch | null> => {
      if (branchId === null) return null;
      const { data, error } = await supabase
        .from('branches')
        .select('id, name, status')
        .eq('id', branchId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
    staleTime: 5 * 60_000,
  };
}

export function useBranchStatusQuery(branchId: string | null) {
  return useQuery(branchStatusQueryOptions(branchId));
}

/**
 * Has the branch being BROWSED closed?
 *
 * Home follows the browsed branch for everything (`app/(tabs)/home.tsx`), including where a
 * check-in counts, so this is the question it has to ask before drawing any of it, rather
 * than "did MY branch close". They are usually the same row. When they are not, the
 * viewer is a guest or someone browsing elsewhere, and Home moves them to HQ instead: the
 * card that explains a missing service card belongs to the one member whose home this was.
 *
 * FALSE while the read is in flight or failed, for the same reason as below.
 */
export function useBranchClosed(branchId: string | null): {
  closed: boolean;
  branch: HomeBranch | null;
} {
  const query = useBranchStatusQuery(branchId);
  const branch = query.data ?? null;
  return { closed: branch?.status === 'archived', branch };
}

/**
 * Has this member's home branch closed under them?
 *
 * FALSE while the read is in flight or failed, deliberately. The prompt interrupts somebody
 * on launch, and interrupting on a guess is worse than asking one launch later: a network
 * blip must not tell a member their church has closed.
 */
export function useBranchHasClosed(): {
  closed: boolean;
  branch: HomeBranch | null;
} {
  const status = useAuthStore((state) => state.status);
  const branchId = useAuthStore((state) => state.profile?.branchId ?? null);
  const { closed, branch } = useBranchClosed(branchId);

  return { closed: status === 'member' && closed, branch };
}

/**
 * Choose a new home branch.
 *
 * THE BROWSE BRANCH FOLLOWS THE MOVE, and that is not a nicety. Home draws its chip, its
 * next service and its zone from `useBranchStore`, a persisted local snapshot that has no
 * idea a branch closed; leaving it pointing at the closed one would mean a member who has
 * just re-homed still reading a closed branch's service time on the very next screen.
 * `07`'s browse context is the member's to change afterwards, and this only moves it
 * because it is currently aimed at somewhere that no longer meets.
 *
 * The auth store's profile snapshot is refreshed too: it is what `useBranchHasClosed` reads,
 * so without this the prompt would fire again on the next launch.
 */
export function useRehome() {
  const queryClient = useQueryClient();
  const setBranch = useBranchStore((state) => state.setBranch);
  const syncFromSession = useAuthStore((state) => state.syncFromSession);

  return useMutation({
    mutationFn: async (destination: {
      id: string;
      slug: string;
      name: string;
      timezone: string;
    }): Promise<void> => {
      const { error } = await supabase.rpc('rehome_from_archived_branch', {
        destination: destination.id,
      });
      if (error) throw error;
      setBranch(destination);
    },
    onSuccess: async () => {
      // The store's profile snapshot still says the old branch, and it is what
      // `useBranchHasClosed` reads: without this the prompt fires again next launch.
      // `syncFromSession` is the store's own re-read and is safe to call repeatedly.
      await syncFromSession();
      await queryClient.invalidateQueries({ queryKey: ['branch-status'] });
      await queryClient.invalidateQueries({ queryKey: ['branch-services'] });
    },
  });
}
