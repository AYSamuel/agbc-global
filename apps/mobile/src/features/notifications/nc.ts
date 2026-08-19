// The notification centre's reads and its two writes (docs/spec/15, W3.3 slice 5).
//
// The log is service-role written; the ONE thing a member may write is `read_at`,
// granted per column (20260816120000). So everything here is a read plus two
// scoped updates, and the request shapes below were driven through PostgREST
// against the local stack before the screen existed (the slice-4 convention:
// a privilege proven in pgTAP is not yet proven through PostgREST).
//
// CURSOR, NOT OFFSET (docs/spec/15: ~30 a page on `(created_at desc, id desc)`).
// An offset page shifts under the reader whenever a new notification arrives;
// a keyset filter (`created_at` strictly older, or same-instant rows with a
// smaller id) never re-serves a row it already gave. The id tiebreak exists
// because two rows CAN share a timestamp (a fan-out writes them in one
// transaction).
//
// Personal data: none of these queries carries PERSIST_META, so nothing lands in
// unencrypted storage and sign-out drops it all (lib/queryMeta.ts).

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';

import { queryClient } from '@/lib/queryPersist';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/state/auth';

export const PAGE_SIZE = 30;

export interface NotificationRow {
  id: string;
  type: string;
  templateKey: string | null;
  params: Record<string, string | number> | null;
  /** Pre-rendered broadcast rows only (W3.5); template rows render client-side. */
  title: string | null;
  body: string | null;
  deepLink: string;
  readAt: string | null;
  createdAt: string;
}

interface DbRow {
  id: string;
  type: string;
  template_key: string | null;
  params: Record<string, string | number> | null;
  title: string | null;
  body: string | null;
  deep_link: string;
  read_at: string | null;
  created_at: string;
}

const COLUMNS =
  'id, type, template_key, params, title, body, deep_link, read_at, created_at';

function toRow(row: DbRow): NotificationRow {
  return {
    id: row.id,
    type: row.type,
    templateKey: row.template_key,
    params: row.params,
    title: row.title,
    body: row.body,
    deepLink: row.deep_link,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

/** Keyed by member (the profile-query reasoning: nothing clears the cache on sign-out). */
export function ncListKey(member: string | null) {
  return ['notifications', 'list', member ?? 'none'] as const;
}
export function ncUnreadKey(member: string | null) {
  return ['notifications', 'unread', member ?? 'none'] as const;
}

interface Page {
  rows: NotificationRow[];
  /** Absent on the last page; the screen shows the retention footer there. */
  nextCursor: { createdAt: string; id: string } | null;
}

async function fetchPage(cursor: Page['nextCursor']): Promise<Page> {
  let query = supabase
    .from('notifications')
    .select(COLUMNS)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PAGE_SIZE);

  if (cursor !== null) {
    // Strictly-older, with the id tiebreak for same-instant rows. PostgREST's
    // `or` cannot nest an `and` through supabase-js filters, so the expression
    // is written out; both halves are values we produced, not member input.
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
    );
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = (data as DbRow[]).map(toRow);
  const last = rows.at(-1);
  return {
    rows,
    nextCursor:
      rows.length < PAGE_SIZE || last === undefined
        ? null
        : { createdAt: last.createdAt, id: last.id },
  };
}

export function useNotificationsList(enabled: boolean) {
  const member = useAuthStore((state) => state.email);
  return useInfiniteQuery({
    queryKey: ncListKey(member),
    enabled: enabled && member !== null,
    initialPageParam: null as Page['nextCursor'],
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
}

/**
 * The unread count behind the Home bell's dot and the MORE row's number.
 * `head: true`: the count travels alone, no rows.
 */
export function useUnreadCount(enabled: boolean) {
  const member = useAuthStore((state) => state.email);
  return useQuery({
    queryKey: ncUnreadKey(member),
    enabled: enabled && member !== null,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .is('read_at', null);
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
  });
}

/** The badge never grows past two digits (docs/spec/15: caps at "99+"). */
export function unreadLabel(count: number): string {
  return count > 99 ? '99+' : String(count);
}

/** `id === null` means every unread row (the mark-all path). */
function markPagesRead(
  data: InfiniteData<Page> | undefined,
  id: string | null,
  at: string,
): InfiniteData<Page> | undefined {
  if (data === undefined) return undefined;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      rows: page.rows.map((row) =>
        row.readAt === null && (id === null || row.id === id)
          ? { ...row, readAt: at }
          : row,
      ),
    })),
  };
}

/**
 * Mark one notification read, from the centre's tap. Optimistic: the row's
 * highlight and the badge answer the finger, and the server catches up.
 * `read_at` is the row's ONE member-writable column, so the update names
 * exactly that and nothing else.
 */
export function useMarkRead() {
  const client = useQueryClient();
  const member = useAuthStore((state) => state.email);
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', id)
        .is('read_at', null);
      if (error) throw new Error(error.message);
    },
    onMutate: (id: string) => {
      const now = new Date().toISOString();
      client.setQueryData<InfiniteData<Page>>(ncListKey(member), (data) =>
        markPagesRead(data, id, now),
      );
      client.setQueryData<number>(ncUnreadKey(member), (count) =>
        count === undefined ? undefined : Math.max(0, count - 1),
      );
    },
    onSettled: () => {
      // The server's truth wins either way; a failed write un-greys the row.
      void client.invalidateQueries({ queryKey: ncUnreadKey(member) });
      void client.invalidateQueries({ queryKey: ncListKey(member) });
    },
  });
}

/** The header's "Mark all read": one scoped update, RLS keeps it to own rows. */
export function useMarkAllRead() {
  const client = useQueryClient();
  const member = useAuthStore((state) => state.email);
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .is('read_at', null);
      if (error) throw new Error(error.message);
    },
    onMutate: () => {
      const now = new Date().toISOString();
      client.setQueryData<InfiniteData<Page>>(ncListKey(member), (data) =>
        markPagesRead(data, null, now),
      );
      client.setQueryData<number>(ncUnreadKey(member), (count) =>
        count === undefined ? undefined : 0,
      );
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ncUnreadKey(member) });
      void client.invalidateQueries({ queryKey: ncListKey(member) });
    },
  });
}

/**
 * The tap path's mark-read (useNotifications.ts `open()`), which runs outside
 * any component, so it talks to the app's query-client singleton directly.
 * Fire-and-forget on purpose: a failed mark-read must never delay or break the
 * navigation the member actually asked for, and the next NC read heals it.
 */
export function markReadFromTap(id: string): void {
  const member = useAuthStore.getState().email;
  void supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .is('read_at', null)
    .then(({ error }) => {
      if (error) return; // Healed by the next read; never user-facing.
      void queryClient.invalidateQueries({ queryKey: ncUnreadKey(member) });
      void queryClient.invalidateQueries({ queryKey: ncListKey(member) });
    });
}
