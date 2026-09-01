import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@agbc/shared/database';

/**
 * The two name lookups every moderation surface needs, in one place.
 *
 * Both were written inside `moderationQueue.ts` at W2.7 slice 2 and lifted here when the
 * reports inbox needed the same two. Same rules as before: read through the CALLER's own
 * client, so RLS is what grants them, and an id the caller may not read simply returns no
 * row rather than leaking a name.
 *
 * Each is bounded by the number of DISTINCT ids on screen rather than by the row count,
 * which is why two small queries beat a join through a view PostgREST cannot embed.
 */

type Client = SupabaseClient<Database>;

export async function lookupBranchNames(
  supabase: Client,
  ids: (string | null)[],
): Promise<Map<string, string>> {
  const unique = distinct(ids);
  if (unique.length === 0) return new Map();

  const { data } = await supabase
    .from('branches')
    .select('id, name')
    .in('id', unique);
  return new Map((data ?? []).map((branch) => [branch.id, branch.name]));
}

export async function lookupAuthorNames(
  supabase: Client,
  ids: (string | null)[],
): Promise<Map<string, string>> {
  const unique = distinct(ids);
  if (unique.length === 0) return new Map();

  const { data } = await supabase
    .from('profiles')
    .select('id, display_name')
    .in('id', unique);
  // A DELETED ACCOUNT HAS NO NAME (W4.5): `display_name` went nullable so the erasure could
  // strip it, and a deleted profile is stripped rather than removed, because the audit trail
  // still points at its id. Such a row is dropped here rather than carried as a null, so it
  // reaches every caller as a MISSING entry instead of an empty one. That matters because
  // every caller already has to handle a missing name (an id can name a profile this query
  // could not read), so the deleted case arrives on a path that is already correct and
  // already worded, rather than as a second kind of nothing each of them has to learn.
  return new Map(
    (data ?? []).flatMap((profile) =>
      profile.display_name === null
        ? []
        : [[profile.id, profile.display_name] as const],
    ),
  );
}

function distinct(ids: (string | null)[]): string[] {
  return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}
