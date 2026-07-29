import { createRouteClient } from '@/lib/supabase/server';
import { isSameOrigin } from '@/server/sameOrigin';

/**
 * Sign out. A route handler rather than a Server Action, on purpose: it is the first
 * example of the shape every moderation route in slices 2 and 3 will take, and a route
 * handler is a plain function from Request to Response, which is what lets the tests
 * import it and call it directly (docs/spec/21 §4's per-route probes).
 *
 * POST only, and same-origin only. A GET sign-out is triggerable by any image tag on
 * any page on the internet.
 */
export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) {
    return new Response(null, { status: 403 });
  }

  const { supabase, commit } = createRouteClient(request);

  // Server-side invalidation, not just a cleared cookie: the refresh token is revoked,
  // so a copy of the cookie taken beforehand is worthless.
  await supabase.auth.signOut();

  return commit(
    new Response(null, {
      // 303 so the browser follows with a GET; a 302 after POST is ambiguous.
      status: 303,
      headers: { location: '/sign-in' },
    }),
  );
}
