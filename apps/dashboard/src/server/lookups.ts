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
  return new Map(
    (data ?? []).map((profile) => [profile.id, profile.display_name]),
  );
}

function distinct(ids: (string | null)[]): string[] {
  return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}
