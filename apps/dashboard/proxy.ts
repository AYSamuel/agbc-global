import { type NextRequest } from 'next/server';

import { updateSession } from '@/lib/supabase/proxy';

// Next 16 renamed middleware.ts to proxy.ts. It runs on every matched request, so it
// does exactly two things: refresh the Supabase session, and bounce signed-out visitors
// to /sign-in. Authorization lives in src/server/authorize.ts (docs/spec/17).
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Everything except Next's own static output and image files.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
