import { useQuery } from '@tanstack/react-query';

import { queryClient } from '@/lib/queryPersist';
import { supabase } from '@/lib/supabase';
import { pushWrite, usePendingWrite } from '@/lib/writeQueue';

import { SERMON_FIELDS, type SermonSummary } from './queries';

// My List (docs/spec/08 §MY-LIST, W3.1 slice 4): whether a message is saved,
// and the list of everything that is. The same shape as an RSVP (rsvp.ts): the
// state is patched into the cache the moment the member taps, the wish rides
// the write queue, and the screen reads pending-over-server so a tap on the
// Underground stays saved until the signal comes back.
//
// Not persisted to disk: a list is a fact about a person, and `isPersonalQuery`
// drops anything unflagged when the session ends, so the next member on a
// shared phone never meets the last one's list.

export function savedQueryKey(sermonId: string) {
  return ['saved', sermonId] as const;
}

export const savedListQueryKey = ['savedList'] as const;

/** One row of MY-LIST: when it was saved orders the list; the message renders it. */
export interface SavedListItem {
  savedAt: string;
  sermon: SermonSummary;
}

/** Whether THIS member saved THIS message. No profile filter: RLS already
 * scopes the table to the caller's own rows (the 20260815120000 posture). */
export function useSavedQuery(sermonId: string, enabled: boolean) {
  return useQuery({
    queryKey: savedQueryKey(sermonId),
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase
        .from('saved_items')
        .select('sermon_id')
        .eq('sermon_id', sermonId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data !== null;
    },
    enabled,
    staleTime: 5 * 60_000,
  });
}

export function useSavedListQuery(enabled: boolean) {
  return useQuery({
    queryKey: savedListQueryKey,
    queryFn: async (): Promise<SavedListItem[]> => {
      // Unavailable sermons are deliberately included: 08's rot handling keeps
      // them listed greyed with a remove action, never silently vanished.
      const { data, error } = await supabase
        .from('saved_items')
        .select(`created_at, sermon:sermons(${SERMON_FIELDS})`)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      // `sermon` embeds through the sermon_id FK, which the generated types
      // already know is to-one, so the row needs no reshaping beyond naming.
      return data.map((row) => ({
        savedAt: row.created_at,
        sermon: row.sermon,
      }));
    },
    enabled,
    staleTime: 5 * 60_000,
  });
}

/** A queued wish the server refused: only it can say what is true now. */
export function invalidateSaved(sermonId: string): void {
  void queryClient.invalidateQueries({ queryKey: savedQueryKey(sermonId) });
  void queryClient.invalidateQueries({ queryKey: savedListQueryKey });
}

/** The sermon, if any cached read has seen it: the detail row the player
 * loaded, a rail, a search page. Only consulted to patch a fresh save into an
 * already-fetched list, so a miss costs a refetch, never a wrong row. */
function findCachedSermon(sermonId: string): SermonSummary | null {
  const entries = queryClient.getQueriesData<
    SermonSummary[] | SermonSummary | null
  >({ queryKey: ['sermons'] });
  for (const [, data] of entries) {
    if (!data) continue;
    if (Array.isArray(data)) {
      const hit = data.find((sermon) => sermon.id === sermonId);
      if (hit) return hit;
    } else if (data.id === sermonId) {
      return data;
    }
  }
  return null;
}

/**
 * The optimistic half, in one place for both the bookmark and the list so
 * there is no second render to get wrong (the W2.4 rule: one visible fact,
 * one owner).
 */
export function applySavedToCache(sermonId: string, saved: boolean): void {
  queryClient.setQueryData<boolean>(savedQueryKey(sermonId), saved);
  queryClient.setQueryData<SavedListItem[]>(savedListQueryKey, (current) => {
    if (current === undefined) return current;
    if (!saved) return current.filter((item) => item.sermon.id !== sermonId);
    if (current.some((item) => item.sermon.id === sermonId)) return current;
    const sermon = findCachedSermon(sermonId);
    // Nothing cached to draw the row from (a save replayed long after the
    // screens that knew the message are gone): the next fetch has it, and the
    // bookmark itself is already right.
    if (!sermon) return current;
    return [{ savedAt: new Date().toISOString(), sermon }, ...current];
  });
}

/**
 * Save or unsave: show it, then queue it. Not a hook, so the gate-return
 * executor can call it too: a save made before signing in and one made after
 * are the same act (docs/spec/03 rule 9).
 */
export function queueSave(sermonId: string, saved: boolean): void {
  applySavedToCache(sermonId, saved);
  pushWrite('saved', sermonId, saved ? 'on' : 'off');
}

/**
 * What the bookmark should show: the queued wish when there is one, the
 * server's answer otherwise (docs/spec/01 §8: the queue IS the app's record of
 * an unsent intention).
 */
export function useSavedState(sermonId: string, serverSaved: boolean): boolean {
  const pending = usePendingWrite('saved', sermonId);
  return pending === undefined ? serverSaved : pending === 'on';
}
