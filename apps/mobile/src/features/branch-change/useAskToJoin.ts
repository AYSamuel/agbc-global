import { useMutation, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/state/auth';

import { myBranchRequestsKey } from './queries';

/**
 * Asking to join a branch, and taking it back (ADR 0015, docs/spec/16).
 *
 * Both writes send the minimum the database will accept and let its guard fill the rest.
 * `profile_id` and `from_branch_id` are forced from the caller's own profile, so this
 * cannot ask on somebody else's behalf or claim to be leaving a branch it was never in,
 * and the client does not get to think about either.
 *
 * ONLINE ONLY, deliberately. The offline write queue (`lib/writeQueue`) exists for
 * testimonies and prayers, where a member composes something they would hate to lose. A
 * branch request is one tap that can be repeated in a second, and queueing it would mean a
 * request landing minutes later against a branch list that may have changed, with the
 * 48-hour clock starting at a moment nobody chose. The sheets say plainly when it did not
 * send.
 */
export function useAskToJoin() {
  const queryClient = useQueryClient();
  const fromBranchId = useAuthStore((state) => state.profile?.branchId);

  return useMutation({
    mutationFn: async (toBranchId: string): Promise<void> => {
      const { data: session } = await supabase.auth.getUser();
      const userId = session.user?.id;
      if (!userId || !fromBranchId) {
        throw new Error('asking to join without a member session');
      }

      // Both server-owned columns are `not null` with no default, so the generated types
      // require them. They are sent as the caller's own current values rather than as
      // placeholders, so this code says what it means; the guard then overwrites both from
      // the profile row and `022` is where that forcing is proven.
      const { error } = await supabase.from('branch_change_requests').insert({
        profile_id: userId,
        from_branch_id: fromBranchId,
        to_branch_id: toBranchId,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: myBranchRequestsKey });
    },
  });
}

/**
 * Cancelling an open request.
 *
 * `022`'s member UPDATE policy allows exactly one transition, pending to cancelled, with
 * the target state pinned in its WITH CHECK. So this cannot become a way to approve
 * yourself, and it does not need to guard against that here.
 */
export function useCancelRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (requestId: string): Promise<void> => {
      const { error } = await supabase
        .from('branch_change_requests')
        .update({ status: 'cancelled' })
        .eq('id', requestId);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: myBranchRequestsKey });
    },
  });
}
