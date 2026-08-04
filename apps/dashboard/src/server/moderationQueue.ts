import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@agbc/shared/database';

import type { Caller } from './authorize';
import { lookupAuthorNames, lookupBranchNames } from './lookups';

/**
 * Reading the moderation queue (docs/spec/17 §1, W2.7 slice 2).
 *
 * Through the CALLER's own client, never service-role. W1.5 already gave moderators an
 * RLS path to pending rows (`moderators read testimonies in their branch`, the same for
 * prayers, both on `can_moderate_branch()` which reads the profiles table rather than a
 * JWT claim). So the database scopes this read independently of anything here: if the
 * route layer were ever bypassed, a leader still gets nothing from another branch.
 *
 * Photos work the same way. `can_read_testimony_photo()` lets a branch's moderators mint
 * a signed URL for a PENDING photo, so the reviewer sees the image they are judging
 * without the object ever becoming public.
 */

/** How long a queue photo's signed URL lives. Long enough to review, short enough that a
 *  copied link is not a lasting leak of unapproved content. */
const PHOTO_URL_TTL_SECONDS = 10 * 60;

export type QueueKind = 'testimony' | 'prayer';

export interface QueueItem {
  id: string;
  kind: QueueKind;
  branchId: string;
  branchName: string;
  body: string;
  language: string;
  createdAt: string;
  /** The version the reviewer is looking at, carried into slice 3's compare-and-set. */
  updatedAt: string;
  /** Signed URL, or null when the item has no photo. */
  photoUrl: string | null;
  isAnonymous: boolean;
  isAnsweredPrayer: boolean;
  /** Null for anonymous prayers: the promise made in the app reaches the dashboard. */
  authorName: string | null;
}

export interface QueueFilters {
  kind?: QueueKind;
  /** Admin-only branch narrowing. A leader passing this cannot widen their scope: the
   *  database refuses rows outside their branch regardless of what arrives here. */
  branchId?: string;
}

export interface Queue {
  items: QueueItem[];
  /**
   * The instant this queue was read at. Returned rather than recomputed by the caller so
   * the overdue count and every "2 days ago" on screen describe the SAME moment. Two
   * Date.now() calls a few milliseconds apart is a trivial difference, but it is still
   * one displayed fact with two owners, and that is the shape of bug this project keeps
   * paying for.
   */
  readAt: number;
  counts: { all: number; testimony: number; prayer: number };
  /** Items waiting longer than the 48h escalation threshold (`17` §1). */
  overdue: number;
}

export const OVERDUE_AFTER_MS = 48 * 60 * 60 * 1000;

type Client = SupabaseClient<Database>;

export async function loadModerationQueue(
  supabase: Client,
  caller: Caller,
  filters: QueueFilters = {},
  now: number = Date.now(),
): Promise<Queue> {
  let query = supabase
    .from('moderation_queue')
    .select(
      'id, kind, branch_id, body, language, created_at, updated_at, image_path, is_anonymous, is_answered_prayer, author_id',
    )
    // Oldest first. A queue is work to be cleared, and the 48h escalation (`17` §1)
    // exists precisely because the oldest item is the one at risk of being forgotten.
    // Newest-first would bury it.
    .order('created_at', { ascending: true });

  if (filters.kind) query = query.eq('kind', filters.kind);
  if (filters.branchId) query = query.eq('branch_id', filters.branchId);

  const { data, error } = await query;
  if (error)
    throw new Error(`could not read the moderation queue: ${error.message}`);

  const rows = data;

  // Branch and author names come from separate tables. Two small lookups rather than a
  // join, because the view is a union and PostgREST cannot embed through it; both are
  // bounded by the number of DISTINCT ids on screen, not by the row count.
  const [branchNames, authorNames] = await Promise.all([
    lookupBranchNames(
      supabase,
      rows.map((row) => row.branch_id),
    ),
    lookupAuthorNames(
      supabase,
      rows.map((row) => row.author_id),
    ),
  ]);
  const photoUrls = await signPhotos(
    supabase,
    rows.map((row) => row.image_path),
  );

  const items: QueueItem[] = rows.map((row) => ({
    // The view's columns are all nullable in the generated types (Postgres cannot prove
    // otherwise through a union), but the base tables declare them NOT NULL. Falling
    // back rather than asserting non-null keeps a surprise from becoming a crash.
    id: row.id ?? '',
    kind: row.kind === 'prayer' ? 'prayer' : 'testimony',
    branchId: row.branch_id ?? '',
    branchName: branchNames.get(row.branch_id ?? '') ?? 'Unknown branch',
    body: row.body ?? '',
    language: row.language ?? 'en',
    createdAt: row.created_at ?? '',
    updatedAt: row.updated_at ?? '',
    photoUrl: row.image_path ? (photoUrls.get(row.image_path) ?? null) : null,
    isAnonymous: row.is_anonymous ?? false,
    isAnsweredPrayer: row.is_answered_prayer ?? false,
    authorName: row.author_id ? (authorNames.get(row.author_id) ?? null) : null,
  }));

  return {
    items,
    readAt: now,
    counts: {
      all: items.length,
      testimony: items.filter((item) => item.kind === 'testimony').length,
      prayer: items.filter((item) => item.kind === 'prayer').length,
    },
    overdue: items.filter(
      (item) => now - new Date(item.createdAt).getTime() > OVERDUE_AFTER_MS,
    ).length,
  };
}

async function signPhotos(
  supabase: Client,
  paths: (string | null)[],
): Promise<Map<string, string>> {
  const unique = [
    ...new Set(paths.filter((path): path is string => Boolean(path))),
  ];
  if (unique.length === 0) return new Map();

  const { data, error } = await supabase.storage
    .from('testimony-photos')
    .createSignedUrls(unique, PHOTO_URL_TTL_SECONDS);

  // A photo that will not sign must not take the whole queue down with it: the reviewer
  // can still read the words and act. The item renders without its image.
  if (error) return new Map();

  const signed = new Map<string, string>();
  for (const entry of data) {
    if (entry.path && entry.signedUrl) signed.set(entry.path, entry.signedUrl);
  }
  return signed;
}
