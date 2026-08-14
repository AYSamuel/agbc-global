import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

import type { PositionSample } from './audio';

// The server half of resume (docs/spec/08, decision 2026-07-20). The device-local
// half shipped with Watch and works for everyone, guests included; this layer is
// the member perk that carries the position between a phone and a tablet.
//
// It is deliberately NOT routed through the write queue. The queue exists for acts
// of intention that must survive being offline (a check-in, a Glory tap): each one
// is a distinct fact the member meant. A playback position is the opposite: one
// value that supersedes itself every ten seconds, where a failed write costs
// nothing because a newer one is already on its way and the device-local copy
// never missed it. Queuing it would flood the queue with writes whose only correct
// resolution is to be thrown away.

interface PositionRow {
  position_sec: number;
  updated_at: string;
}

/**
 * The caller's own row for this sermon. No `profile_id` filter: the table's policy
 * is `profile_id = auth.uid()` for ALL commands, so this select can only ever see
 * one row, and the primary key makes that row unique per sermon.
 */
export function useServerPositionQuery(sermonId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['playbackPosition', sermonId] as const,
    queryFn: async (): Promise<PositionSample | null> => {
      const { data, error } = await supabase
        .from('playback_positions')
        .select('position_sec, updated_at')
        .eq('sermon_id', sermonId)
        .maybeSingle<PositionRow>();
      if (error) throw new Error(error.message);
      if (!data) return null;
      return {
        positionSec: data.position_sec,
        updatedAt: Date.parse(data.updated_at),
      };
    },
    enabled,
    // The open is the only read that matters; nothing on this screen re-reads it.
    staleTime: 60_000,
    retry: 1,
  });
}

/**
 * Fire and forget, by design: see the note at the top of this file. Never throws,
 * so a caller in a status listener or an unmount cleanup cannot take the screen
 * down with it. Returns whether the write landed, for the tests.
 */
export async function saveServerPosition(
  sermonId: string,
  positionSec: number,
): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getSession();
    const profileId = data.session?.user.id;
    // Guests keep the device-local layer and nothing else; that is the whole
    // shape of the feature, not a failure.
    if (!profileId) return false;
    const { error } = await supabase.from('playback_positions').upsert(
      {
        profile_id: profileId,
        sermon_id: sermonId,
        position_sec: Math.floor(positionSec),
      },
      { onConflict: 'profile_id,sermon_id' },
    );
    return !error;
  } catch {
    return false;
  }
}
