import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

import { AUDIO_URL_TTL_SEC } from './audio';

// Minting the playback URL (docs/spec/08 §Media architecture, the posture decision
// taken 2026-08-14). The bucket is private; the row stores an object PATH, and the
// URL is signed for 24 hours when the player opens. Guests mint too: the bucket's
// SELECT policy covers `anon`, and that policy IS the mint permission.

export const SERMON_AUDIO_BUCKET = 'sermon-audio';

/**
 * Deliberately NOT tagged with `PERSIST_META`. Every other read on this screen is
 * mirrored to disk so a cold offline launch still paints, but a signed URL is a
 * bearer credential with an expiry: writing it into AsyncStorage would leave a
 * working key to the object sitting in the sandbox long after the session that
 * minted it, and it would be stale on the read anyway. The path is the durable
 * thing, and the path is already on the persisted sermon row.
 */
export function useSermonAudioUrlQuery(
  sermonId: string,
  audioPath: string | null,
) {
  return useQuery({
    queryKey: ['sermonAudioUrl', sermonId] as const,
    queryFn: async (): Promise<string> => {
      const { data, error } = await supabase.storage
        .from(SERMON_AUDIO_BUCKET)
        .createSignedUrl(audioPath ?? '', AUDIO_URL_TTL_SEC);
      if (error) throw new Error(error.message);
      return data.signedUrl;
    },
    enabled: audioPath !== null,
    // An hour short of the TTL, so a long listen re-mints before the URL it is
    // holding can die rather than after.
    staleTime: (AUDIO_URL_TTL_SEC - 3600) * 1000,
    // One retry only. A mint that fails twice is the error state, and the member
    // is staring at a stopped player while we retry behind their back.
    retry: 1,
  });
}
