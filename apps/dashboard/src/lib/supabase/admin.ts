import { createClient } from '@supabase/supabase-js';

import type { Database } from '@agbc/shared/database';

import { publicSupabaseConfig, secretSupabaseKey } from './env';

/**
 * The service-role client. It bypasses RLS entirely, which is exactly why it lives in
 * one file that no component imports: with this client, the route's own code IS the
 * authorization layer, and nothing behind it gets a second opinion from the database
 * (docs/spec/17 §Platform).
 *
 * The rule for using it, from `17`: prefer the caller's own JWT plus RLS wherever
 * possible, and reserve this for operations that genuinely have no RLS path, such as a
 * leader reading another member's PENDING testimony in the moderation queue. Every such
 * call sits AFTER an awaited authorize().
 *
 * Nothing in slice 1 needs it yet; it is here so the seam exists before the first
 * moderation route does, rather than being improvised next to that route.
 */
export function createAdminClient() {
  if (typeof window !== 'undefined') {
    // Belt and braces. SUPABASE_SECRET_KEY has no NEXT_PUBLIC_ prefix, so it is already
    // undefined in the browser bundle and the call below would fail; this turns a
    // confusing "missing config" into the real message.
    throw new Error(
      'createAdminClient() was called in the browser. The service-role key is server-only.',
    );
  }

  const { url } = publicSupabaseConfig();

  return createClient<Database>(url, secretSupabaseKey(), {
    auth: {
      // A service-role client has no user and must never persist or refresh one.
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
