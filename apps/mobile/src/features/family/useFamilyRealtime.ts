import { useQueryClient } from '@tanstack/react-query';
import { useIsFocused } from 'expo-router';
import { useEffect } from 'react';

import { supabase } from '@/lib/supabase';

// Live Family feeds (docs/spec/02 Realtime, docs/spec/09).
//
// The contract is realtime-first, polling-bounded: the database broadcasts on
// private `family:*` channels, and a 60s refetch is the WORST CASE if the socket
// is gone. That bound matters for more than freshness. When a member withdraws a
// testimony or a leader removes one, the row leaves public visibility and the
// database broadcasts {action:'removed'}; withdrawn Art. 9 content must not sit on
// someone else's screen until they happen to pull to refresh (docs/spec/20).
//
// We subscribe on focus and tear down on blur: an app sitting on the Give tab has
// no business holding a socket, and Sunday peak is the moment that matters.

const POLL_INTERVAL = 60_000;

interface FamilyBroadcast {
  table?: string;
  id?: string;
  action?: 'inserted' | 'updated' | 'removed';
  branch_id?: string;
  author_id?: string | null;
}

/**
 * @param branchId the branch channel to join in addition to `family:all`, or null
 *   for a guest who has not chosen one yet.
 * @param blockedAuthorIds authors this member has blocked. A single broadcast
 *   payload is delivered to every subscriber, so it cannot be filtered per
 *   recipient server-side; the client drops events from blocked authors itself
 *   (docs/spec/02). Anonymous payloads carry no author_id and are never dropped,
 *   because there is nothing to match and nothing to leak.
 */
export function useFamilyRealtime(
  branchId: string | null,
  blockedAuthorIds: readonly string[] = [],
) {
  const queryClient = useQueryClient();
  const isFocused = useIsFocused();
  // Join by value, not identity: a caller passing a fresh array literal each
  // render must not tear the socket down and rebuild it every render.
  const blockedKey = [...blockedAuthorIds].sort().join(',');

  useEffect(() => {
    if (!isFocused) return;

    const blocked = new Set(blockedKey ? blockedKey.split(',') : []);
    const invalidate = (payload: FamilyBroadcast) => {
      if (payload.author_id && blocked.has(payload.author_id)) return;
      // Invalidate rather than patch the cache. The feed views apply block
      // filtering and anonymity that the broadcast payload deliberately does not
      // carry, so a refetch is the only way to be sure what we render is what the
      // server would serve. Counts ride along in the payload, but a count is not
      // worth a second source of truth.
      void queryClient.invalidateQueries({ queryKey: ['family'] });
    };

    const topics = ['family:all'];
    if (branchId) topics.push(`family:branch:${branchId}`);

    const channels = topics.map((topic) => {
      const channel = supabase.channel(topic, { config: { private: true } });
      channel.on('broadcast', { event: 'family' }, ({ payload }) => {
        invalidate((payload ?? {}) as FamilyBroadcast);
      });
      void channel.subscribe();
      return channel;
    });

    // The bound. Runs regardless of socket health: if Realtime is up this is
    // nearly free (the queries are fresh and refetch is cheap), and if it is down
    // this is the guarantee.
    const timer = setInterval(() => {
      void queryClient.invalidateQueries({ queryKey: ['family'] });
    }, POLL_INTERVAL);

    return () => {
      clearInterval(timer);
      for (const channel of channels) void supabase.removeChannel(channel);
    };
  }, [isFocused, branchId, blockedKey, queryClient]);
}
