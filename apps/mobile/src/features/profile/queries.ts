import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/state/auth';

/**
 * The member's own profile row, for the Profile screen (docs/spec/16).
 *
 * The auth store already holds a snapshot (name, branch, language, role) and it stays what
 * it is: a routing mirror, persisted so a returning member reaches Home without a network
 * read. This query is for the one thing that snapshot deliberately does not carry, the date
 * they joined, which only the Profile screen shows.
 *
 * NOT persisted to disk, like every member read: `lib/queryMeta.ts` reserves that flag for
 * public data so nothing personal lands in unencrypted storage.
 */

export interface MyProfile {
  /**
   * Null once the account has been erased (W4.5): the erasure strips the name and keeps the
   * row, because the audit trail still points at its id. Reachable in the app because the WEB
   * deletion path can erase an account while this device still holds a session, so this read
   * can land in the window before the next refresh fails. W4.5 slice 3 turns that into `03`'s
   * "This account no longer exists" transition; until then it renders as an empty name rather
   * than crashing the screen, which is the safer of the two ways to be wrong.
   */
  displayName: string | null;
  branchId: string;
  /** ISO timestamp of the profile row's creation: the "Member since" line. */
  joinedAt: string;
}

export function myProfileQueryOptions(member: string | null) {
  return {
    // Keyed by the signed-in member for the same reason as the branch requests: nothing
    // clears the query cache on sign-out, so a static key could outlive the session.
    queryKey: ['profile', 'mine', member ?? 'none'] as const,
    enabled: member !== null,
    queryFn: async (): Promise<MyProfile> => {
      const { data: session } = await supabase.auth.getUser();
      const userId = session.user?.id;
      if (!userId) throw new Error('no session');

      // RLS ("members read their own profile") scopes this even with the id supplied.
      const { data, error } = await supabase
        .from('profiles')
        .select('display_name, branch_id, created_at')
        .eq('id', userId)
        .single();
      if (error) throw new Error(error.message);

      return {
        displayName: data.display_name,
        branchId: data.branch_id,
        joinedAt: data.created_at,
      };
    },
    staleTime: 5 * 60_000,
  };
}

export function useMyProfile() {
  const member = useAuthStore((state) => state.email);
  return useQuery(myProfileQueryOptions(member));
}
