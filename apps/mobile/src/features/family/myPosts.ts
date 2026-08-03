import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

/**
 * The author's own pipeline (docs/spec/09 §MY-POSTS, frame `MY-POSTS · author pipeline`).
 *
 * THE ONE READ IN THIS APP THAT DOES NOT GO THROUGH A FEED VIEW, and the exception is the
 * whole point of the screen: `testimony_feed` and `prayer_feed` filter `status='approved'`,
 * so they cannot show anyone their own pending, rejected or removed row. The base tables can,
 * because "authors read their own" is a policy on them (family migration, W1.5).
 *
 * Columns are named one by one, as everywhere else, and here it is load-bearing rather than
 * tidy: `moderation_note` is the private record of why something was removed and members may
 * not read it at all since `20260803140000`. A `select('*')` on this screen would have been
 * the request that found that out the hard way.
 *
 * Two queries rather than one, because they are two tables. They are merged here, newest
 * first, so the reader sees one pipeline rather than two lists of the same thing.
 */

export type PostKind = 'testimony' | 'prayer';

/** Mirrors the `content_status` enum. `deleted` never reaches here: those rows are filtered. */
export type PostStatus = 'pending' | 'approved' | 'rejected' | 'removed';

export interface MyPost {
  id: string;
  kind: PostKind;
  body: string;
  status: PostStatus;
  /** The leader's words to the author. Present on `rejected`, and only there. */
  rejectionReason: string | null;
  createdAt: string;
  /** Testimonies only: the object path, for the thumbnail the card does not draw yet. */
  imagePath: string | null;
  /** Prayers only: set once the author marked it answered (docs/spec/09 loop, W2.5). */
  answeredAt: string | null;
}

const TESTIMONY_FIELDS =
  'id, body, status, rejection_reason, created_at, image_path';
const PRAYER_FIELDS =
  'id, body, status, rejection_reason, created_at, answered_at';

export function myPostsKey() {
  return ['family', 'my-posts'] as const;
}

export function useMyPostsQuery(enabled: boolean) {
  return useQuery({
    queryKey: myPostsKey(),
    queryFn: fetchMyPosts,
    // No `meta: PERSIST_META`. A member's own pending and rejected rows are the most
    // personal thing this app holds about them, and persisting them would leave the
    // rejection reason on disk after sign-out; the four surfaces that do persist are all
    // public content (docs/spec/20).
    enabled,
  });
}

export async function fetchMyPosts(): Promise<MyPost[]> {
  // RLS answers "whose posts": the policies match on `auth.uid()`, so there is no author
  // filter to write here and no author id for a caller to tamper with.
  const [testimonies, prayers] = await Promise.all([
    supabase
      .from('testimonies')
      .select(TESTIMONY_FIELDS)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('prayers')
      .select(PRAYER_FIELDS)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(100),
  ]);

  if (testimonies.error) throw new Error(testimonies.error.message);
  if (prayers.error) throw new Error(prayers.error.message);

  return mergeNewestFirst(
    testimonies.data.map((row): MyPost => ({
      id: row.id,
      kind: 'testimony',
      body: row.body,
      status: row.status,
      rejectionReason: row.rejection_reason,
      createdAt: row.created_at,
      imagePath: row.image_path,
      answeredAt: null,
    })),
    prayers.data.map((row): MyPost => ({
      id: row.id,
      kind: 'prayer',
      body: row.body,
      status: row.status,
      rejectionReason: row.rejection_reason,
      createdAt: row.created_at,
      imagePath: null,
      answeredAt: row.answered_at,
    })),
  );
}

/**
 * One pipeline out of two tables, newest first.
 *
 * Exported for its own test: this is the only logic on the screen, and "a prayer and a
 * testimony posted the same afternoon interleave correctly" is not a thing a render test
 * would notice going wrong.
 */
export function mergeNewestFirst(
  testimonies: MyPost[],
  prayers: MyPost[],
): MyPost[] {
  return [...testimonies, ...prayers].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}
