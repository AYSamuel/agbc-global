// Supabase configuration, read once and checked once.
//
// The NEXT_PUBLIC_ names are referenced literally, never through a lookup helper:
// Next inlines them at build time by matching the exact text `process.env.NEXT_PUBLIC_X`,
// so `process.env[name]` would compile to undefined in the browser bundle.

/** Publishable config. Public by design; RLS is the security boundary (docs/spec/02). */
export function publicSupabaseConfig(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_KEY;

  if (!url || !key) {
    throw new Error(
      'Missing Supabase config: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_KEY (see apps/dashboard/.env.example)',
    );
  }

  return { url, key };
}

/**
 * The secret (service-role) key. Server-only: it has no NEXT_PUBLIC_ prefix, so it is
 * absent from the browser bundle, and the caller in admin.ts refuses to run in a browser
 * anyway. Deployed value lives in Vercel's Production scope only (docs/spec/21 §3).
 */
export function secretSupabaseKey(): string {
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!key) {
    throw new Error(
      'Missing Supabase config: set SUPABASE_SECRET_KEY (see apps/dashboard/.env.example)',
    );
  }

  return key;
}
