import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { ComposeTarget } from '@agbc/shared';

import { supabase } from '@/lib/supabase';

import { PRAYER_SURFACE_KEYS, TESTIMONY_SURFACE_KEYS } from './keys';
import { myPostsKey } from './myPosts';

/**
 * The two things an author can do to their own post from the `...` menu (docs/spec/09
 * §Post actions menu): open it in the composer, and delete it.
 *
 * Both read and write the BASE TABLES rather than the feed views, for the same reason
 * MY-POSTS does: a pending or rejected row is not in a feed, and the author's own row is
 * exactly what "authors read their own" exists for.
 */

export interface EditablePost {
  id: string;
  body: string;
  categoryId: string | null;
  imagePath: string | null;
  isAnonymous: boolean;
  /** `removed` is terminal for the author: the database refuses their edits. */
  status: 'pending' | 'approved' | 'rejected' | 'removed';
}

export function editablePostKey(target: ComposeTarget, id: string) {
  return ['family', 'editable', target, id] as const;
}

/**
 * The row behind "Edit and resubmit", for prefilling the composer.
 *
 * `moderation_note` is not selected and has no field here: members may not read it at
 * all since `20260803140000`, and the column list is where that stays true.
 */
export function useEditablePost(target: ComposeTarget, id: string | null) {
  return useQuery({
    queryKey: editablePostKey(target, id ?? 'none'),
    enabled: id !== null,
    // Always a fresh read. The author is about to overwrite these words, and a cached
    // copy from before a leader's rejection would put the wrong version in the box.
    staleTime: 0,
    gcTime: 0,
    queryFn: async (): Promise<EditablePost | null> => {
      if (id === null) return null;
      const { data, error } =
        target === 'testimony'
          ? await supabase
              .from('testimonies')
              .select('id, body, category_id, image_path, status')
              .eq('id', id)
              .is('deleted_at', null)
              .maybeSingle()
          : await supabase
              .from('prayers')
              .select('id, body, is_anonymous, status')
              .eq('id', id)
              .is('deleted_at', null)
              .maybeSingle();
      if (error) throw new Error(error.message);
      if (data === null) return null;
      return {
        id: data.id,
        body: data.body,
        categoryId: 'category_id' in data ? data.category_id : null,
        imagePath: 'image_path' in data ? data.image_path : null,
        isAnonymous: 'is_anonymous' in data ? data.is_anonymous : false,
        status: data.status,
      };
    },
  });
}

/**
 * Delete, from POST-ACTIONS (frame `DELETE · the confirm behind POST-ACTIONS`).
 *
 * A SOFT delete: `deleted_at`, which is what the feed views filter on and what the
 * realtime trigger broadcasts as a removal, so the post leaves every screen at once.
 * NOT the DELETE verb, even though the author has a policy for it: `reports.testimony_id`
 * and `reports.prayer_id` are `on delete cascade`, so a hard delete would take any report
 * about this post with it, and docs/spec/02 keeps reports for 24 months precisely because
 * removal does not end a safeguarding duty. Deleting your own post must not be a way to
 * erase the record that somebody raised it.
 */
export function useDeletePost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      target,
      id,
    }: {
      target: ComposeTarget;
      id: string;
    }): Promise<void> => {
      const { error } = await supabase
        .from(target === 'testimony' ? 'testimonies' : 'prayers')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: async (_result, { target }) => {
      await Promise.all(
        [
          ...(target === 'testimony'
            ? TESTIMONY_SURFACE_KEYS
            : PRAYER_SURFACE_KEYS),
          myPostsKey(),
        ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
    },
  });
}
