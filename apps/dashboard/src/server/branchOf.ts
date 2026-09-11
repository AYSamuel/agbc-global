import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@agbc/shared/database';

import type { QueueKind } from './moderationQueue';

/**
 * The branch a piece of content belongs to, read from the row itself (W2.7, extracted W4.13).
 *
 * A branch id arriving in a form field would let the caller nominate their own authority,
 * which is the exact hole `17` forbids and the CI probes hunt for. So every moderation path
 * reads it here, and NONE of them takes it as an argument: a function whose safety depends on
 * what its caller passed is a function the next caller gets wrong.
 *
 * Which is why acting on a report used to cost two reads of one row. `moderateItem()` reads
 * the branch to authorize the content decision, and `markReportsActioned()` reads it again to
 * authorize closing the reports, and both are right to. The memo below is how they share the
 * answer without either of them trusting the other: the read is cached against the CLIENT, so
 * it is per request in exactly the way `authorize()`'s session memo already is (a client is
 * created fresh for every request in every context this app has), and a second caller in the
 * same request gets the same promise rather than a second round trip.
 *
 * Safe to cache because nothing inside a request moves a row between branches: the moderation
 * update writes status and the reason columns, never `branch_id`.
 */

type Client = SupabaseClient<Database>;

const branchCache = new WeakMap<Client, Map<string, Promise<string | null>>>();

export async function branchOf(
  supabase: Client,
  kind: QueueKind,
  id: string,
): Promise<string | null> {
  let perClient = branchCache.get(supabase);
  if (!perClient) {
    perClient = new Map();
    branchCache.set(supabase, perClient);
  }

  const key = `${kind}:${id}`;
  const cached = perClient.get(key);
  if (cached) return await cached;

  const pending = read(supabase, kind, id);
  perClient.set(key, pending);
  return await pending;
}

async function read(
  supabase: Client,
  kind: QueueKind,
  id: string,
): Promise<string | null> {
  const { data } = await supabase
    .from(kind === 'prayer' ? 'prayers' : 'testimonies')
    .select('branch_id')
    .eq('id', id)
    .maybeSingle();
  return data?.branch_id ?? null;
}
