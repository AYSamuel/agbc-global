import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

import type { Database } from '@agbc/shared/database';

import { publicSupabaseConfig } from './env';

/** Paths a signed-out visitor is allowed to reach. */
const PUBLIC_PREFIXES = ['/sign-in', '/auth'];

/**
 * Refreshes the Supabase session on every request, and optimistically redirects a
 * signed-out visitor to /sign-in.
 *
 * What this is NOT: the authorization layer. Next's own docs are explicit that this
 * layer "should not be your only line of defense in protecting your data" because it
 * runs on prefetched routes and stays deliberately cookie-shallow. Role, branch and
 * aal2 are decided in src/server/authorize.ts, next to the data. This only saves a
 * signed-out visitor from watching a page render before it bounces them.
 *
 * getClaims() here rather than getUser(): this runs on every request including
 * prefetches, and a local signature check is the right cost for a redirect hint.
 * authorize() pays for the round trip that catches a revoked session.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const { url, key } = publicSupabaseConfig();

  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        // Cache-Control / Expires / Pragma, so a CDN cannot cache one caller's
        // Set-Cookie and hand their session to the next visitor (@supabase/ssr passes
        // these from v0.10; see the SSR advanced guide).
        for (const [header, value] of Object.entries(headers)) {
          response.headers.set(header, value);
        }
      },
    },
  });

  // Nothing between createServerClient and this call: anything that returns early in
  // between skips the token refresh and signs people out at random.
  const { data } = await supabase.auth.getClaims();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );

  if (!data?.claims && !isPublic) {
    const target = request.nextUrl.clone();
    target.pathname = '/sign-in';
    // So the sign-in flow can return them to where they were headed. Only ever a
    // same-origin path, never a caller-supplied absolute URL (open-redirect).
    target.searchParams.set('next', path);
    return NextResponse.redirect(target);
  }

  return response;
}
