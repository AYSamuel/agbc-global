import { useQuery } from '@tanstack/react-query';

import { TESTIMONY_PHOTO_BUCKET } from '@agbc/shared';

import { supabase } from '@/lib/supabase';

// Testimony photos live in a PRIVATE bucket, so displaying one means minting a
// short-lived signed URL (docs/spec/02 §Storage). Who is allowed to mint it is
// decided by the storage SELECT policy, not by this hook: a guest gets a URL for
// an approved testimony's photo, nobody outside the author and their branch
// leaders gets one for a pending photo, and the failure looks the same either
// way. That is why there is no permission check here to get wrong.
//
// Deliberately NOT persisted to AsyncStorage (see lib/queryMeta): a signed URL is
// a time-limited capability, and writing one to disk would leave a readable link
// to a member's photo lying around after the app is closed.

/** Signed-URL lifetime. Long enough to scroll a feed and open a detail screen,
 * short enough that a link copied out of the app dies quickly. */
const TTL_SECONDS = 600;

/** Refetch a minute before expiry so a slow scroll never renders a dead link. */
const STALE_MS = (TTL_SECONDS - 60) * 1000;

export function testimonyPhotoQueryKey(path: string) {
  return ['family', 'photo', path] as const;
}

/**
 * @param path object path from `testimonies.image_path`, or null for a testimony
 * with no photo (the hook then simply never runs).
 */
export function useSignedPhotoUrl(path: string | null) {
  return useQuery({
    queryKey: testimonyPhotoQueryKey(path ?? ''),
    enabled: path !== null,
    staleTime: STALE_MS,
    gcTime: STALE_MS,
    queryFn: async (): Promise<string | null> => {
      if (path === null) return null;
      const { data, error } = await supabase.storage
        .from(TESTIMONY_PHOTO_BUCKET)
        .createSignedUrl(path, TTL_SECONDS);
      // A refusal is indistinguishable from a missing object on purpose, and
      // both mean the same thing to the card: show no photo, show no error. The
      // testimony's words are the content; the image is an enhancement.
      if (error) return null;
      return data.signedUrl;
    },
  });
}
