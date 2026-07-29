import { localStack } from './src/test/localStack';

/**
 * Resolves the local Supabase stack ONCE for the whole server project, before any
 * worker starts, and puts it in the environment the app code reads.
 *
 * globalSetup rather than setupFiles on purpose: setupFiles run per test file, in
 * separate workers, so every file would shell out to the Supabase CLI at the same
 * moment and they contend (seen 2026-07-29: three files resolved, the fourth got
 * ENOENT). One call, before the workers exist, and they inherit the result.
 *
 * The app reads its config from the environment exactly as it does under `next dev`
 * (.env.local) and on Vercel, so nothing here is special-casing tests. If CI has already
 * exported the variables, localStack() uses those and never touches the CLI.
 */
export default function setup(): void {
  const stack = localStack();

  process.env.NEXT_PUBLIC_SUPABASE_URL ??= stack.url;
  process.env.NEXT_PUBLIC_SUPABASE_KEY ??= stack.publishableKey;
  process.env.SUPABASE_SECRET_KEY ??= stack.secretKey;
}
