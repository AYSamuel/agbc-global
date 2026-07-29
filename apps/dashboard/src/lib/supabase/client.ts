import { createBrowserClient } from '@supabase/ssr';

import type { Database } from '@agbc/shared/database';

import { publicSupabaseConfig } from './env';

/**
 * The browser client. Used only where the browser genuinely has to talk to Supabase
 * Auth directly: requesting an email OTP, verifying it, and running the TOTP enrol and
 * challenge ceremonies, all of which write the session cookies this app's server side
 * then reads.
 *
 * Nothing authorizes off this client. UI hiding is not authorization
 * (~/.claude/standards/frontend.md); every privileged read and write goes through
 * authorize() on the server.
 *
 * createBrowserClient is a singleton internally, so calling this per component is free.
 */
export function createClient() {
  const { url, key } = publicSupabaseConfig();
  return createBrowserClient<Database>(url, key);
}
