import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/state/auth';

/**
 * The member's own side of a branch change (ADR 0015, docs/spec/16).
 *
 * Read through their OWN client, like everything else in this app. The policies that
 * matter are `022`'s: a member selects and inserts their own requests and may update one
 * only to `cancelled`. There is deliberately no read path here to who decided or why,
 * because those columns do not exist on the row: they live in `privileged_actions`, which
 * a member cannot read at all (decision 3).
 *
 * WHAT IS NOT HERE, and why: the destination branch's name. `branches` is anon-readable
 * (`02`), so the screens join it from the branch list they already hold rather than this
 * module fetching it again. One list, one owner.
 */

export interface MyBranchRequest {
  id: string;
  toBranchId: string;
  fromBranchId: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  createdAt: string;
  decidedAt: string | null;
}

export interface BranchChangeState {
  /** The open request, if there is one. At most one exists: `022`'s partial unique index. */
  pending: MyBranchRequest | null;
  /** The most recent completed move, which is what the cooldown is measured from. */
  lastApproved: MyBranchRequest | null;
  /** The most recent refusal, for the one-time "not approved" sheet. */
  lastRejected: MyBranchRequest | null;
}

export const myBranchRequestsKey = ['branch-change', 'mine'] as const;

/**
 * Every request this member has made, newest first.
 *
 * The whole history rather than just the open one, because two other screens are derived
 * from it: the cooldown (measured from the last APPROVED move, not the last decision, so a
 * leader's mistake stays fixable the same day) and the one-time refusal sheet. Asking for
 * all of them is one round trip against a table that holds a handful of rows per member.
 */
export function myBranchRequestsQueryOptions(member: string | null) {
  return {
    // Keyed by the signed-in member, so signing out and in as somebody else on a shared
    // phone cannot show the first person's request: nothing clears the query cache on
    // SIGNED_OUT today, and a static key would survive that transition.
    queryKey: [...myBranchRequestsKey, member ?? 'none'] as const,
    enabled: member !== null,
    queryFn: async (): Promise<BranchChangeState> => {
      const { data, error } = await supabase
        .from('branch_change_requests')
        .select(
          'id, to_branch_id, from_branch_id, status, created_at, decided_at',
        )
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);

      const rows: MyBranchRequest[] = data.map((row) => ({
        id: row.id,
        toBranchId: row.to_branch_id,
        fromBranchId: row.from_branch_id,
        status: row.status,
        createdAt: row.created_at,
        decidedAt: row.decided_at,
      }));

      return {
        pending: rows.find((row) => row.status === 'pending') ?? null,
        lastApproved: rows.find((row) => row.status === 'approved') ?? null,
        lastRejected: rows.find((row) => row.status === 'rejected') ?? null,
      };
    },
    staleTime: 60_000,
    // NOT `PERSIST_META`, deliberately. `lib/queryMeta.ts` says what that flag is for in
    // as many words: everything carrying it is PUBLIC read data, and member reads must not
    // set it, so nothing personal lands in unencrypted storage. Which branch somebody is
    // asking to leave is exactly that. The cost is a network read when Profile opens
    // cold; the screen has a loading state and an offline one for it.
  };
}

export function useMyBranchRequests() {
  const member = useAuthStore((state) => state.email);
  return useQuery(myBranchRequestsQueryOptions(member));
}
